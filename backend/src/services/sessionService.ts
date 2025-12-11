// src/services/sessionService.ts
import {
  getDepartamentoPorIndice,
  montarMenuDepartamentos,
} from "./departmentService";

import {
  sendTextMessage,
  sendAudioMessageById,
  sendImageMessageById,
  sendDocumentMessageById,
  sendVideoMessageById,
  sendNovoAtendimentoTemplateToAgent,
  sendSaudacaoPedirNomeTemplate,
  sendMenuComNomeTemplate,
} from "./whatsappService";

import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { salvarMensagem } from "./messageService";
import { MensagemTipo } from "../entities/Mensagem";
import { Cliente } from "../entities/Cliente";
import { gerarRespostaIA, iaEstaHabilitada } from "./iaService";

export type SessionStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
  | "FINISHED";

export type Session = {
  citizenNumber: string;
  citizenName?: string;
  departmentId?: number;
  departmentName?: string;
  agentNumber?: string;
  agentName?: string;
  status: SessionStatus;
  atendimentoId: string;
  busyReminderCount?: number;
  lastActiveAt?: number;
  protocolo?: string;
  /** id do cliente (tabela clientes.id) */
  idcliente?: number;
};

const sessionsByCitizen = new Map<string, Session>();
const sessionsByAgent = new Map<string, Session>();

export type IncomingMessage = {
  from: string;
  text?: string;
  whatsappMessageId?: string;
  tipo: MensagemTipo;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
};

// ====================== HELPERS GERAIS ======================

function normalizePhone(num?: string | null): string {
  if (!num) return "";
  return num.replace(/\D/g, "");
}

// usamos sempre os 8 últimos dígitos (número da linha)
function getAgentKey(num?: string | null): string {
  const normalized = normalizePhone(num);
  if (!normalized) return "";
  return normalized.slice(-8);
}

function lowerTipo(tipo: MensagemTipo): string {
  return String(tipo || "").toLowerCase();
}

/**
 * Saudação baseada no horário (fuso: America/Sao_Paulo)
 *
 * - 04:00 até 11:59 → Bom dia
 * - 12:00 até 17:59 → Boa tarde
 * - 18:00 até 03:59 → Boa noite
 */
function getSaudacaoPorHorario(): string {
  try {
    const agoraBR = new Date(
      new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    );
    const hora = agoraBR.getHours();

    if (hora >= 4 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
  } catch {
    const hora = new Date().getHours();
    if (hora >= 4 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
  }
}

/**
 * Regra padrão de horário de atendimento humano:
 *   - Segunda a Sexta
 *   - Das 08:00 às 18:00 (fuso America/Sao_Paulo)
 */
function isOutOfBusinessHours(): boolean {
  try {
    const agoraBR = new Date(
      new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })
    );
    const diaSemana = agoraBR.getDay(); // 0 domingo, 6 sábado
    const hora = agoraBR.getHours();

    if (diaSemana === 0 || diaSemana === 6) return true;
    if (hora < 8 || hora >= 18) return true;

    return false;
  } catch {
    const now = new Date();
    const diaSemana = now.getDay();
    const hora = now.getHours();
    if (diaSemana === 0 || diaSemana === 6) return true;
    if (hora < 8 || hora >= 18) return true;
    return false;
  }
}

function isGreeting(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;

  const ignoreWords = [
    "oi",
    "ola",
    "olá",
    "bom dia",
    "boa tarde",
    "boa noite",
    "menu",
  ];

  return (
    ignoreWords.some((w) => trimmed.startsWith(w)) &&
    trimmed.split(" ").length <= 3
  );
}

// ====================== TIPO DE ÓRGÃO / CLIENTE (prefeitura, escola, saúde etc.) ======================

type OrgTipo = "PREFEITURA" | "EDUCACAO" | "SAUDE" | "ASSISTENCIA" | "ESCOLA" | "OUTRO";

type OrgInfo = {
  tipo: OrgTipo;
  displayName: string;
  escopoFrase: string;
};

/**
 * Analisa o nome do cliente (tabela clientes.nome) e tenta entender
 * que tipo de órgão é: prefeitura, secretaria de educação, saúde, assistência,
 * escola/unidade ou genérico.
 */
function buildOrgInfo(clienteNome?: string | null): OrgInfo {
  if (!clienteNome) {
    return {
      tipo: "OUTRO",
      displayName: "o órgão responsável pelo atendimento",
      escopoFrase:
        "órgão público responsável pelos serviços atendidos neste canal",
    };
  }

  const lower = clienteNome.toLowerCase();

  // PREFEITURA
  if (
    lower.includes("prefeitura") ||
    lower.includes("município de") ||
    lower.includes("municipio de") ||
    lower.includes("governo municipal")
  ) {
    return {
      tipo: "PREFEITURA",
      displayName: clienteNome,
      escopoFrase:
        "Prefeitura Municipal; atende assuntos gerais do município, como educação, saúde, assistência, tributos, obras e outros serviços públicos, conforme as configurações deste canal",
    };
  }

  // EDUCAÇÃO / SEMED
  if (
    lower.includes("educação") ||
    lower.includes("educacao") ||
    lower.includes("semed") ||
    lower.includes("secretaria municipal de educação")
  ) {
    return {
      tipo: "EDUCACAO",
      displayName: clienteNome,
      escopoFrase:
        "Secretaria Municipal de Educação; atende exclusivamente assuntos de educação, escolas, alunos, merenda e transporte escolar",
    };
  }

  // SAÚDE
  if (
    lower.includes("saúde") ||
    lower.includes("saude") ||
    lower.includes("secretaria municipal de saúde") ||
    lower.includes("sesau") ||
    lower.includes("sms ")
  ) {
    return {
      tipo: "SAUDE",
      displayName: clienteNome,
      escopoFrase:
        "Secretaria de Saúde; atende exclusivamente assuntos de saúde vinculados a este órgão",
    };
  }

  // ASSISTÊNCIA SOCIAL
  if (
    lower.includes("assistência social") ||
    lower.includes("assistencia social") ||
    lower.includes("secretaria de assistência") ||
    lower.includes("secretaria de assistencia") ||
    lower.includes("assistência e desenvolvimento social") ||
    lower.includes("assistencia e desenvolvimento social")
  ) {
    return {
      tipo: "ASSISTENCIA",
      displayName: clienteNome,
      escopoFrase:
        "Secretaria de Assistência Social; atende assuntos de programas sociais, benefícios e serviços socioassistenciais",
    };
  }

  // ESCOLA / CRECHE / UNIDADE
  if (
    lower.includes("escola ") ||
    lower.includes("creche ") ||
    lower.includes("cem ") ||
    lower.includes("emei ") ||
    lower.includes("emef ")
  ) {
    return {
      tipo: "ESCOLA",
      displayName: clienteNome,
      escopoFrase:
        "unidade de ensino (escola/creche); atende assuntos diretamente ligados à rotina dessa unidade, como matrícula, turmas, horários e comunicação com responsáveis",
    };
  }

  // GENÉRICO / OUTROS ÓRGÃOS
  return {
    tipo: "OUTRO",
    displayName: clienteNome,
    escopoFrase:
      "órgão público responsável pelos serviços atendidos neste canal",
  };
}

// ====================== METADADOS DE COMANDO ======================

type CommandMeta = {
  comandoCodigo: string;
  comandoDescricao: string;
};

function buildMeta(codigo: string, descricao: string): CommandMeta {
  return { comandoCodigo: codigo, comandoDescricao: descricao };
}

/**
 * Interpreta comandos enviados pelo CIDADÃO
 * e gera um texto amigável para aparecer no frontend.
 */
