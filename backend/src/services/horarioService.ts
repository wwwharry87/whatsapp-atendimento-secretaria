// src/services/horarioService.ts
import { AppDataSource } from "../database/data-source";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";
import { Cliente } from "../entities/Cliente";

// ====================== CACHE (TTL curto) ======================

type CacheEntry = {
  expiresAt: number;
  registros: HorarioAtendimento[];
  source: "DEPARTAMENTO" | "GERAL" | "NONE";
};

const CACHE_TTL_MS = 60 * 1000; // 60s (ajustável)
const horariosCache = new Map<string, CacheEntry>();

function cacheKey(idcliente: number, departamentoId?: number | null) {
  return `${idcliente}::${departamentoId ?? "GERAL"}`;
}

export function clearHorarioCache() {
  horariosCache.clear();
}

// ====================== CLIENTE (APENAS FALLBACK) ======================

let defaultClienteIdCache: number | null = null;

async function getDefaultClienteId(): Promise<number> {
  if (defaultClienteIdCache !== null) return defaultClienteIdCache;

  const repo = AppDataSource.getRepository(Cliente);

  let cliente: Cliente | null = null;

  try {
    cliente = await repo.findOne({
      where: { ativo: true as any },
      order: { id: "ASC" as any },
    });
  } catch (err) {
    console.log(
      "[HORARIO] Erro ao filtrar clientes por ativo (talvez a coluna não exista).",
      err
    );
  }

  if (!cliente) {
    cliente = await repo.findOne({ order: { id: "ASC" as any } });
  }

  if (!cliente) {
    throw new Error(
      "Nenhum cliente encontrado na tabela 'clientes'. Cadastre pelo menos um registro."
    );
  }

  defaultClienteIdCache = cliente.id;
  return defaultClienteIdCache;
}

async function resolveEffectiveClienteId(idcliente?: number): Promise<number> {
  // Ideal: SEMPRE passar idcliente.
  // Mantemos fallback apenas pra não quebrar chamadas antigas.
  if (typeof idcliente === "number" && Number.isFinite(idcliente) && idcliente > 0) {
    return idcliente;
  }

  const fallback = await getDefaultClienteId();
  console.warn("[HORARIO] idcliente ausente. Usando fallback cliente=", fallback);
  return fallback;
}

// ====================== HORÁRIO (TIMEZONE seguro) ======================

const WEEKDAY_MAP: Record<string, string> = {
  Sun: "DOM",
  Mon: "SEG",
  Tue: "TER",
  Wed: "QUA",
  Thu: "QUI",
  Fri: "SEX",
  Sat: "SAB",
};

function getDefaultTimeZone(): string {
  return (process.env.DEFAULT_TIMEZONE || "America/Fortaleza").trim() || "America/Fortaleza";
}

/**
 * Retorna horário/dia no timezone configurado
 * Obs: o Date "agoraBR" aqui é o Date real do servidor, mas as partes (hora/min/dia)
 * são calculadas via Intl no timezone correto.
 */
function getNowInTimeZone() {
  const now = new Date();
  const timeZone = getDefaultTimeZone();

  // Usar Intl com timeZone para extrair partes confiáveis
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value || "00";
  const minStr = parts.find((p) => p.type === "minute")?.value || "00";

  const hora = Number(hourStr);
  const minuto = Number(minStr);
  const minutosDia = hora * 60 + minuto;
  const diaCodigo = WEEKDAY_MAP[wd] ?? "DOM";

  // diaSemana numérico (0-6) não é essencial, mas mantemos compatível
  const diaSemana =
    diaCodigo === "DOM"
      ? 0
      : diaCodigo === "SEG"
      ? 1
      : diaCodigo === "TER"
      ? 2
      : diaCodigo === "QUA"
      ? 3
      : diaCodigo === "QUI"
      ? 4
      : diaCodigo === "SEX"
      ? 5
      : 6;

  return { agoraBR: now, hora, minuto, minutosDia, diaSemana, diaCodigo, timeZone };
}

