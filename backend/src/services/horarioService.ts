// src/services/horarioService.ts
import { AppDataSource } from "../database/data-source";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";
import { Cliente } from "../entities/Cliente";

// ====================== CLIENTE (LOCAL AO MÓDULO) ======================

let defaultClienteIdCache: number | null = null;

async function getDefaultClienteId(): Promise<number> {
  if (defaultClienteIdCache !== null) {
    return defaultClienteIdCache;
  }

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
    cliente = await repo.findOne({
      order: { id: "ASC" as any },
    });
  }

  if (!cliente) {
    throw new Error(
      "Nenhum cliente encontrado na tabela 'clientes'. Cadastre pelo menos um registro."
    );
  }

  defaultClienteIdCache = cliente.id;
  return defaultClienteIdCache;
}

// ====================== HELPERS DE TEMPO/HORÁRIO ======================

/**
 * Horário em São Paulo (usado em saudação e horários de atendimento)
 */
function getNowInSaoPaulo() {
  try {
    const agoraBR = new Date(
      new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    );
    const hora = agoraBR.getHours();
    const minuto = agoraBR.getMinutes();
    const minutosDia = hora * 60 + minuto;
    const diaSemana = agoraBR.getDay(); // 0 = DOM, 6 = SAB
    const mapDia = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
    const diaCodigo = mapDia[diaSemana] ?? "DOM";
    return { agoraBR, hora, minuto, minutosDia, diaSemana, diaCodigo };
  } catch {
    const now = new Date();
    const hora = now.getHours();
    const minuto = now.getMinutes();
    const minutosDia = hora * 60 + minuto;
    const diaSemana = now.getDay();
    const mapDia = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
    const diaCodigo = mapDia[diaSemana] ?? "DOM";
    return { agoraBR: now, hora, minuto, minutosDia, diaSemana, diaCodigo };
  }
}

/**
 * Saudação baseada no horário (fuso: America/Sao_Paulo)
 */
export function getSaudacaoPorHorario(): string {
  const { hora } = getNowInSaoPaulo();
  if (hora >= 4 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Regra padrão de horário de atendimento humano (fallback 08–18h, seg–sex)
 */
function isOutOfBusinessHoursFallback(): boolean {
  const { diaSemana, hora } = getNowInSaoPaulo();
  if (diaSemana === 0 || diaSemana === 6) return true; // domingo/sábado
  if (hora < 8 || hora >= 18) return true;
  return false;
}

// ====================== HORÁRIOS (BANCO) ======================

export async function isOutOfBusinessHoursDB(params: {
  idcliente?: number;
  departamentoId?: number | null;
}): Promise<boolean> {
  const horarioRepo = AppDataSource.getRepository(HorarioAtendimento);
  const { minutosDia, diaCodigo } = getNowInSaoPaulo();

  try {
    const effectiveClienteId =
      params.idcliente ?? (await getDefaultClienteId());

    let registros: HorarioAtendimento[] = [];

    // 1) Tenta horário específico do setor
    if (params.departamentoId != null) {
      registros = await horarioRepo.find({
        where: {
          idcliente: effectiveClienteId as any,
          departamentoId: params.departamentoId as any,
          ativo: true as any,
        },
        order: { id: "ASC" as any },
      });
    }

    // 2) Se não houver, usa horário geral do cliente (departamentoId = null)
    if (!registros || registros.length === 0) {
      registros = await horarioRepo.find({
        where: {
          idcliente: effectiveClienteId as any,
          departamentoId: null as any,
          ativo: true as any,
        },
        order: { id: "ASC" as any },
      });
    }

    // 3) Se ainda assim não houver registro, considera 24x7 (dentro do horário)
    if (!registros || registros.length === 0) {
      console.log(
        "[HORARIO] Nenhum horário configurado para idcliente=",
        effectiveClienteId,
        "departamentoId=",
        params.departamentoId,
        ". Considerando 24x7 (dentro do horário)."
      );
      return false;
    }

    const ativosHoje = registros.filter((h) => {
      if (!h.diasSemana) return false;
      const dias = h.diasSemana
        .split(",")
        .map((d) => d.trim().toUpperCase())
        .filter(Boolean);
      return dias.includes(diaCodigo);
    });

    if (ativosHoje.length === 0) {
      // Sem nenhum registro pra esse dia → fora do horário
      return true;
    }

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

      // janela simples (não cruza meia-noite)
      if (minFim > minIni) {
        return minutosDia >= minIni && minutosDia < minFim;
      }

      // janela que cruza a meia-noite (ex: 22:00–02:00)
      return minutosDia >= minIni || minutosDia < minFim;
    });

    const fora = !dentroDeAlgum;
    console.log(
      "[HORARIO] Cálculo DB: idcliente=",
      effectiveClienteId,
      "departamentoId=",
      params.departamentoId,
      "dia=",
      diaCodigo,
      "minutosDia=",
      minutosDia,
      "fora?=",
      fora
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
  const suffix =
    parts.length > max ? " | +" + (parts.length - max) + " períodos" : "";
  return limited.join(" | ") + suffix;
}

/**
 * Monta o texto amigável com o(s) horário(s) configurados no banco.
 * Se não tiver nada cadastado, cai num texto padrão.
 */
export async function getHorarioAtendimentoTexto(params: {
  idcliente?: number;
  departamentoId?: number | null;
  prefix?: string;
}): Promise<string> {
  const horarioRepo = AppDataSource.getRepository(HorarioAtendimento);
  const effectiveClienteId =
    params.idcliente ?? (await getDefaultClienteId());

  let registros: HorarioAtendimento[] = [];

  if (params.departamentoId != null) {
    registros = await horarioRepo.find({
      where: {
        idcliente: effectiveClienteId as any,
        departamentoId: params.departamentoId as any,
        ativo: true as any,
      },
      order: { id: "ASC" as any },
    });
  }

  if (!registros || registros.length === 0) {
    registros = await horarioRepo.find({
      where: {
        idcliente: effectiveClienteId as any,
        departamentoId: null as any,
        ativo: true as any,
      },
      order: { id: "ASC" as any },
    });
  }

  const prefix =
    params.prefix ??
    (params.departamentoId != null
      ? "🕘 Expediente do setor"
      : "🕘 Expediente");

  if (!registros || registros.length === 0) {
    // Segurança: se não achar nada, usa texto padrão
    return `${prefix}: Seg–Sex 08:00–18:00.`;
  }

  const resumo = formatHorariosRegistros(registros);
  return resumo ? `${prefix}: ${resumo}.` : `${prefix}: Seg–Sex 08:00–18:00.`;
}

/**
 * Limpa o texto de horário para usar em mensagens da IA / templates
 * (remove emojis, markdown e espaços extras, mantendo só a frase).
 */
export function sanitizeHorarioLabel(
  horarioTxt?: string | null
): string | null {
  const t = String(horarioTxt || "").trim();
  if (!t) return null;
  return t
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^🕘\s*/g, "")
    .trim();
}