function mapCitizenCommandMetadata(
  session: Session,
  trimmed: string,
  trimmedLower: string,
  onlyDigits: string
): CommandMeta | null {
  switch (session.status) {
    case "ASK_DEPARTMENT":
      if (!onlyDigits) return null;
      return buildMeta(
        onlyDigits,
        `Cidadão escolheu a opção ${onlyDigits} do menu de departamentos.`
      );

    case "LEAVE_MESSAGE_DECISION":
      if (onlyDigits === "1") {
        return buildMeta(
          "1",
          "Cidadão decidiu deixar um recado detalhado para o setor."
        );
      }
      if (onlyDigits === "2") {
        return buildMeta(
          "2",
          "Cidadão preferiu não deixar recado e encerrar o atendimento."
        );
      }
      return null;

    case "ASK_SATISFACTION_RESOLUTION":
      if (onlyDigits === "1") {
        return buildMeta("1", "Respondeu que a demanda foi resolvida.");
      }
      if (onlyDigits === "2") {
        return buildMeta("2", "Respondeu que a demanda NÃO foi resolvida.");
      }
      return null;

    case "ASK_SATISFACTION_RATING": {
      if (!onlyDigits) return null;
      const nota = parseInt(onlyDigits, 10);
      if (isNaN(nota) || nota < 1 || nota > 5) return null;

      const legendas: Record<number, string> = {
        1: "Péssimo",
        2: "Ruim",
        3: "Regular",
        4: "Bom",
        5: "Ótimo",
      };

      return buildMeta(
        onlyDigits,
        `Avaliação de satisfação: nota ${nota} – ${legendas[nota]}.`
      );
    }

    case "ASK_ANOTHER_DEPARTMENT":
      if (onlyDigits === "1") {
        return buildMeta(
          "1",
          "Após a pesquisa, o cidadão pediu para falar com outro setor."
        );
      }
      if (onlyDigits === "2") {
        return buildMeta(
          "2",
          "Após a pesquisa, o cidadão optou por encerrar definitivamente."
        );
      }
      return null;

    case "ACTIVE":
      if (
        ["encerrar", "finalizar", "sair"].includes(trimmedLower) ||
        onlyDigits === "3"
      ) {
        return buildMeta(
          onlyDigits || trimmedLower,
          "Cidadão enviou comando para encerrar o atendimento."
        );
      }
      return null;

    default:
      return null;
  }
}

/**
 * Interpreta comandos enviados pelo AGENTE
 * e gera um texto amigável para aparecer no frontend.
 */
function mapAgentCommandMetadata(
  session: Session,
  trimmed: string,
  trimmedLower: string,
  onlyDigits: string
): CommandMeta | null {
  switch (session.status) {
    case "WAITING_AGENT_CONFIRMATION":
      if (onlyDigits === "1") {
        return buildMeta("1", "Agente aceitou o atendimento (comando 1).");
      }
      if (onlyDigits === "2") {
        return buildMeta(
          "2",
          "Agente informou que está ocupado (comando 2)."
        );
      }
      return null;

    case "ACTIVE":
      if (
        onlyDigits === "3" ||
        trimmedLower === "encerrar" ||
        trimmedLower === "finalizar"
      ) {
        return buildMeta(
          onlyDigits || trimmedLower,
          "Agente encerrou o atendimento por comando."
        );
      }

      if (
        trimmedLower.startsWith("transferir") ||
        trimmedLower.startsWith("setor")
      ) {
        const parts = trimmedLower.split(/\s+/);
        const destino = parts[1] || "?";
        return buildMeta(
          `transferir ${destino}`.trim(),
          `Agente solicitou transferência do atendimento para o setor nº ${destino}.`
        );
      }

      return null;

    default:
      return null;
  }
}

// ====================== BANCO / CLIENTE & ATENDIMENTOS ======================

let defaultClienteIdCache: number | null = null;

/**
 * Recupera o id do cliente padrão.
 *
 * 1) Primeiro tenta pegar um cliente com `ativo = true`
 * 2) Se der erro (coluna não existe) ou não tiver, pega o primeiro da tabela
 */
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
      "[CLIENTE] Erro ao filtrar por ativo (talvez a coluna não exista).",
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

/**
 * Recupera o nome do cliente (prefeitura/órgão) a partir do id,
 * caindo no cliente padrão se não tiver id na sessão.
 */
async function getClienteNome(idcliente?: number): Promise<string | null> {
  const repo = AppDataSource.getRepository(Cliente);

  let effectiveId = idcliente;
  if (effectiveId == null) {
    effectiveId = await getDefaultClienteId();
  }

  const cliente = await repo.findOne({ where: { id: effectiveId } });
  return cliente?.nome ?? null;
}

async function criarNovoAtendimento(
  citizenNumber: string
): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);
  const idcliente = await getDefaultClienteId();

  console.log(
    "[ATENDIMENTO] Criando novo atendimento para cidadão",
    numero,
    "com idcliente=",
    idcliente,
    "..."
  );

  const ultimo = await repo.findOne({
    where: { cidadaoNumero: numero, idcliente },
    order: { criadoEm: "DESC" },
  });

  const temNomeAnterior = !!ultimo?.cidadaoNome;

  const atendimento = repo.create({
    idcliente,
    cidadaoNumero: numero,
    ...(temNomeAnterior && { cidadaoNome: ultimo!.cidadaoNome }),
    status: (temNomeAnterior ? "ASK_DEPARTMENT" : "ASK_NAME") as AtendimentoStatus,
  });

  await repo.save(atendimento);

  console.log(
    "[ATENDIMENTO] Novo atendimento criado: id=",
    atendimento.id,
    ", status=",
    atendimento.status,
    ", temNomeAnterior=",
    temNomeAnterior,
    ", idcliente=",
    atendimento.idcliente
  );

  return atendimento;
}

async function criarNovoAtendimentoParaOutroSetor(
  citizenNumber: string,
  citizenName?: string,
  idclienteParam?: number
): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);
  const idcliente = idclienteParam ?? (await getDefaultClienteId());

  const atendimento = repo.create({
    idcliente,
    cidadaoNumero: numero,
    ...(citizenName && { cidadaoNome: citizenName }),
    status: "ASK_DEPARTMENT" as AtendimentoStatus,
  });

  await repo.save(atendimento);
  return atendimento;
}

async function carregarAtendimentoAberto(
  citizenNumber: string
): Promise<Atendimento | null> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);
  const idcliente = await getDefaultClienteId();

  console.log(
    "[ATENDIMENTO] Buscando atendimento aberto (ACTIVE) para cidadão",
    numero,
    "idcliente=",
    idcliente,
    "..."
  );

  const atendimento = await repo.findOne({
    where: {
      cidadaoNumero: numero,
      status: "ACTIVE",
      idcliente,
    },
    relations: ["departamento"],
    order: { criadoEm: "DESC" },
  });

  if (!atendimento) {
    console.log(
      "[ATENDIMENTO] Nenhum atendimento ACTIVE encontrado para",
      numero,
      "idcliente=",
      idcliente
    );
  }

  return atendimento;
}

/**
 * Recupera sessão de AGENTE direto do banco caso o mapa em memória tenha se perdido.
 */
async function recoverAgentSession(
  agentNumberRaw: string
): Promise<Session | undefined> {
  const agentFull = normalizePhone(agentNumberRaw);
  if (!agentFull) return;

  const last8 = agentFull.slice(-8);

  const repo = AppDataSource.getRepository(Atendimento);

  const atendimento = await repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .where("a.status IN (:...statuses)", {
      statuses: [
        "WAITING_AGENT_CONFIRMATION",
        "ACTIVE",
        "LEAVE_MESSAGE_DECISION",
      ] as AtendimentoStatus[],
    })
    .andWhere(
      "(" +
        "right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
        "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8" +
        ")",
      { last8 }
    )
    .orderBy("a.atualizado_em", "DESC")
    .getOne();

  if (!atendimento) {
    return;
  }

  const savedAgent = normalizePhone(atendimento.agenteNumero ?? "");
  if (savedAgent !== agentFull) {
    await repo.update(atendimento.id, { agenteNumero: agentFull });
    atendimento.agenteNumero = agentFull;
  }

  const session: Session = {
    citizenNumber: atendimento.cidadaoNumero,
    status: atendimento.status as SessionStatus,
    citizenName: atendimento.cidadaoNome ?? undefined,
    departmentId: atendimento.departamentoId ?? undefined,
    departmentName: atendimento.departamento?.nome ?? undefined,
    agentNumber: atendimento.agenteNumero ?? undefined,
    agentName: atendimento.agenteNome ?? undefined,
    atendimentoId: atendimento.id,
    busyReminderCount: 0,
    lastActiveAt: Date.now(),
    protocolo: atendimento.protocolo ?? undefined,
    idcliente: atendimento.idcliente,
  };

  const citizenKey = normalizePhone(session.citizenNumber);
  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const agentKey = getAgentKey(session.agentNumber);
    if (agentKey) sessionsByAgent.set(agentKey, session);
  }

  console.log(
    `🔄 Sessão do agente recuperada do banco. Agente=${agentFull} Cidadão=${session.citizenNumber} idcliente=${session.idcliente}`
  );

  return session;
}