export function getSaudacaoPorHorario(): string {
  const { hora } = getNowInTimeZone();
  if (hora >= 4 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Regra padrão segura: Seg–Sex 08:00–18:00
 */
function isOutOfBusinessHoursFallback(): boolean {
  const { diaSemana, hora } = getNowInTimeZone();
  if (diaSemana === 0 || diaSemana === 6) return true; // domingo/sábado
  if (hora < 8 || hora >= 18) return true;
  return false;
}

// ====================== FETCH (com cache) ======================

async function getHorariosAtivos(idcliente: number, departamentoId?: number | null) {
  const key = cacheKey(idcliente, departamentoId);
  const now = Date.now();

  const cached = horariosCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const horarioRepo = AppDataSource.getRepository(HorarioAtendimento);

  // 1) horário específico do departamento
  if (departamentoId != null) {
    const depRegs = await horarioRepo.find({
      where: {
        idcliente: idcliente as any,
        departamentoId: departamentoId as any,
        ativo: true as any,
      },
      order: { id: "ASC" as any },
    });

    if (depRegs.length > 0) {
      const entry: CacheEntry = {
        expiresAt: now + CACHE_TTL_MS,
        registros: depRegs,
        source: "DEPARTAMENTO",
      };
      horariosCache.set(key, entry);
      return entry;
    }
  }

  // 2) horário geral do cliente (departamentoId = null)
  const geralRegs = await horarioRepo.find({
    where: {
      idcliente: idcliente as any,
      departamentoId: null as any,
      ativo: true as any,
    },
    order: { id: "ASC" as any },
  });

  if (geralRegs.length > 0) {
    const entry: CacheEntry = {
      expiresAt: now + CACHE_TTL_MS,
      registros: geralRegs,
      source: "GERAL",
    };
    horariosCache.set(key, entry);
    return entry;
  }

  // 3) nenhum registro -> retorna NONE (sem considerar 24x7 aberto)
  const entry: CacheEntry = {
    expiresAt: now + CACHE_TTL_MS,
    registros: [],
    source: "NONE",
  };
  horariosCache.set(key, entry);
  return entry;
}

// ====================== HORÁRIOS (REGRA) ======================

export async function isOutOfBusinessHoursDB(params: {
  idcliente?: number;
  departamentoId?: number | null;
}): Promise<boolean> {
  const { minutosDia, diaCodigo, timeZone } = getNowInTimeZone();

  try {
    const effectiveClienteId = await resolveEffectiveClienteId(params.idcliente);

    const entry = await getHorariosAtivos(effectiveClienteId, params.departamentoId);

    // Se não há configuração, usa fallback seguro (não 24x7)
    if (!entry.registros || entry.registros.length === 0) {
      const fallback = isOutOfBusinessHoursFallback();
      console.log(
        "[HORARIO] Sem horários configurados. Usando fallback padrão.",
        "tz=",
        timeZone,
        "idcliente=",
        effectiveClienteId,
        "departamentoId=",
        params.departamentoId,
        "fora?=",
        fallback
      );
      return fallback;
    }

    const ativosHoje = entry.registros.filter((h) => {
      if (!h.diasSemana) return false;
      const dias = h.diasSemana
        .split(",")
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
      return dias.includes(diaCodigo);
    });

    if (ativosHoje.length === 0) return true;

    const dentroDeAlgum = ativosHoje.some((h) => {
      if (!h.inicio || !h.fim) return false;

      const [hIni, mIni] = h.inicio.split(":").map((p) => parseInt(p, 10));
      const [hFim, mFim] = h.fim.split(":").map((p) => parseInt(p, 10));

      if (
        Number.isNaN(hIni) ||
        Number.isNaN(mIni) ||
        Number.isNaN(hFim) ||
        Number.isNaN(mFim)
      ) {
        return false;
      }

      const minIni = hIni * 60 + mIni;
      const minFim = hFim * 60 + mFim;

      // janela simples
      if (minFim > minIni) return minutosDia >= minIni && minutosDia < minFim;

      // cruza meia-noite
      return minutosDia >= minIni || minutosDia < minFim;
    });

    const fora = !dentroDeAlgum;
    console.log(
      "[HORARIO] Cálculo DB:",
      "tz=",
      timeZone,
      "idcliente=",
      effectiveClienteId,
      "dep=",
      params.departamentoId,
      "dia=",
      diaCodigo,
      "minDia=",
      minutosDia,
      "fora?=",
      fora,
      "source=",
      entry.source
    );

    return fora;
  } catch (err) {
    console.log(
      "[HORARIO] Erro ao consultar horários no banco. Usando fallback padrão.",
      err
    );
    return isOutOfBusinessHoursFallback();
  }
}

// ====================== TEXTO DE HORÁRIO PARA USUÁRIO ======================

export const EXPEDIENTE_PADRAO_MENU =
  "🕘 Expediente: Seg–Sex 08:00–18:00 (alguns setores podem variar; ao escolher eu te informo).";

const DIA_LABEL: Record<string, string> = {
  DOM: "Dom",
  SEG: "Seg",
  TER: "Ter",
  QUA: "Qua",
  QUI: "Qui",
  SEX: "Sex",
  SAB: "Sáb",
};

function formatDiasSemanaHuman(diasSemana?: string | null): string {
  if (!diasSemana) return "";
  const dias = diasSemana
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter(Boolean);

  const uniq = Array.from(new Set(dias));
  if (uniq.length === 0) return "";

  const all = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
  const weekday = ["SEG", "TER", "QUA", "QUI", "SEX"];

  const hasAll = all.every((d) => uniq.includes(d));
  if (hasAll) return "Todos os dias";

  const hasWeek =
    weekday.every((d) => uniq.includes(d)) &&
    !uniq.includes("DOM") &&
    !uniq.includes("SAB");
  if (hasWeek) return "Seg–Sex";

  uniq.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  return uniq.map((d) => DIA_LABEL[d] || d).join(", ");
}

function formatHorariosRegistros(registros: HorarioAtendimento[]): string {
  const parts: string[] = [];

  for (const h of registros) {
    if (!h.inicio || !h.fim) continue;
    const dias = formatDiasSemanaHuman(h.diasSemana);
    const janela = `${h.inicio}–${h.fim}`;
    parts.push(dias ? `${dias} ${janela}` : janela);
  }

  if (parts.length === 0) return "";

  const max = 4;
  const limited = parts.slice(0, max);
  const suffix = parts.length > max ? ` | +${parts.length - max} períodos` : "";
  return limited.join(" | ") + suffix;
}

export async function getHorarioAtendimentoTexto(params: {
  idcliente?: number;
  departamentoId?: number | null;
  prefix?: string;
}): Promise<string> {
  try {
    const effectiveClienteId = await resolveEffectiveClienteId(params.idcliente);

    const entry = await getHorariosAtivos(effectiveClienteId, params.departamentoId);

    const prefix =
      params.prefix ??
      (params.departamentoId != null ? "🕘 Expediente do setor" : "🕘 Expediente");

    if (!entry.registros || entry.registros.length === 0) {
      return `${prefix}: Seg–Sex 08:00–18:00.`;
    }

    const resumo = formatHorariosRegistros(entry.registros);
    return resumo ? `${prefix}: ${resumo}.` : `${prefix}: Seg–Sex 08:00–18:00.`;
  } catch (err) {
    console.error("[HORARIO] Erro ao montar texto de horário:", err);
    const prefix =
      params.prefix ??
      (params.departamentoId != null ? "🕘 Expediente do setor" : "🕘 Expediente");
    return `${prefix}: Seg–Sex 08:00–18:00.`;
  }
}

export function sanitizeHorarioLabel(horarioTxt?: string | null): string | null {
  const t = String(horarioTxt || "").trim();
  if (!t) return null;
  return t
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^🕘\s*/g, "")
    .trim();
}
