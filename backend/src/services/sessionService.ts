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

// ====================== FUNÇÕES AUXILIARES ======================

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
    // fallback caso dê algum erro com timeZone
    const hora = new Date().getHours();
    if (hora >= 4 && hora < 12) return "Bom dia";
    if (hora >= 12 && hora < 18) return "Boa tarde";
    return "Boa noite";
  }
}

function isGreeting(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;

  // incluí "menu" aqui também pra disparar o template bonitão
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

// ====================== BANCO / ATENDIMENTOS ======================

async function criarNovoAtendimento(
  citizenNumber: string
): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);

  console.log(
    "[ATENDIMENTO] Criando novo atendimento para cidadão",
    numero,
    "..."
  );

  // Tenta recuperar o último atendimento para este número
  const ultimo = await repo.findOne({
    where: { cidadaoNumero: numero },
    order: { criadoEm: "DESC" },
  });

  const temNomeAnterior = !!ultimo?.cidadaoNome;

  const atendimento = repo.create({
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
    temNomeAnterior
  );

  return atendimento;
}

async function criarNovoAtendimentoParaOutroSetor(
  citizenNumber: string,
  citizenName?: string
): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);

  const atendimento = repo.create({
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

  console.log(
    "[ATENDIMENTO] Buscando atendimento aberto (ACTIVE) para cidadão",
    numero,
    "..."
  );

  const atendimento = await repo.findOne({
    where: {
      cidadaoNumero: numero,
      status: "ACTIVE",
    },
    relations: ["departamento"],
    order: { criadoEm: "DESC" },
  });

  if (!atendimento) {
    console.log(
      "[ATENDIMENTO] Nenhum atendimento ACTIVE encontrado para",
      numero
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
  };

  const citizenKey = normalizePhone(session.citizenNumber);
  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const agentKey = getAgentKey(session.agentNumber);
    if (agentKey) sessionsByAgent.set(agentKey, session);
  }

  console.log(
    `🔄 Sessão do agente recuperada do banco. Agente=${agentFull} Cidadão=${session.citizenNumber}`
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
      existente.atendimentoId
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
    session.agentNumber
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
  agentNumber: string
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
    limiteFila.toISOString()
  );

  const busyCount = await repo
    .createQueryBuilder("a")
    .leftJoin("a.departamento", "d")
    .where("a.status IN (:...statuses)", {
      statuses: ["WAITING_AGENT_CONFIRMATION", "ACTIVE"] as AtendimentoStatus[],
    })
    .andWhere("a.atualizado_em > :limiteBusy", { limiteBusy })
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
    queueCount
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

  console.log(
    "[QUEUE_NEXT] Procurando próximo da fila após encerrar atendimento=",
    sessionEncerrada.atendimentoId,
    "agent=",
    agentNumber,
    "depId=",
    departmentId
  );

  if (!agentNumber && !departmentId) {
    return;
  }

  const qb = repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .where("a.status = :status", { status: "IN_QUEUE" as AtendimentoStatus });

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
      "[QUEUE_NEXT] Nenhum atendimento IN_QUEUE encontrado para este agente/setor."
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
    session.agentNumber ? session.agentNumber : "undefined"
  );

  // --------- mapear comandos do cidadão (para legenda no painel) ---------
  let comandoCodigo: string | null = null;
  let comandoDescricao: string | null = null;

  if (onlyDigits) {
    switch (session.status) {
      case "ASK_DEPARTMENT":
        comandoCodigo = `MENU_DEPARTAMENTO_${onlyDigits}`;
        comandoDescricao = `Cidadão escolheu a opção ${onlyDigits} do menu de setores.`;
        break;

      case "LEAVE_MESSAGE_DECISION":
        if (onlyDigits === "1") {
          comandoCodigo = "LEAVE_MESSAGE_DECISION_1";
          comandoDescricao = "Cidadão optou por deixar um recado detalhado.";
        } else if (onlyDigits === "2") {
          comandoCodigo = "LEAVE_MESSAGE_DECISION_2";
          comandoDescricao =
            "Cidadão optou por não deixar recado e encerrar o atendimento.";
        }
        break;

      case "ASK_SATISFACTION_RESOLUTION":
        if (onlyDigits === "1") {
          comandoCodigo = "SAT_RESOLVED_YES";
          comandoDescricao =
            "Pesquisa de satisfação: informou que o atendimento FOI resolvido.";
        } else if (onlyDigits === "2") {
          comandoCodigo = "SAT_RESOLVED_NO";
          comandoDescricao =
            "Pesquisa de satisfação: informou que o atendimento NÃO foi resolvido.";
        }
        break;

      case "ASK_SATISFACTION_RATING": {
        const nota = parseInt(onlyDigits, 10);
        if (!Number.isNaN(nota) && nota >= 1 && nota <= 5) {
          const labels: Record<number, string> = {
            1: "Péssimo",
            2: "Ruim",
            3: "Regular",
            4: "Bom",
            5: "Ótimo",
          };
          comandoCodigo = `SAT_RATING_${nota}`;
          comandoDescricao = `Pesquisa de satisfação: cidadão deu nota ${nota} (${labels[nota]}).`;
        }
        break;
      }

      case "ASK_ANOTHER_DEPARTMENT":
        if (onlyDigits === "1") {
          comandoCodigo = "ANOTHER_DEPARTMENT_YES";
          comandoDescricao =
            "Cidadão deseja abrir atendimento em outro setor após este.";
        } else if (onlyDigits === "2") {
          comandoCodigo = "ANOTHER_DEPARTMENT_NO";
          comandoDescricao =
            "Cidadão NÃO deseja falar com outro setor (encerramento definitivo).";
        }
        break;

      default:
        break;
    }
  }

  if (
    session.status === "ACTIVE" &&
    (["encerrar", "finalizar", "sair"].includes(trimmedLower) ||
      onlyDigits === "3")
  ) {
    comandoCodigo = "CITIZEN_REQUEST_END";
    comandoDescricao = "Cidadão solicitou encerrar o atendimento.";
  }

  // salva a mensagem do cidadão com o significado interpretado
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
    comandoCodigo: comandoCodigo ?? null,
    comandoDescricao: comandoDescricao ?? null,
  });

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

  if (session.status === "LEAVE_MESSAGE") {
    await sendTextMessage(
      session.citizenNumber,
      "Recebido ✅. Se tiver mais informações, pode enviar. Encerraremos automaticamente em breve."
    );
    scheduleLeaveMessageAutoClose(session);
    return;
  }

  // ---------- Fluxo: Fila (IN_QUEUE) ----------

  if (session.status === "IN_QUEUE") {
    const repo = AppDataSource.getRepository(Atendimento);
    if (session.agentNumber) {
      const normalized = normalizePhone(session.agentNumber);
      const last8 = normalized.slice(-8);

      const queueAhead = await repo
        .createQueryBuilder("a")
        .leftJoin("a.departamento", "d")
        .where("a.status = :status", { status: "IN_QUEUE" as AtendimentoStatus })
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
        session.citizenName
      );

      session.atendimentoId = novoAtendimento.id;
      session.status = "ASK_DEPARTMENT";
      session.departmentId = undefined;
      session.departmentName = undefined;
      session.agentNumber = undefined;
      session.agentName = undefined;
      session.busyReminderCount = 0;
      session.protocolo = undefined;

      // aqui usamos menu SEM rodapé, pois o template já tem o texto final
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

      // menu SEM rodapé para não ficar duplicando texto com o template
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
      // menu padrão COM rodapé
      const menuComRodape = await montarMenuDepartamentos();

      if (session.citizenName && greetingMessage) {
        // aqui usamos o template com menu SEM rodapé pra não repetir texto
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
    session.departmentName = departamento.nome;
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

    const { busy, queueCount } = await getAgentBusyAndQueueCount(
      session.agentNumber
    );

    console.log(
      "[DEPARTAMENTO] Resultado busy=",
      busy,
      ", queueCount=",
      queueCount,
      "para agente=",
      session.agentNumber
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

    // Template + fallback interno
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
      departamentoNome: departamento.nome,
      cidadaoNome: session.citizenName ?? "Cidadão",
      telefoneCidadao: session.citizenNumber,
      resumo: "-", // aqui depois podemos passar a primeira mensagem do cidadão, se quiser
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

  // --------- mapear comandos do agente (para legenda no painel) ---------
  let comandoCodigo: string | null = null;
  let comandoDescricao: string | null = null;

  if (trimmedLower === "ajuda" || trimmedLower === "menu") {
    comandoCodigo = "AGENT_HELP_MENU";
    comandoDescricao = "Agente solicitou ajuda/lista de comandos.";
  }

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (onlyDigits === "1") {
      comandoCodigo = "AGENT_ACCEPT";
      comandoDescricao = "Agente aceitou iniciar o atendimento.";
    } else if (onlyDigits === "2") {
      comandoCodigo = "AGENT_BUSY";
      comandoDescricao =
        "Agente informou que está ocupado e não pode assumir agora.";
    }
  }

  if (
    session.status === "ACTIVE" &&
    (onlyDigits === "3" ||
      trimmedLower === "encerrar" ||
      trimmedLower === "finalizar")
  ) {
    comandoCodigo = "AGENT_REQUEST_END";
    comandoDescricao = "Agente solicitou encerrar o atendimento.";
  }

  if (session.status === "ACTIVE") {
    const words = trimmedLower.split(/\s+/);
    if (words[0] === "transferir" || words[0] === "setor") {
      const idx = words[1];
      if (idx) {
        comandoCodigo = "AGENT_TRANSFER";
        comandoDescricao = `Agente solicitou transferência do atendimento para a opção ${idx} do menu de setores.`;
      }
    }
  }

  // salva a mensagem do agente com os campos de comando
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
    comandoCodigo: comandoCodigo ?? null,
    comandoDescricao: comandoDescricao ?? null,
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
      session.departmentName = novoDep.nome;
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