async function getOrCreateSession(citizenNumberRaw: string): Promise<Session> {
  const citizenKey = normalizePhone(citizenNumberRaw);

  console.log(
    "[SESSION] getOrCreateSession para cidadão=",
    citizenKey,
    ". Tamanho atual sessionsByCitizen=",
    sessionsByCitizen.size
  );

  const existente = sessionsByCitizen.get(citizenKey);
  if (existente) {
    console.log(
      "[SESSION] Sessão existente encontrada para",
      citizenKey,
      ": status=",
      existente.status,
      ", atendimentoId=",
      existente.atendimentoId,
      ", idcliente=",
      existente.idcliente
    );
    return existente;
  }

  let atendimento = await carregarAtendimentoAberto(citizenKey);
  if (!atendimento) {
    atendimento = await criarNovoAtendimento(citizenKey);
  }

  const session: Session = {
    citizenNumber: citizenKey,
    status: atendimento.status as SessionStatus,
    citizenName: atendimento.cidadaoNome ?? undefined,
    departmentId: atendimento.departamentoId ?? undefined,
    departmentName: atendimento.departamento?.nome ?? undefined,
    agentNumber: atendimento.agenteNumero ?? undefined,
    agentName: atendimento.agenteNome ?? undefined,
    atendimentoId: atendimento.id,
    busyReminderCount: 0,
    lastActiveAt: Date.now(),
    protocolo: atendimento.protocolo ?? undefined,
    idcliente: atendimento.idcliente,
  };

  console.log(
    "[SESSION] Nova sessão criada para cidadão=",
    citizenKey,
    ". status=",
    session.status,
    ", atendimentoId=",
    session.atendimentoId,
    ", dep=",
    session.departmentId,
    ", agente=",
    session.agentNumber,
    ", idcliente=",
    session.idcliente
  );

  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const key = getAgentKey(session.agentNumber);
    if (key) sessionsByAgent.set(key, session);
  }

  return session;
}

export function isAgentNumber(whatsappNumber: string): boolean {
  const key = getAgentKey(whatsappNumber);
  return sessionsByAgent.has(key);
}

async function atualizarAtendimento(
  session: Session,
  parcial: Partial<Atendimento>
) {
  const repo = AppDataSource.getRepository(Atendimento);

  console.log(
    "[ATENDIMENTO] Atualizando atendimento id=",
    session.atendimentoId,
    "com:",
    parcial
  );

  await repo.update(session.atendimentoId, parcial);
}

function generateProtocol(atendimentoId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const short = atendimentoId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ATD-${yyyy}${mm}${dd}-${short}`;
}

async function fecharAtendimentoComProtocolo(
  session: Session
): Promise<string> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = await repo.findOne({
    where: { id: session.atendimentoId },
  });

  let protocolo = atendimento?.protocolo || null;
  if (!protocolo) {
    protocolo = generateProtocol(session.atendimentoId);
  }

  console.log(
    "[ATENDIMENTO] Fechando atendimento id=",
    session.atendimentoId,
    "com protocolo=",
    protocolo
  );

  await repo.update(session.atendimentoId, {
    status: "FINISHED" as AtendimentoStatus,
    encerradoEm: new Date(),
    protocolo,
  });

  session.status = "FINISHED";
  session.protocolo = protocolo;
  return protocolo;
}

// ====================== FILA (QUEUE) ======================

async function getAgentBusyAndQueueCount(
  agentNumber: string,
  idcliente: number
): Promise<{ busy: boolean; queueCount: number }> {
  const repo = AppDataSource.getRepository(Atendimento);
  const normalized = normalizePhone(agentNumber);
  const last8 = normalized.slice(-8);

  const agora = new Date();

  const BUSY_TTL_MINUTOS = 10;
  const FILA_TTL_MINUTOS = 60;

  const limiteBusy = new Date(
    agora.getTime() - BUSY_TTL_MINUTOS * 60 * 1000
  );
  const limiteFila = new Date(
    agora.getTime() - FILA_TTL_MINUTOS * 60 * 1000
  );

  console.log(
    "[QUEUE] Verificando ocupação/fila para agente=",
    agentNumber,
    "(last8=",
    last8,
    ") limiteBusy=",
    limiteBusy.toISOString(),
    "limiteFila=",
    limiteFila.toISOString(),
    "idcliente=",
    idcliente
  );

  const busyCount = await repo
    .createQueryBuilder("a")
    .leftJoin("a.departamento", "d")
    .where("a.status IN (:...statuses)", {
      statuses: ["WAITING_AGENT_CONFIRMATION", "ACTIVE"] as AtendimentoStatus[],
    })
    .andWhere("a.atualizado_em > :limiteBusy", { limiteBusy })
    .andWhere("a.idcliente = :idcliente", { idcliente })
    .andWhere(
      "(" +
        "right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
        "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8" +
        ")",
      { last8 }
    )
    .getCount();

  const queueCount = await repo
    .createQueryBuilder("a")
    .leftJoin("a.departamento", "d")
    .where("a.status = :status", { status: "IN_QUEUE" as AtendimentoStatus })
    .andWhere("a.atualizado_em > :limiteFila", { limiteFila })
    .andWhere("a.idcliente = :idcliente", { idcliente })
    .andWhere(
      "(" +
        "right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
        "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8" +
        ")",
      { last8 }
    )
    .getCount();

  console.log(
    "[QUEUE] Resultado para agente=",
    agentNumber,
    ": busyCount=",
    busyCount,
    ", queueCount=",
    queueCount,
    ", idcliente=",
    idcliente
  );

  return {
    busy: busyCount > 0,
    queueCount,
  };
}

async function ativarProximoDaFila(sessionEncerrada: Session) {
  const repo = AppDataSource.getRepository(Atendimento);

  const agentNumber = sessionEncerrada.agentNumber
    ? normalizePhone(sessionEncerrada.agentNumber)
    : null;
  const departmentId = sessionEncerrada.departmentId ?? null;
  const idcliente =
    sessionEncerrada.idcliente ?? (await getDefaultClienteId());

  console.log(
    "[QUEUE_NEXT] Procurando próximo da fila após encerrar atendimento=",
    sessionEncerrada.atendimentoId,
    "agent=",
    agentNumber,
    "depId=",
    departmentId,
    "idcliente=",
    idcliente
  );

  if (!agentNumber && !departmentId) {
    return;
  }

  const qb = repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .where("a.status = :status", { status: "IN_QUEUE" as AtendimentoStatus })
    .andWhere("a.idcliente = :idcliente", { idcliente });

  if (agentNumber) {
    const last8 = agentNumber.slice(-8);
    qb.andWhere(
      "(" +
        "right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
        "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8" +
        ")",
      { last8 }
    );
  } else if (departmentId) {
    qb.andWhere("a.departamento_id = :depId", { depId: departmentId });
  }

  const proximo = await qb.orderBy("a.criado_em", "ASC").getOne();
  if (!proximo) {
    console.log(
      "[QUEUE_NEXT] Nenhum atendimento IN_QUEUE encontrado para este agente/setor/cliente."
    );
    return;
  }

  const citizenNumber = normalizePhone(proximo.cidadaoNumero);
  const agentFull =
    proximo.agenteNumero && proximo.agenteNumero.trim()
      ? normalizePhone(proximo.agenteNumero)
      : agentNumber;

  const novaSession: Session = {
    citizenNumber,
    status: "WAITING_AGENT_CONFIRMATION",
    citizenName: proximo.cidadaoNome ?? undefined,
    departmentId: proximo.departamentoId ?? undefined,
    departmentName: proximo.departamento?.nome ?? undefined,
    agentNumber: agentFull ?? undefined,
    agentName: proximo.agenteNome ?? undefined,
    atendimentoId: proximo.id,
    busyReminderCount: 0,
    lastActiveAt: Date.now(),
    protocolo: proximo.protocolo ?? undefined,
    idcliente: proximo.idcliente,
  };

  sessionsByCitizen.set(citizenNumber, novaSession);

  if (agentFull) {
    const agentKey = getAgentKey(agentFull);
    if (agentKey) sessionsByAgent.set(agentKey, novaSession);
  }

  await repo.update(proximo.id, {
    status: "WAITING_AGENT_CONFIRMATION" as AtendimentoStatus,
    agenteNumero: novaSession.agentNumber ?? proximo.agenteNumero,
    agenteNome: novaSession.agentName ?? proximo.agenteNome,
  });

  await sendTextMessage(
    novaSession.citizenNumber,
    `📢 Chegou a sua vez! Estamos chamando o responsável de *${novaSession.departmentName}* para iniciar seu atendimento.`
  );

  if (novaSession.agentNumber) {
    const agenteEnvio = normalizePhone(novaSession.agentNumber);
    await sendTextMessage(
      agenteEnvio,
      `📲 *Nova solicitação (fila) - ${novaSession.departmentName}*\n\n` +
        `Munícipe: *${novaSession.citizenName ?? "Cidadão"}*\n` +
        `Telefone: ${novaSession.citizenNumber}\n\n` +
        `Digite:\n` +
        `1 - Atender agora\n` +
        `2 - Informar que está ocupado`
    );
    scheduleBusyReminder(novaSession);
  }
}

// ====================== TIMERS ======================

function scheduleLeaveMessageAutoClose(session: Session) {
  const citizenKey = normalizePhone(session.citizenNumber);
  const atendimentoId = session.atendimentoId;
  const MINUTOS = 10;

  setTimeout(async () => {
    const current = sessionsByCitizen.get(citizenKey);
    if (!current) return;
    if (current.atendimentoId !== atendimentoId) return;
    if (current.status !== "LEAVE_MESSAGE") return;

    const protocolo = await fecharAtendimentoComProtocolo(current);

    await sendTextMessage(
      current.citizenNumber,
      `✅ Sua mensagem foi registrada e o atendimento foi encerrado.\n` +
        `Número de protocolo: *${protocolo}*.\n` +
        `Guarde este número para acompanhar sua solicitação.`
    );

    await ativarProximoDaFila(current);

    sessionsByCitizen.delete(citizenKey);
  }, MINUTOS * 60 * 1000);
}

function scheduleActiveAutoClose(session: Session) {
  const citizenKey = normalizePhone(session.citizenNumber);
  const agentKey = session.agentNumber ? getAgentKey(session.agentNumber) : null;
  const agentFullNumber = session.agentNumber
    ? normalizePhone(session.agentNumber)
    : null;
  const atendimentoId = session.atendimentoId;

  const TIMEOUT_MINUTOS = 2;

  const scheduledAt = Date.now();
  session.lastActiveAt = scheduledAt;

  setTimeout(async () => {
    const current = sessionsByCitizen.get(citizenKey);
    if (!current) return;
    if (current.atendimentoId !== atendimentoId) return;
    if (current.status !== "ACTIVE") return;
    if (current.lastActiveAt !== scheduledAt) return;

    const protocolo = await fecharAtendimentoComProtocolo(current);

    if (agentKey) {
      const s = sessionsByAgent.get(agentKey);
      if (s && s.atendimentoId === atendimentoId) {
        sessionsByAgent.delete(agentKey);
      }
    }

    await sendTextMessage(
      current.citizenNumber,
      `🕒 Encerramos este atendimento automaticamente por inatividade.\n` +
        `Número de protocolo: *${protocolo}*.\n` +
        `Se ainda precisar de ajuda, é só mandar um *oi*.`
    );

    if (agentFullNumber) {
      await sendTextMessage(
        agentFullNumber,
        `💤 O atendimento com ${
          current.citizenName ?? "o munícipe"
        } encerrou por inatividade.\nProtocolo: *${protocolo}*.`
      );
    }

    await ativarProximoDaFila(current);

    sessionsByCitizen.delete(citizenKey);
  }, TIMEOUT_MINUTOS * 60 * 1000);
}

function scheduleBusyReminder(session: Session) {
  if (!session.agentNumber) return;

  const key = getAgentKey(session.agentNumber);
  const agenteNumeroEnvio = normalizePhone(session.agentNumber);
  const atendimentoId = session.atendimentoId;

  if (!key || !agenteNumeroEnvio) return;

  const attempt = (session.busyReminderCount ?? 0) + 1;
  session.busyReminderCount = attempt;

  setTimeout(async () => {
    let current = sessionsByAgent.get(key);

    if (!current) {
      current = await recoverAgentSession(agenteNumeroEnvio);
    }
    if (!current) return;

    if (
      current.atendimentoId !== atendimentoId ||
      current.status !== "WAITING_AGENT_CONFIRMATION"
    ) {
      return;
    }

    if ((current.busyReminderCount ?? 0) >= 3) {
      console.log(
        "[REMINDER] Limite de lembretes atingido para agente=",
        agenteNumeroEnvio,
        "atendimento=",
        atendimentoId,
        ". Indo para LEAVE_MESSAGE_DECISION."
      );

      await sendTextMessage(
        agenteNumeroEnvio,
        "🔔 Limite de tentativas excedido. O cidadão será orientado a deixar recado."
      );

      current.status = "LEAVE_MESSAGE_DECISION";

      await sendTextMessage(
        current.citizenNumber,
        `⚠️ O responsável de *${current.departmentName}* parece estar indisponível no momento.\n\n` +
          `Deseja deixar um recado detalhado?\n` +
          `1 - Sim, deixar recado\n` +
          `2 - Não, encerrar`
      );

      return;
    }

    console.log(
      "[REMINDER] Enviando lembrete para agente=",
      agenteNumeroEnvio,
      "atendimento=",
      atendimentoId,
      "tentativa=",
      attempt
    );

    await sendTextMessage(
      agenteNumeroEnvio,
      `⏰ Lembrete: Atendimento pendente com *${
        current.citizenName ?? "Cidadão"
      }*.\n` + `Digite:\n1 - Atender agora\n2 - Continuar ocupado`
    );

    scheduleBusyReminder(current);
  }, 2 * 60 * 1000);
}

// ====================== PESQUISA DE SATISFAÇÃO ======================

async function iniciarPesquisaSatisfacao(session: Session, protocolo: string) {
  session.protocolo = protocolo;
  session.status = "ASK_SATISFACTION_RESOLUTION";

  await sendTextMessage(
    session.citizenNumber,
    `✅ Atendimento finalizado.\nProtocolo: *${protocolo}*.\n\n` +
      `Antes de encerrar de vez, gostaríamos de saber:\n` +
      `Suas solicitações foram *resolvidas*?\n\n` +
      `1 - Sim, foi resolvido\n` +
      `2 - Não foi resolvido`
  );
}

// ====================== CIDADÃO ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const {
    from,
    text = "",
    tipo,
    whatsappMessageId,
    mediaId,
    mimeType,
    fileName,
  } = msg;

  const citizenKey = normalizePhone(from);
  const trimmed = text.trim();
  const trimmedLower = trimmed.toLowerCase();
  const onlyDigits = trimmed.replace(/\D/g, "");
  const greetingMessage = isGreeting(trimmed);

  console.log(
    "[CITIZEN_MSG] De=",
    citizenKey,
    "tipo=",
    tipo,
    'texto="',
    text,
    '" mediaId=',
    mediaId
  );

  const session = await getOrCreateSession(citizenKey);
  session.lastActiveAt = Date.now();

  console.log(
    "[CITIZEN_MSG] Sessão atual: atendimentoId=",
    session.atendimentoId,
    ", status=",
    session.status,
    ", dep=",
    session.departmentId ? session.departmentId : "undefined",
    ", agente=",
    session.agentNumber ? session.agentNumber : "undefined",
    ", idcliente=",
    session.idcliente
  );

  const citizenMeta = mapCitizenCommandMetadata(
    session,
    trimmed,
    trimmedLower,
    onlyDigits
  );

  await salvarMensagem({
    atendimentoId: session.atendimentoId,
    direcao: "CITIZEN",
    tipo,
    conteudoTexto: text || null,
    whatsappMessageId,
    whatsappMediaId: mediaId,
    mediaUrl: undefined,
    mimeType,
    fileName,
    fileSize: null,
    remetenteNumero: citizenKey,
    comandoCodigo: citizenMeta?.comandoCodigo ?? null,
    comandoDescricao: citizenMeta?.comandoDescricao ?? null,
  });

  // ---------- IA: pré-atendimento fora do horário ----------
  //
  // Regra:
  //   - IA habilitada
  //   - Fora do horário de atendimento
  //   - Fluxo em ASK_NAME (já com nome) ou ASK_DEPARTMENT
  //
  // No primeiro contato (sem nome ainda), seguimos o fluxo normal de pedir nome.

  const foraHorario = isOutOfBusinessHours();
  const podeUsarIAForaHorario =
    (session.status === "ASK_NAME" && !!session.citizenName) ||
    session.status === "ASK_DEPARTMENT";

  if (foraHorario && iaEstaHabilitada() && podeUsarIAForaHorario) {
    console.log(
      "[IA] Fora do horário de atendimento humano. Acionando IA para pré-atendimento..."
    );

    const textoBaseIA =
      trimmed ||
      (tipo === "AUDIO"
        ? "O cidadão enviou um áudio descrevendo a situação."
        : "O cidadão entrou em contato fora do horário de atendimento.");

    const clienteNome = await getClienteNome(session.idcliente);
    const orgInfo = buildOrgInfo(clienteNome);

    const contextoParts: string[] = [
      "Você é o *Atende Cidadão*, assistente virtual deste órgão público.",
      `Nome do cliente / órgão: ${orgInfo.displayName}.`,
      `Escopo do órgão: ${orgInfo.escopoFrase}.`,
      session.citizenName
        ? `Nome informado do cidadão: ${session.citizenName}.`
        : "Nome do cidadão ainda não informado.",
      session.departmentName
        ? `Setor mencionado/selecionado: ${session.departmentName}.`
        : "O setor ainda não foi selecionado.",
      "Situação: atendimento fora do horário padrão de funcionamento. Nenhum atendente humano está disponível agora.",
      "Objetivo: orientar o cidadão, explicar de forma simples que é fora do horário e sugerir que ele deixe um recado para ser respondido no próximo expediente.",
      "Você deve:",
      "- Se apresentar de forma breve (1 frase).",
      "- Mencionar o órgão (cliente) quando fizer sentido.",
      "- Dar orientações gerais sobre o tipo de dúvida, sem prometer nada específico.",
      "- No final, incentive o cidadão a decidir se quer deixar um recado detalhado ou encerrar por enquanto.",
      "Responda em até 3 parágrafos curtos.",
    ];

    // Regras específicas para cada tipo de órgão

    if (orgInfo.tipo === "EDUCACAO") {
      contextoParts.push(
        "Muito importante: neste canal você atende exclusivamente assuntos de EDUCAÇÃO.",
        "Não use a palavra 'prefeitura'. Use sempre termos como 'Secretaria Municipal de Educação', 'Secretaria de Educação' ou 'SEMED'.",
        "Não mencione saúde, tributos, obras ou outros temas fora da educação.",
        "Se quiser dar exemplos, use apenas temas como matrícula escolar, merenda, transporte escolar, lotação de professores, calendário letivo, etc."
      );
    } else if (orgInfo.tipo === "SAUDE") {
      contextoParts.push(
        "Neste canal você atende exclusivamente assuntos de SAÚDE.",
        "Evite mencionar temas como educação, obras ou tributos.",
        "Se quiser dar exemplos, cite apenas temas como consultas, exames, vacinação, unidades de saúde, regulação e serviços relacionados à saúde."
      );
    } else if (orgInfo.tipo === "ASSISTENCIA") {
      contextoParts.push(
        "Neste canal você atende exclusivamente assuntos de ASSISTÊNCIA SOCIAL.",
        "Evite mencionar temas de saúde, educação ou obras.",
        "Se quiser dar exemplos, fale de benefícios sociais, CRAS, CREAS, programas sociais e serviços socioassistenciais."
      );
    } else if (orgInfo.tipo === "ESCOLA") {
      contextoParts.push(
        "Neste canal você atende exclusivamente assuntos desta UNIDADE DE ENSINO (escola/creche).",
        "Não use a palavra 'prefeitura'. Use sempre o nome da escola ou expressão como 'nossa escola' ou 'nossa unidade'.",
        "Se quiser dar exemplos, fale de matrícula, turmas, horários, reuniões, boletins, comunicação com responsáveis, etc."
      );
    } else if (orgInfo.tipo === "PREFEITURA") {
      contextoParts.push(
        "Neste canal você pode citar serviços gerais do município, como educação, saúde, assistência, tributos e obras, mas sempre de forma genérica.",
        "Deixe claro que detalhes específicos e decisões dependem da equipe da prefeitura e das regras locais."
      );
    } else {
      contextoParts.push(
        "Evite dizer que é assistente da 'prefeitura' se o órgão não for explicitamente a prefeitura inteira. Prefira 'órgão' ou o nome oficial fornecido."
      );
    }

    const contexto = contextoParts.join(" ");

    try {
      const ia = await gerarRespostaIA(
        textoBaseIA,
        "whatsapp_cidadao",
        contexto
      );

      if (ia.sucesso && ia.resposta) {
        const textoIa =
          ia.resposta.trim() +
          "\n\nResponda com:\n1 - Deixar recado detalhado\n2 - Não, encerrar";

        await sendTextMessage(session.citizenNumber, textoIa);

        // Salva resposta da IA (texto exatamente enviado ao cidadão)
        await salvarMensagem({
          atendimentoId: session.atendimentoId,
          direcao: "IA" as any,
          tipo: "TEXT" as MensagemTipo,
          conteudoTexto: textoIa,
          whatsappMessageId: undefined,
          whatsappMediaId: undefined,
          mediaUrl: undefined,
          mimeType: undefined,
          fileName: undefined,
          fileSize: null,
          remetenteNumero: "IA",
          comandoCodigo: null,
          comandoDescricao:
            "Resposta da IA em pré-atendimento fora do horário.",
        });

        session.status = "LEAVE_MESSAGE_DECISION";
        await atualizarAtendimento(session, {
          status: "LEAVE_MESSAGE_DECISION",
        });

        return;
      }
    } catch (e) {
      console.log(
        "[IA] Falha ao obter resposta da IA fora do horário. Erro:",
        e
      );
    }

    // Fallback se a IA falhar (sem saldo, erro de rede, etc.)
    const orgFrase = clienteNome
      ? `da equipe de *${clienteNome}*`
      : "da equipe";

    await sendTextMessage(
      session.citizenNumber,
      `No momento estamos fora do horário de atendimento ${orgFrase}. Mesmo assim, você pode deixar sua mensagem aqui que ela será analisada no próximo expediente.`
    );

    await sendTextMessage(
      session.citizenNumber,
      "Deseja deixar um recado detalhado para que possamos responder no próximo expediente?\n1 - Sim, deixar recado\n2 - Não, encerrar"
    );

    session.status = "LEAVE_MESSAGE_DECISION";
    await atualizarAtendimento(session, {
      status: "LEAVE_MESSAGE_DECISION",
    });

    return;
  }

  // ---------- Fluxo: cidadão decide se deixa recado ou encerra ----------

  if (session.status === "LEAVE_MESSAGE_DECISION") {
    console.log(
      "[FLOW] LEAVE_MESSAGE_DECISION atendimento=",
      session.atendimentoId,
      "resposta=",
      trimmed
    );

    if (onlyDigits === "1") {
      session.status = "LEAVE_MESSAGE";
      await atualizarAtendimento(session, {
        status: "LEAVE_MESSAGE",
      });
      await sendTextMessage(
        session.citizenNumber,
        "Perfeito! 👍\nEscreva sua mensagem detalhada, envie fotos ou áudios.\nRegistraremos tudo."
      );
      scheduleLeaveMessageAutoClose(session);
      return;
    }
    if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);
      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
      );

      await ativarProximoDaFila(session);

      sessionsByCitizen.delete(citizenKey);
      return;
    }
    await sendTextMessage(
      session.citizenNumber,
      "Responda apenas:\n1 - Deixar recado\n2 - Encerrar"
    );
    return;
  }

  // ---------- Fluxo: Modo recado (LEAVE_MESSAGE) com IA + nome do cliente ----------

  if (session.status === "LEAVE_MESSAGE") {
    const clienteNome = await getClienteNome(session.idcliente);
    const orgInfo = buildOrgInfo(clienteNome);

    const orgFrase = clienteNome
      ? `nossa equipe da *${clienteNome}*`
      : "nossa equipe";

    const ackBase =
      `Recebido ✅. Sua mensagem ficará registrada e ${orgFrase} vai analisar no próximo atendimento.`;

    let textoFinal = ackBase;

    // Se tiver texto e a IA estiver habilitada, deixa ela ajudar
    if (iaEstaHabilitada() && trimmed) {
      console.log(
        "[IA] Respondendo mensagem em modo LEAVE_MESSAGE (recado offline)..."
      );

      const contextoParts: string[] = [
        `Cliente / órgão: ${orgInfo.displayName}.`,
        `Escopo do órgão: ${orgInfo.escopoFrase}.`,
        session.citizenName
          ? `Nome do cidadão: ${session.citizenName}.`
          : "Nome do cidadão não informado.",
        session.departmentName
          ? `Setor responsável (se já definido): ${session.departmentName}.`
          : "Setor ainda não definido (modo recado geral).",
        "Contexto: o atendimento está em modo de recado (LEAVE_MESSAGE), fora ou dentro do horário, mas sem atendimento humano imediato.",
        "Os atendentes humanos irão ler essa mensagem no próximo expediente e responder pelo canal oficial.",
        "Objetivo da IA: acolher o cidadão, dar orientação inicial e, se possível, sugerir caminhos gerais.",
        "Importante: responda em no máximo 3 parágrafos curtos, sem despedidas longas e sem prometer algo que depende do órgão (como emprego, benefício, vaga etc.).",
      ];

      if (orgInfo.tipo === "EDUCACAO") {
        contextoParts.push(
          "Neste canal você atende exclusivamente assuntos de EDUCAÇÃO.",
          "Não use a palavra 'prefeitura'. Use 'Secretaria Municipal de Educação', 'Secretaria de Educação' ou 'SEMED'.",
          "Não mencione saúde, tributos, obras ou outros temas fora da educação.",
          "Se quiser dar exemplos, cite apenas matrícula escolar, merenda, transporte escolar, lotação de professores, calendário letivo, etc."
        );
      } else if (orgInfo.tipo === "SAUDE") {
        contextoParts.push(
          "Neste canal você atende exclusivamente assuntos de SAÚDE.",
          "Não fale de educação, obras ou tributos.",
          "Se quiser dar exemplos, cite consultas, exames, vacinação, unidades de saúde, regulação, etc."
        );
      } else if (orgInfo.tipo === "ASSISTENCIA") {
        contextoParts.push(
          "Neste canal você atende exclusivamente assuntos de ASSISTÊNCIA SOCIAL.",
          "Não traga temas de saúde, educação ou obras.",
          "Se quiser dar exemplos, fale de benefícios sociais, programas sociais, CRAS, CREAS, etc."
        );
      } else if (orgInfo.tipo === "ESCOLA") {
        contextoParts.push(
          "Neste canal você atende exclusivamente assuntos desta UNIDADE DE ENSINO.",
          "Não use 'prefeitura'. Use o nome da escola ou 'nossa escola', 'nossa unidade'.",
          "Se quiser dar exemplos, fale de matrícula, turmas, horários, reuniões, boletins, comunicação com responsáveis, etc."
        );
      } else if (orgInfo.tipo === "PREFEITURA") {
        contextoParts.push(
          "Você pode mencionar serviços gerais da prefeitura (educação, saúde, assistência, tributos, obras), mas sempre de forma genérica.",
          "Lembre-se: decisões específicas dependem da equipe da prefeitura."
        );
      } else {
        contextoParts.push(
          "Evite dizer que é assistente da 'prefeitura' se o órgão não for explicitamente a prefeitura inteira. Prefira 'órgão' ou o nome oficial."
        );
      }

      const contexto = contextoParts.join(" ");

      const ia = await gerarRespostaIA(
        trimmed,
        "whatsapp_cidadao",
        contexto
      );

      if (ia.sucesso && ia.resposta) {
        // texto final = ACK + resposta da IA
        textoFinal = `${ackBase}\n\n${ia.resposta}`;

        // Salvar mensagem da IA no banco
        await salvarMensagem({
          atendimentoId: session.atendimentoId,
          direcao: "IA" as any,
          tipo: "TEXT" as MensagemTipo,
          conteudoTexto: ia.resposta,
          whatsappMessageId: undefined,
          whatsappMediaId: undefined,
          mediaUrl: undefined,
          mimeType: undefined,
          fileName: undefined,
          fileSize: null,
          remetenteNumero: "IA",
          comandoCodigo: null,
          comandoDescricao:
            "Resposta da IA em modo LEAVE_MESSAGE (recado offline).",
        });
      } else {
        console.log(
          "[IA] Falha ao responder em LEAVE_MESSAGE. Erro:",
          ia.erro
        );
      }
    }

    // Envia UMA mensagem só pro cidadão
    await sendTextMessage(session.citizenNumber, textoFinal);

    scheduleLeaveMessageAutoClose(session);
    return;
  }

  // ---------- Fluxo: Fila (IN_QUEUE) ----------

  if (session.status === "IN_QUEUE") {
    const repo = AppDataSource.getRepository(Atendimento);
    if (session.agentNumber) {
      const normalized = normalizePhone(session.agentNumber);
      const last8 = normalized.slice(-8);
      const idcliente = session.idcliente ?? (await getDefaultClienteId());

      const queueAhead = await repo
        .createQueryBuilder("a")
        .leftJoin("a.departamento", "d")
        .where("a.status = :status", { status: "IN_QUEUE" as AtendimentoStatus })
        .andWhere("a.idcliente = :idcliente", { idcliente })
        .andWhere("a.id <> :id", { id: session.atendimentoId })
        .andWhere(
          "(" +
            "right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
            "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8" +
            ")",
          { last8 }
        )
        .getCount();

      const pos = queueAhead + 1;

      await sendTextMessage(
        session.citizenNumber,
        `⏳ Todos os atendentes de *${session.departmentName}* ainda estão ocupados.\n` +
          `Você está na posição *${pos}* da fila.\n` +
          `Assim que chegar sua vez, vamos te avisar aqui.`
      );
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Você está aguardando na fila deste setor. Assim que houver um atendente disponível, seu atendimento será iniciado."
      );
    }
    return;
  }

  // ---------- Fluxo: Pesquisa de satisfação - resolvido? ----------

  if (session.status === "ASK_SATISFACTION_RESOLUTION") {
    if (onlyDigits === "1" || onlyDigits === "2") {
      const foiResolvido = onlyDigits === "1";

      await atualizarAtendimento(session, {
        foiResolvido,
      });

      session.status = "ASK_SATISFACTION_RATING";

      await sendTextMessage(
        session.citizenNumber,
        "Obrigado pela resposta! 🙏\n" +
          "Agora, de *1 a 5*, qual nota você dá para o atendimento recebido?\n\n" +
          "1 - Péssimo\n" +
          "2 - Ruim\n" +
          "3 - Regular\n" +
          "4 - Bom\n" +
          "5 - Ótimo"
      );
      return;
    }

    await sendTextMessage(
      session.citizenNumber,
      "Por favor, responda apenas:\n1 - Sim, foi resolvido\n2 - Não foi resolvido"
    );
    return;
  }

  // ---------- Fluxo: Pesquisa de satisfação - nota ----------

  if (session.status === "ASK_SATISFACTION_RATING") {
    const nota = parseInt(onlyDigits, 10);

    if (isNaN(nota) || nota < 1 || nota > 5) {
      await sendTextMessage(
        session.citizenNumber,
        "Envie apenas um número de 1 a 5 para avaliar o atendimento."
      );
      return;
    }

    await atualizarAtendimento(session, {
      notaSatisfacao: nota,
    });

    session.status = "ASK_ANOTHER_DEPARTMENT";

    await sendTextMessage(
      session.citizenNumber,
      "Agradecemos sua avaliação! 🌟\n\n" +
        "Deseja falar com *outro setor*?\n" +
        "1 - Sim, abrir atendimento em outro setor\n" +
        "2 - Não, encerrar por aqui"
    );
    return;
  }

  // ---------- Fluxo: Cidadão decidir falar com outro setor após encerramento ----------

  if (session.status === "ASK_ANOTHER_DEPARTMENT") {
    if (onlyDigits === "1") {
      const novoAtendimento = await criarNovoAtendimentoParaOutroSetor(
        session.citizenNumber,
        session.citizenName,
        session.idcliente
      );

      session.atendimentoId = novoAtendimento.id;
      session.status = "ASK_DEPARTMENT";
      session.departmentId = undefined;
      session.departmentName = undefined;
      session.agentNumber = undefined;
      session.agentName = undefined;
      session.busyReminderCount = 0;
      session.protocolo = undefined;
      session.idcliente = novoAtendimento.idcliente;

      const menuSemRodape = await montarMenuDepartamentos(true);
      const saudacao = getSaudacaoPorHorario();

      await sendMenuComNomeTemplate({
        to: session.citizenNumber,
        saudacao,
        citizenName: session.citizenName ?? "Cidadão",
        menuTexto: menuSemRodape,
      });
      return;
    }
    if (onlyDigits === "2") {
      const protocoloMsg = session.protocolo
        ? `Protocolo: *${session.protocolo}*.\n`
        : "";

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\n${protocoloMsg}Obrigado pelo contato!`
      );
      sessionsByCitizen.delete(citizenKey);
      return;
    }
    await sendTextMessage(
      session.citizenNumber,
      "Responda:\n1 - Outro departamento\n2 - Não, encerrar"
    );
    return;
  }

  // ---------- Fluxo: Nome do cidadão (ASK_NAME) ----------

  if (session.status === "ASK_NAME") {
    console.log(
      "[FLOW] ASK_NAME atendimento=",
      session.atendimentoId,
      "resposta=",
      trimmed
    );

    if (!session.citizenName) {
      if (!trimmed || trimmed.length < 3 || greetingMessage) {
        const saudacao = getSaudacaoPorHorario();

        await sendSaudacaoPedirNomeTemplate({
          to: session.citizenNumber,
          saudacao,
        });
        return;
      }

      session.citizenName = trimmed;
      session.status = "ASK_DEPARTMENT";

      await atualizarAtendimento(session, {
        cidadaoNome: session.citizenName,
        status: "ASK_DEPARTMENT",
      });

      const menuSemRodape = await montarMenuDepartamentos(true);
      const saudacao = getSaudacaoPorHorario();

      await sendMenuComNomeTemplate({
        to: session.citizenNumber,
        saudacao,
        citizenName: session.citizenName,
        menuTexto: menuSemRodape,
      });
      return;
    }
  }

  // ---------- Fluxo: Escolha de departamento ----------

  if (session.status === "ASK_DEPARTMENT") {
    console.log(
      "[FLOW] ASK_DEPARTMENT atendimento=",
      session.atendimentoId,
      "resposta=",
      trimmed
    );

    const numero = parseInt(trimmed, 10);
    if (isNaN(numero)) {
      const menuComRodape = await montarMenuDepartamentos();

      if (session.citizenName && greetingMessage) {
        const saudacao = getSaudacaoPorHorario();
        const menuSemRodape = await montarMenuDepartamentos(true);

        await sendMenuComNomeTemplate({
          to: session.citizenNumber,
          saudacao,
          citizenName: session.citizenName,
          menuTexto: menuSemRodape,
        });
      } else {
        await sendTextMessage(
          session.citizenNumber,
          "Digite apenas o número da opção desejada.\n\n" + menuComRodape
        );
      }
      return;
    }

    const departamento = await getDepartamentoPorIndice(numero);
    if (!departamento) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Opção inválida. Tente novamente.\n\n" + menu
      );
      return;
    }

    console.log(
      "[DEPARTAMENTO] Opção menu=",
      numero,
      "resultou em departamento=",
      departamento.nome,
      "id=",
      departamento.id
    );

    session.departmentId = departamento.id;
    session.departmentName = departamento.nome ?? undefined;
    session.agentNumber = departamento.responsavelNumero || undefined;
    session.agentName = departamento.responsavelNome || "Responsável";
    session.busyReminderCount = 0;

    console.log(
      "[DEPARTAMENTO] Sessão atualizada com departamento=",
      session.departmentName,
      ", agente=",
      session.agentNumber
    );

    if (!session.agentNumber) {
      await atualizarAtendimento(session, {
        departamentoId: departamento.id,
        status: "ASK_DEPARTMENT",
      });

      await sendTextMessage(
        session.citizenNumber,
        "Este setor está sem responsável configurado no momento. Sua solicitação foi registrada."
      );
      return;
    }

    const idcliente = session.idcliente ?? (await getDefaultClienteId());
    const { busy, queueCount } = await getAgentBusyAndQueueCount(
      session.agentNumber,
      idcliente
    );

    console.log(
      "[DEPARTAMENTO] Resultado busy=",
      busy,
      ", queueCount=",
      queueCount,
      "para agente=",
      session.agentNumber,
      "idcliente=",
      idcliente
    );

    if (busy) {
      session.status = "IN_QUEUE";

      await atualizarAtendimento(session, {
        departamentoId: departamento.id,
        agenteNumero: session.agentNumber,
        agenteNome: session.agentName,
        status: "IN_QUEUE" as AtendimentoStatus,
      });

      const pos = queueCount + 1;

      await sendTextMessage(
        session.citizenNumber,
        `📥 Todos os atendentes de *${departamento.nome}* estão ocupados no momento.\n` +
          `Você entrou na fila e está na posição *${pos}*.\n` +
          `Quando chegar sua vez, vamos te avisar aqui.`
      );

      return;
    }

    session.status = "WAITING_AGENT_CONFIRMATION";

    await atualizarAtendimento(session, {
      departamentoId: departamento.id,
      agenteNumero: session.agentNumber,
      agenteNome: session.agentName,
      status: "WAITING_AGENT_CONFIRMATION",
    });

    const key = getAgentKey(session.agentNumber);
    if (key) sessionsByAgent.set(key, session);
    const agenteEnvio = normalizePhone(session.agentNumber);

    await sendTextMessage(
      session.citizenNumber,
      `Aguarde um instante, estou contatando o setor *${departamento.nome}*. ⏳\n` +
        `Pode ir descrevendo sua situação aqui.`
    );

    console.log(
      "[ROTEAMENTO] Enviando nova solicitação para agente=",
      agenteEnvio,
      "dep=",
      departamento.nome,
      "cidadao=",
      session.citizenNumber,
      "atendimento=",
      session.atendimentoId
    );

    console.log(
      "[TEMPLATE] Chamando novo_atendimento_agente para agente=",
      agenteEnvio,
      "dep=",
      departamento.nome,
      "cidadao=",
      session.citizenNumber
    );

    await sendNovoAtendimentoTemplateToAgent({
      to: agenteEnvio,
      departamentoNome: departamento.nome ?? "Setor",
      cidadaoNome: session.citizenName ?? "Cidadão",
      telefoneCidadao: session.citizenNumber,
      resumo: "-",
    });

    scheduleBusyReminder(session);
    return;
  }

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    await sendTextMessage(
      session.citizenNumber,
      "O responsável ainda não confirmou, mas sua mensagem já foi salva. Aguarde mais um pouco ou deixe tudo registrado aqui."
    );
    return;
  }

  // ---------- Fluxo: Atendimento ativo (CIDADÃO → AGENTE) ----------

  if (session.status === "ACTIVE") {
    if (
      ["encerrar", "finalizar", "sair"].includes(trimmedLower) ||
      onlyDigits === "3"
    ) {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      if (session.agentNumber) {
        const agenteEnvio = normalizePhone(session.agentNumber);
        await sendTextMessage(
          agenteEnvio,
          `ℹ️ O cidadão encerrou o atendimento.\nProtocolo: *${protocolo}*`
        );
        const key = getAgentKey(session.agentNumber);
        if (key) sessionsByAgent.delete(key);
      }

      await ativarProximoDaFila(session);

      await iniciarPesquisaSatisfacao(session, protocolo);
      return;
    }

    if (session.agentNumber) {
      const agenteEnvio = normalizePhone(session.agentNumber);

      if (tipo === "TEXT") {
        const body = `👤 *${session.citizenName}*: ${text}`;
        await sendTextMessage(agenteEnvio, body);
      } else {
        const body =
          `👤 *${session.citizenName}* enviou um ${lowerTipo(
            tipo
          )}.\n` + (text ? `Mensagem: ${text}` : "");
        await sendTextMessage(agenteEnvio, body);

        if (mediaId) {
          const t = lowerTipo(tipo);
          if (t === "audio") await sendAudioMessageById(agenteEnvio, mediaId);
          else if (t === "image")
            await sendImageMessageById(agenteEnvio, mediaId);
          else if (t === "document")
            await sendDocumentMessageById(agenteEnvio, mediaId);
          else if (t === "video")
            await sendVideoMessageById(agenteEnvio, mediaId);
        }
      }

      scheduleActiveAutoClose(session);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Erro: Não consegui contatar o agente."
      );
    }
    return;
  }

  if (session.status === "FINISHED") {
    await sendTextMessage(
      session.citizenNumber,
      "Este atendimento já foi encerrado. Mande um *oi* para iniciar outro."
    );
    sessionsByCitizen.delete(citizenKey);
    return;
  }

  await sendTextMessage(
    session.citizenNumber,
    "Não entendi. Mande um *oi* para iniciar um novo atendimento."
  );
  sessionsByCitizen.delete(citizenKey);
}

// ====================== AGENTE ======================

export async function handleAgentMessage(msg: IncomingMessage) {
  const {
    from,
    text = "",
    tipo,
    whatsappMessageId,
    mediaId,
    mimeType,
    fileName,
  } = msg;

  const agentFullNumber = normalizePhone(from);
  const key = getAgentKey(from);
  const trimmed = text.trim();
  const trimmedLower = trimmed.toLowerCase();
  const onlyDigits = trimmed.replace(/\D/g, "");

  let session = sessionsByAgent.get(key);

  if (!session) {
    session = await recoverAgentSession(agentFullNumber);
  }

  if (!session) {
    console.log(
      `[Agente] Nenhuma sessão encontrada para ${agentFullNumber} (key=${key})`
    );
    await sendTextMessage(
      agentFullNumber,
      "No momento você não possui atendimentos ativos ou pendentes neste número."
    );
    return;
  }

  session.lastActiveAt = Date.now();

  const agentMeta = mapAgentCommandMetadata(
    session,
    trimmed,
    trimmedLower,
    onlyDigits
  );

  await salvarMensagem({
    atendimentoId: session.atendimentoId,
    direcao: "AGENT",
    tipo,
    conteudoTexto: text || null,
    whatsappMessageId,
    whatsappMediaId: mediaId,
    mediaUrl: undefined,
    mimeType,
    fileName,
    fileSize: null,
    remetenteNumero: agentFullNumber,
    comandoCodigo: agentMeta?.comandoCodigo ?? null,
    comandoDescricao: agentMeta?.comandoDescricao ?? null,
  });

  if (trimmedLower === "ajuda" || trimmedLower === "menu") {
    await sendTextMessage(
      agentFullNumber,
      `🛠 *Comandos do Agente:*\n\n` +
        `1 - Aceitar atendimento (se pendente)\n` +
        `2 - Ocupado (se pendente)\n` +
        `3 ou "encerrar" - Finalizar atendimento\n` +
        `transferir X - Transferir para outro setor (X = número do setor)\n` +
        `\nVocê está falando com: ${session.citizenName}`
    );
    return;
  }

  if (
    session.status === "ACTIVE" &&
    (onlyDigits === "3" ||
      trimmedLower === "encerrar" ||
      trimmedLower === "finalizar")
  ) {
    const protocolo = await fecharAtendimentoComProtocolo(session);
    if (session.agentNumber) {
      const oldKey = getAgentKey(session.agentNumber);
      if (oldKey) sessionsByAgent.delete(oldKey);
    }

    await sendTextMessage(
      agentFullNumber,
      `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
    );

    await ativarProximoDaFila(session);

    await iniciarPesquisaSatisfacao(session, protocolo);
    return;
  }

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (onlyDigits === "1") {
      session.status = "ACTIVE";

      await atualizarAtendimento(session, { status: "ACTIVE" });

      await sendTextMessage(
        agentFullNumber,
        `✅ Você iniciou o atendimento com *${session.citizenName}*.`
      );
      await sendTextMessage(
        session.citizenNumber,
        `✅ O responsável de *${session.departmentName}* iniciou o atendimento.\nPode falar!`
      );

      scheduleActiveAutoClose(session);
      return;
    }

    if (onlyDigits === "2") {
      session.busyReminderCount = 0;
      await sendTextMessage(
        agentFullNumber,
        "Cidadão avisado que você está ocupado. Digite 1 quando puder atender."
      );
      await sendTextMessage(
        session.citizenNumber,
        `O responsável de *${session.departmentName}* está ocupado, mas sua solicitação está na fila.`
      );
      scheduleBusyReminder(session);
      return;
    }

    await sendTextMessage(
      agentFullNumber,
      "Responda: 1 - Atender agora | 2 - Ocupado."
    );
    return;
  }

  if (session.status === "ACTIVE") {
    const words = trimmedLower.split(/\s+/);
    if (words[0] === "transferir" || words[0] === "setor") {
      const idx = parseInt(words[1], 10);

      if (isNaN(idx)) {
        await sendTextMessage(
          agentFullNumber,
          'Use: *transferir 2* (onde "2" é o número do setor).'
        );
        return;
      }

      const novoDep = await getDepartamentoPorIndice(idx);
      if (!novoDep) {
        await sendTextMessage(
          agentFullNumber,
          "Setor inválido. Verifique a lista."
        );
        return;
      }

      const oldDepName = session.departmentName;

      if (session.agentNumber) {
        const oldKey = getAgentKey(session.agentNumber);
        if (oldKey) sessionsByAgent.delete(oldKey);
      }

      session.departmentId = novoDep.id;
      session.departmentName = novoDep.nome ?? undefined;
      session.agentNumber = novoDep.responsavelNumero || undefined;
      session.agentName = novoDep.responsavelNome || "Responsável";
      session.status = "WAITING_AGENT_CONFIRMATION";
      session.busyReminderCount = 0;

      await atualizarAtendimento(session, {
        departamentoId: novoDep.id,
        agenteNumero: session.agentNumber,
        agenteNome: session.agentName,
        status: "WAITING_AGENT_CONFIRMATION",
      });

      await sendTextMessage(
        session.citizenNumber,
        `🔄 Transferindo seu atendimento para *${novoDep.nome}*. Aguarde um momento.`
      );
      await sendTextMessage(
        agentFullNumber,
        `✅ Atendimento transferido de ${oldDepName} para ${novoDep.nome}.`
      );

      if (session.agentNumber) {
        const novoKey = getAgentKey(session.agentNumber);
        if (novoKey) sessionsByAgent.set(novoKey, session);
        const novoAgenteZap = normalizePhone(session.agentNumber);

        await sendTextMessage(
          novoAgenteZap,
          `📲 *Transferência de setor*\n` +
            `Munícipe: *${session.citizenName}*\n` +
            `Origem: ${oldDepName}\n\n` +
            `Digite:\n1 - Atender agora\n2 - Informar que está ocupado`
        );

        scheduleBusyReminder(session);
      }

      return;
    }
  }

  if (session.status === "ACTIVE") {
    if (tipo === "TEXT") {
      const body = `👨‍💼 *${session.agentName || "Atendente"}*: ${text}`;
      await sendTextMessage(session.citizenNumber, body);
    } else {
      const body =
        `👨‍💼 *${session.agentName || "Atendente"}* enviou um ${lowerTipo(
          tipo
        )}.\n` + (text ? `Mensagem: ${text}` : "");
      await sendTextMessage(session.citizenNumber, body);

      if (mediaId) {
        const t = lowerTipo(tipo);
        if (t === "audio")
          await sendAudioMessageById(session.citizenNumber, mediaId);
        else if (t === "image")
          await sendImageMessageById(session.citizenNumber, mediaId);
        else if (t === "document")
          await sendDocumentMessageById(session.citizenNumber, mediaId);
        else if (t === "video")
          await sendVideoMessageById(session.citizenNumber, mediaId);
      }
    }

    scheduleActiveAutoClose(session);
    return;
  }

  await sendTextMessage(
    agentFullNumber,
    "Comando não reconhecido ou atendimento já encerrado."
  );
}
