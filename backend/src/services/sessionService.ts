// src/services/sessionService.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem, MensagemTipo } from "../entities/Mensagem";

import {
  sendTextMessage,
  sendNovoAtendimentoTemplateToAgent,
} from "./whatsappService";

import { salvarMensagem } from "./messageService";

import {
  setSession,
  invalidateSessionCache,
  Session,
  SessionStatus,
  getOrCreateSession,
  recoverAgentSession,
  isAgentNumber as isAgentNumberState,
} from "./sessionState";

import {
  fecharAtendimentoComProtocolo,
  ensureProtocolForSession,
  extractProtocolCode,
  mapStatusToDescricao,
} from "./protocolService";

import {
  listarDepartamentos,
  getDepartamentoPorIndice,
  montarMenuDepartamentos,
} from "./departmentService";

import {
  isOutOfBusinessHoursDB,
  getHorarioAtendimentoTexto,
  getSaudacaoPorHorario, // ✅ agora saudação vem do mesmo "relógio" do sistema
} from "./horarioService";

import {
  classificarDepartamentoPorIntencaoIA,
  iaEstaHabilitada,
} from "./iaService";

import { callOfflineFlowEngine, OfflineFlowContext } from "./aiFlowService";
import { getClientById } from "./credentialService";
import { getOrganizationStyle, HumanMessagesService } from "./humanMessages";

/**
 * Mantém compatibilidade com webhook atual.
 */
export function isAgentNumber(num: string): boolean {
  return isAgentNumberState(num);
}

export async function detectIsAgent(from: string, phoneNumberId?: string): Promise<boolean> {
  const normalized = normalizePhone(from);
  // 1) verificação rápida
  if (isAgentNumberState(normalized)) return true;

  // 2) recovery DB/Redis
  const recovered = await recoverAgentSession(normalized, phoneNumberId);
  return !!recovered;
}

export type IncomingMessage = {
  from: string;
  text?: string;
  whatsappMessageId?: string;
  tipo: MensagemTipo;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  phoneNumberId?: string;
};

const inactivityTimers = new Map<string, NodeJS.Timeout>();
const warningTimers = new Map<string, NodeJS.Timeout>();

// Inatividade em chat humano (ACTIVE)
const chatIdleWarnTimers = new Map<string, NodeJS.Timeout>();
const chatIdleAutoCloseTimers = new Map<string, NodeJS.Timeout>();

function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}


function normalizeConfirmOption(text: string): "1" | "2" | "" {
  const raw = (text || "").trim();
  if (!raw) return "";
  if (raw === "1" || raw === "2") return raw as any;

  // Remove acentos e pontuação básica para comparar com botões
  const simplified = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Textos dos botões do template
  if (simplified === "sim vou atender" || (simplified.startsWith("sim") && simplified.includes("atend"))) {
    return "1";
  }
  if (simplified === "nao estou ocupado" || (simplified.startsWith("nao") && simplified.includes("ocup"))) {
    return "2";
  }

  return "";
}

function last8(num: string): string {
  const n = normalizePhone(num);
  return n.length > 8 ? n.slice(-8) : n;
}

// =========================================================================
// LOGS ASSÍNCRONOS
// =========================================================================
async function logIAMessage(session: Session, texto: string) {
  try {
    // ✅ evita crash / erro silencioso quando ainda não há atendimentoId
    if (!session.atendimentoId) return;

    const botNumber = session.phoneNumberId
      ? normalizePhone(session.phoneNumberId)
      : "550000000000";

    const finalRemetente = botNumber || "550000000000";

    await salvarMensagem({
      atendimentoId: session.atendimentoId!,
      direcao: "IA" as any,
      tipo: "TEXT",
      conteudoTexto: texto,
      remetenteNumero: finalRemetente,
      idcliente: session.idcliente,
      comandoDescricao: "Resposta automática do sistema/IA",
      whatsappMessageId: `IA-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    });
  } catch (err) {
    console.error("[SESSION] Erro ao salvar mensagem da IA no banco:", err);
  }
}

async function logAgentMessage(session: Session, texto: string, msg?: IncomingMessage) {
  try {
    if (!session.atendimentoId) return;

    const remetente = normalizePhone(msg?.from || session.agentNumber || "");

    if (!remetente) {
      console.warn("[SESSION] Aviso: Tentativa de logar msg de agente sem número definido.");
      return;
    }

    await salvarMensagem({
      atendimentoId: session.atendimentoId!,
      direcao: "AGENT" as any,
      tipo: msg?.tipo || "TEXT",
      conteudoTexto: texto ?? null,
      whatsappMessageId: msg?.whatsappMessageId,
      whatsappMediaId: msg?.mediaId,
      mimeType: msg?.mimeType,
      fileName: msg?.fileName,
      remetenteNumero: remetente,
      idcliente: session.idcliente,
      comandoDescricao: "Mensagem do atendente",
    });
  } catch (err) {
    console.error("[SESSION] Erro ao salvar mensagem do AGENTE:", err);
  }
}

async function getRecentHistory(atendimentoId?: string): Promise<Array<{ sender: string; text: string }>> {
  if (!atendimentoId) return [];
  try {
    const repo = AppDataSource.getRepository(Mensagem);
    const msgs = await repo.find({
      where: { atendimentoId },
      order: { criadoEm: "DESC" },
      take: 6,
    });

    return msgs.reverse().map((m) => ({
      sender: m.direcao === "CITIZEN" ? "Cidadão" : (m.direcao === "AGENT" ? "Agente" : "Sistema/IA"),
      text: m.conteudoTexto || "[Mídia/Arquivo]",
    }));
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    return [];
  }
}

// ====================== ORQUESTRADOR CIDADÃO ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, phoneNumberId } = msg;
  const citizenKey = normalizePhone(from);
  const trimmed = (text || "").trim();

  if (tipo === "TEXT" && !trimmed) return;

  clearTimers(citizenKey);

  // 1. Recupera sessão do Redis
  let session = await getOrCreateSession(citizenKey, phoneNumberId);

  // ===========================================================================
  // 🛡️ MATADOR DE SESSÃO ZUMBI
  // ===========================================================================
  if (session.status === "FINISHED") {
    console.log(`[SESSION] Sessão Zumbi detectada (FINISHED) para ${citizenKey}. Resetando...`);
    await invalidateSessionCache(citizenKey);
    session = await getOrCreateSession(citizenKey, phoneNumberId); // Recria do zero
  }

  // Atualiza timestamp
  session.lastActiveAt = Date.now();
  session.phoneNumberId = phoneNumberId || session.phoneNumberId;
  if (trimmed) session.lastCitizenText = trimmed;

  // Marca o "último a falar" (para controle de inatividade em chat humano)
  (session as any).lastMessageAt = Date.now();
  (session as any).lastMessageBy = "CITIZEN";

  console.log(`[SESSION] Status: ${session.status} | Cidadão: ${citizenKey} | idcliente=${session.idcliente}`);

  // Se já tiver ID, salvamos a mensagem.
  if (session.atendimentoId) {
    await salvarMensagem({
      atendimentoId: session.atendimentoId,
      direcao: "CITIZEN",
      tipo,
      conteudoTexto: trimmed || null,
      whatsappMessageId: msg.whatsappMessageId,
      whatsappMediaId: msg.mediaId,
      mimeType: msg.mimeType,
      fileName: msg.fileName,
      remetenteNumero: citizenKey,
      idcliente: session.idcliente,
    });
  }

  // Consulta de protocolo "fura" a sessão
  if (await tentarTratarConsultaProtocolo(session, trimmed)) return;

  // Se o sistema pediu confirmação por inatividade (cidadão foi o alvo),
  // tratamos aqui antes do roteamento normal.
  if (session.status === "ACTIVE" && (session as any).pendingIdleTarget === "CITIZEN") {
    const choice = (trimmed || "").replace(/\s+/g, "").trim();

    // Qualquer resposta do cidadão já interrompe o auto-encerramento
    (session as any).pendingIdleTarget = null;
    (session as any).pendingIdleAt = null;

    if (choice === "1" || trimmed.toLowerCase() === "encerrar" || choice === "3") {
      // Reaproveita o mesmo fluxo de encerramento do cidadão
      await processActiveChat(session, { ...msg, text: "encerrar" });
      await setSession(session);
      return;
    }

    if (choice === "2") {
      const ok = "Perfeito! Pode continuar enviando sua mensagem por aqui.";
      await sendTextMessage(session.citizenNumber, ok, { idcliente: session.idcliente });
      await logIAMessage(session, ok);
      await setSession(session);
      // segue para o fluxo normal se houver texto além do "2"
      if (trimmed === "2") return;
    }
  }

  // Roteamento de Estado
  switch (session.status) {
    case "ACTIVE":
    case "WAITING_AGENT_CONFIRMATION":
      await processActiveChat(session, msg);
      break;

    case "IN_QUEUE": {
      const msgFila = "Você ainda está na fila. Logo será atendido.";
      await sendTextMessage(session.citizenNumber, msgFila, { idcliente: session.idcliente });
      await logIAMessage(session, msgFila);
      break;
    }

    case "ASK_NAME":
      await processAskName(session, trimmed);
      break;

    case "ASK_PROFILE":
      await processAskProfile(session, trimmed);
      break;

    case "ASK_DEPARTMENT":
      await processAskDepartment(session, trimmed);
      break;

    case "LEAVE_MESSAGE":
      await processLeaveMessageFlow(session, trimmed);
      break;

    case "WAITING_AGENT":
    case "LEAVE_MESSAGE_DECISION":
    case "OFFLINE_POST_AGENT_RESPONSE":
    case "OFFLINE_RATING":
      await processOfflineFlow(session, trimmed);
      break;

    case "FINISHED":
      await processAskName(session, trimmed);
      break;

    default:
      await processAskDepartment(session, trimmed);
      break;
  }

  if (session.status !== "FINISHED") {
    await setSession(session);
  }

  // Agenda timer de inatividade para chat humano
  scheduleActiveChatInactivityTimers(session);
}

// ====================== FLUXOS CIDADÃO ======================

async function processActiveChat(session: Session, msg: IncomingMessage) {
  const text = (msg.text || "").trim();

  // Encerramento pelo cidadão durante chat
  if (msg.tipo === "TEXT" && (text.toLowerCase() === "encerrar" || text === "3")) {
    const protocolo = await fecharAtendimentoComProtocolo(session);

    session.status = "OFFLINE_POST_AGENT_RESPONSE";
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        status: "OFFLINE_POST_AGENT_RESPONSE" as any,
      });
    }

    const msgEnc = `Atendimento encerrado (Prot: *${protocolo}*).\nIsso resolveu seu problema?\n1 - Sim\n2 - Não`;
    await sendTextMessage(session.citizenNumber, msgEnc, { idcliente: session.idcliente });
    await logIAMessage(session, msgEnc);
    return;
  }

  if (!session.agentNumber) {
    const msgWait = "Seu atendimento está ativo, mas aguardando um agente assumir.";
    await sendTextMessage(session.citizenNumber, msgWait, { idcliente: session.idcliente });
    await logIAMessage(session, msgWait);
    return;
  }

  const agentTarget = normalizePhone(session.agentNumber);
  const header = `👤 *${session.citizenName || "Cidadão"}*: `;

  if (msg.tipo === "TEXT") {
    await sendTextMessage(agentTarget, `${header}${msg.text}`, { idcliente: session.idcliente });
  } else {
    await sendTextMessage(agentTarget, `${header} enviou uma mídia.`, { idcliente: session.idcliente });
  }
}

async function processAskName(session: Session, text: string) {
  // Se não tiver texto ou for muito curto, repete saudação
  if (!text || text.length < 3) {
    const clientInfo = await getClientById(session.idcliente || 0);
    const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });

    // ✅ HumanMessagesService agora calcula saudação no timezone certo (DEFAULT_TIMEZONE)
    const saudacao = HumanMessagesService.greetingAskName({
      org,
      seed: session.citizenNumber,
      now: new Date(),
    });

    await sendTextMessage(session.citizenNumber, saudacao, { idcliente: session.idcliente });
    await logIAMessage(session, saudacao);
    return;
  }

  session.citizenName = text;
  session.status = "ASK_PROFILE";

  if (session.atendimentoId) {
    await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
      cidadaoNome: text,
      status: "ASK_PROFILE" as any,
    });
  }

  const clientInfo = await getClientById(session.idcliente || 0);
  const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });

  const msgPerfil = HumanMessagesService.askProfile({
    citizenName: text,
    org,
    seed: session.citizenNumber,
  });

  const opcoes = `\n1 - Sou Funcionário/Servidor\n2 - Sou da Comunidade (Pai/Aluno/Cidadão)`;
  await sendTextMessage(session.citizenNumber, msgPerfil + opcoes, { idcliente: session.idcliente });
  await logIAMessage(session, msgPerfil + opcoes);
}

async function processAskProfile(session: Session, text: string) {
  const num = text.replace(/\D/g, "");
  const cleanText = text.toLowerCase();

  let perfil: "FUNCIONARIO" | "COMUNIDADE" | null = null;

  if (num === "1" || cleanText.includes("funcionario") || cleanText.includes("servidor")) {
    perfil = "FUNCIONARIO";
  } else if (num === "2" || cleanText.includes("comunidade") || cleanText.includes("pai") || cleanText.includes("aluno")) {
    perfil = "COMUNIDADE";
  }

  if (!perfil) {
    const msgErro = "Desculpe, não entendi. Por favor, digite:\n1 - Funcionário\n2 - Comunidade";
    await sendTextMessage(session.citizenNumber, msgErro, { idcliente: session.idcliente });
    await logIAMessage(session, msgErro);
    return;
  }

  session.userProfile = perfil;
  session.status = "ASK_DEPARTMENT";

  if (session.atendimentoId) {
    await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
      status: "ASK_DEPARTMENT" as any,
    });
  }

  await verificarHorarioEMostrarMenu(session);
}

async function verificarHorarioEMostrarMenu(session: Session) {
  const foraHorario = await isOutOfBusinessHoursDB({ idcliente: session.idcliente });

  if (foraHorario) {
    const horarioTxt = await getHorarioAtendimentoTexto({ idcliente: session.idcliente });

    const primeiroNome = session.citizenName?.split(" ")[0] || "";
    const saudacao = getSaudacaoPorHorario(); // ✅ timezone correto

    let msgIntro = `${saudacao}${primeiroNome ? `, ${primeiroNome}` : ""}! No momento estamos fora do horário de atendimento.`;

    if (session.userProfile === "FUNCIONARIO") {
      msgIntro += " Mesmo para servidores, o atendimento humano encerrou por hoje.";
    }

    const menu = await montarMenuDepartamentos(session.idcliente || 1, { semTitulo: true, semRodape: true });
    const fullMsg =
      `${msgIntro}\n${horarioTxt}\n\n` +
      `Mas você pode deixar um recado. Escolha o setor:\n\n${menu}\n\n` +
      `Digite o número ou o nome da escola/setor.`;

    await sendTextMessage(session.citizenNumber, fullMsg, { idcliente: session.idcliente });
    await logIAMessage(session, fullMsg);
    return;
  }

  await sendMenuInicial(session);
}

async function processAskDepartment(session: Session, text: string) {
  const idcliente = session.idcliente || 1;
  const num = parseInt(text, 10);

  let depAlvo: any = null;

  if (!isNaN(num) && num > 0) {
    depAlvo = await getDepartamentoPorIndice(idcliente, num);
  }

  if (!depAlvo) {
    const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });

    const matchExato = deps.find((d) => (d.nome || "").toLowerCase() === text.toLowerCase());
    if (matchExato) {
      depAlvo = matchExato;
    } else if (iaEstaHabilitada() && text.length > 2) {
      const classif = await classificarDepartamentoPorIntencaoIA({
        mensagemUsuario: text,
        departamentos: deps.map((d) => ({
          id: d.id,
          nome: d.nome ?? "Setor",
          descricao: d.descricao,
        })),
      });

      if (classif.indice && (classif.confianca === "ALTA" || classif.confianca === "MEDIA")) {
        depAlvo = await getDepartamentoPorIndice(idcliente, classif.indice);
      }
    }
  }

  if (depAlvo) {
    const foraHorario = await isOutOfBusinessHoursDB({
      idcliente,
      departamentoId: depAlvo.id,
    });

    if (foraHorario) {
      session.status = "LEAVE_MESSAGE";
      session.departmentId = depAlvo.id;
      session.departmentName = depAlvo.nome ?? undefined;
      session.leaveMessageAckSent = false;

      if (session.atendimentoId) {
        await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
          departamentoId: depAlvo.id,
          status: "LEAVE_MESSAGE" as any,
        });
      }

      const protocolo = await ensureProtocolForSession(session);

      const msgRecado =
        `Entendido, encaminharei para o setor *${depAlvo.nome}*.\n` +
        `Protocolo aberto: *${protocolo}*.\n\n` +
        `Pode escrever sua mensagem, áudio ou foto agora, que deixarei registrado para a equipe.`;

      await sendTextMessage(session.citizenNumber, msgRecado, { idcliente: session.idcliente });
      await logIAMessage(session, msgRecado);

      scheduleInactivityTimers(session);
      return;
    }

    await direcionarParaDepartamento(session, depAlvo);
    return;
  }

  await sendMenuInicial(
    session,
    "Não entendi qual setor você deseja. Por favor, escolha o número abaixo ou digite o nome do setor:"
  );
}

async function processLeaveMessageFlow(session: Session, text: string) {
  if (!session.protocolo) {
    await ensureProtocolForSession(session);
  }

  const history = await getRecentHistory(session.atendimentoId);

  const context: OfflineFlowContext = {
    state: "LEAVE_MESSAGE",
    atendimentoStatus: "LEAVE_MESSAGE",
    protocolo: session.protocolo || null,
    cidadaoNome: session.citizenName || null,
    cidadaoNumero: session.citizenNumber,
    canalNome: "Atendimento",
    leaveMessageAckSent: session.leaveMessageAckSent || false,
    lastMessages: history,
  };

  const decision = await callOfflineFlowEngine(context, text);

  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, { idcliente: session.idcliente });
    await logIAMessage(session, decision.replyText);
  }

  session.leaveMessageAckSent = true;
  scheduleInactivityTimers(session);
}

async function processOfflineFlow(session: Session, text: string) {
  const history = await getRecentHistory(session.atendimentoId);

  const context: OfflineFlowContext = {
    state: session.status,
    atendimentoStatus: session.status,
    protocolo: session.protocolo || null,
    cidadaoNome: session.citizenName || null,
    cidadaoNumero: session.citizenNumber,
    canalNome: "Atendimento",
    leaveMessageAckSent: session.leaveMessageAckSent || false,
    lastMessages: history,
  };

  const decision = await callOfflineFlowEngine(context, text);

  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, { idcliente: session.idcliente });
    await logIAMessage(session, decision.replyText);
  }

  if (decision.nextState && decision.nextState !== session.status) {
    session.status = decision.nextState as SessionStatus;
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        status: decision.nextState as any,
      });
    }
  }

  if (decision.shouldSaveRating && decision.rating) {
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        notaSatisfacao: decision.rating,
      } as any);
    }

    await fecharAtendimentoComProtocolo(session);
    session.status = "FINISHED";
    await invalidateSessionCache(session.citizenNumber);
    return;
  }

  if (decision.shouldCloseAttendance) {
    await fecharAtendimentoComProtocolo(session);
    session.status = "FINISHED";
    await invalidateSessionCache(session.citizenNumber);
    return;
  }
}

// ====================== TIMERS ======================

function clearTimers(citizenKey: string) {
  const key = normalizePhone(citizenKey);

  const w = warningTimers.get(key);
  if (w) {
    clearTimeout(w);
    warningTimers.delete(key);
  }

  const t = inactivityTimers.get(key);
  if (t) {
    clearTimeout(t);
    inactivityTimers.delete(key);
  }

  const cw = chatIdleWarnTimers.get(key);
  if (cw) {
    clearTimeout(cw);
    chatIdleWarnTimers.delete(key);
  }

  const cc = chatIdleAutoCloseTimers.get(key);
  if (cc) {
    clearTimeout(cc);
    chatIdleAutoCloseTimers.delete(key);
  }
}

function scheduleActiveChatInactivityTimers(session: Session) {
  const key = normalizePhone(session.citizenNumber);
  if (!key) return;

  // Apenas quando há chat humano ativo
  if (session.status !== "ACTIVE") return;
  if (!session.agentNumber) return;

  const idcliente = session.idcliente;

  // 10 minutos de inatividade -> aviso
  const warnAfterMs = 10 * 60 * 1000;
  // Se o último a falar foi o agente e o cidadão não respondeu, após o aviso
  // aguardamos mais 5 minutos e encerramos automaticamente.
  const autoCloseAfterWarnMs = 5 * 60 * 1000;

  const warnTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);
    if (current.status !== "ACTIVE") return;

    const lastAt = (current as any).lastMessageAt || current.lastActiveAt || 0;
    const lastBy = (current as any).lastMessageBy as ("CITIZEN" | "AGENT" | undefined);
    const idleMs = Date.now() - Number(lastAt || 0);
    if (!lastAt || idleMs < warnAfterMs) return;

    // Evita spam: não manda o mesmo aviso repetido se já avisou e ninguém falou.
    const alreadyWarnedAt = (current as any).idleWarnSentAt as number | undefined;
    if (alreadyWarnedAt && alreadyWarnedAt >= lastAt) return;

    (current as any).idleWarnSentAt = Date.now();

    // Se o último a falar foi o cidadão, quem deve ser cutucado é o agente.
    if (lastBy === "CITIZEN") {
      const agentTarget = normalizePhone(current.agentNumber || "");
      if (!agentTarget) return;

      (current as any).pendingIdleTarget = "AGENT";
      (current as any).pendingIdleAt = Date.now();

      const nomeCid = current.citizenName || "Cidadão";
      const msgAgent =
        `⏳ Sem interação há 10 minutos. O(a) *${nomeCid}* enviou mensagem e ainda aguarda retorno.\n\n` +
        `Você deseja encerrar este atendimento?\n1 - Continuar\n2 - Encerrar`;

      await sendTextMessage(agentTarget, msgAgent, { idcliente });
      await logIAMessage(current, msgAgent);

      await setSession(current);
      return;
    }

    // Se o último a falar foi o agente, o aviso vai para o cidadão.
    const agentName = current.agentName || "Atendente";
    (current as any).pendingIdleTarget = "CITIZEN";
    (current as any).pendingIdleAt = Date.now();

    const msgCitizen =
      `⏳ Faz 10 minutos que estamos sem novas mensagens.\n` +
      `Se você ainda precisa de ajuda, é só responder aqui.\n\n` +
      `Deseja encerrar este atendimento agora?\n1 - Sim, encerrar\n2 - Não, continuar`;

    await sendTextMessage(current.citizenNumber, msgCitizen, { idcliente });
    await logIAMessage(current, msgCitizen);

    // Agenda auto-encerramento (somente quando o último a falar foi o agente)
    const autoCloseTimer = setTimeout(async () => {
      const cur2 = await getOrCreateSession(key);
      if (cur2.status !== "ACTIVE") return;

      const lastAt2 = (cur2 as any).lastMessageAt || cur2.lastActiveAt || 0;
      const lastBy2 = (cur2 as any).lastMessageBy as ("CITIZEN" | "AGENT" | undefined);
      const warnSentAt2 = (cur2 as any).idleWarnSentAt as number | undefined;

      // só auto-fecha se nada mudou desde o aviso e o último a falar continua sendo o agente
      if (!warnSentAt2) return;
      if (lastBy2 !== "AGENT") return;
      if (Number(lastAt2 || 0) > warnSentAt2) return;

      await closeAttendanceDueToInactivity(cur2, { reason: "CITIZEN_INACTIVE" });
    }, autoCloseAfterWarnMs);

    chatIdleAutoCloseTimers.set(key, autoCloseTimer);
    await setSession(current);
  }, warnAfterMs);

  chatIdleWarnTimers.set(key, warnTimer);
}

async function closeAttendanceDueToInactivity(session: Session, opts: { reason: "CITIZEN_INACTIVE" }) {
  try {
    clearTimers(session.citizenNumber);

    const protocolo = await fecharAtendimentoComProtocolo(session);

    session.status = "OFFLINE_POST_AGENT_RESPONSE";
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        status: "OFFLINE_POST_AGENT_RESPONSE" as any,
      });
    }

    const msgCitizen =
      `✅ Encerramos este atendimento por falta de resposta.\n` +
      `Protocolo: *${protocolo}*.\n\n` +
      `Sua solicitação foi resolvida?\n1 - Sim\n2 - Não`;

    await sendTextMessage(session.citizenNumber, msgCitizen, { idcliente: session.idcliente });
    await logIAMessage(session, msgCitizen);

    // Notifica o agente (se houver)
    if (session.agentNumber) {
      const agentTarget = normalizePhone(session.agentNumber);
      if (agentTarget) {
        const msgAgent = `ℹ️ Atendimento *${protocolo}* encerrado automaticamente por inatividade do cidadão.`;
        await sendTextMessage(agentTarget, msgAgent, { idcliente: session.idcliente });
        await logIAMessage(session, msgAgent);
      }
    }

    await setSession(session);
  } catch (err) {
    console.error("[SESSION] Erro ao encerrar por inatividade:", err);
  }
}

function scheduleInactivityTimers(session: Session) {
  const key = normalizePhone(session.citizenNumber);
  const idcliente = session.idcliente;

  const warnTime = 2 * 60 * 1000;
  const closeTime = 3 * 60 * 1000;

  const warnTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);

    if (current.status === "LEAVE_MESSAGE") {
      let msgWarn =
        "⏳ Ainda está por aí? Se já terminou de enviar os dados, pode fechar a conversa ou apenas aguardar.";

      if (current.protocolo) {
        msgWarn = `⏳ Ainda está por aí? Caso tenha concluído, posso encerrar o protocolo *${current.protocolo}*?`;
      }

      await sendTextMessage(key, msgWarn, { idcliente });
      await logIAMessage(current, msgWarn);
    }
  }, warnTime);

  const closeTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);

    if (current.status === "LEAVE_MESSAGE") {
      const protocolo = current.protocolo || "registrado";
      const msgFinal =
        `✅ Recebemos suas mensagens.\nProtocolo: *${protocolo}*.\n\n` +
        `Nossa equipe irá analisar e entrar em contato. Se precisar enviar mais algo depois, basta responder aqui.`;

      await sendTextMessage(key, msgFinal, { idcliente });
      await logIAMessage(current, msgFinal);

      if (current.atendimentoId) {
        await AppDataSource.getRepository(Atendimento).update(current.atendimentoId, {
          status: "WAITING_AGENT" as any,
        });
      }

      await invalidateSessionCache(key);
    }

    clearTimers(key);
  }, closeTime);

  warningTimers.set(key, warnTimer);
  inactivityTimers.set(key, closeTimer);
}

// ====================== HELPERS MENU / DIRECIONAMENTO ======================

async function sendMenuInicial(session: Session, headerText?: string) {
  const idcliente = session.idcliente || 1;

  const menuText = await montarMenuDepartamentos(idcliente, { semTitulo: true, semRodape: true });
  const clientInfo = await getClientById(idcliente);
  const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });

  const body = headerText
    ? `${headerText}\n\n${menuText}\n\nDigite o número ou o nome da escola/setor.`
    : HumanMessagesService.menuMessage({
        org,
        citizenName: session.citizenName,
        menuText,
        seed: session.citizenNumber,
      });

  await sendTextMessage(session.citizenNumber, body, { idcliente: session.idcliente });
  await logIAMessage(session, body);
}

async function direcionarParaDepartamento(session: Session, departamento: any) {
  session.departmentName = departamento.nome ?? undefined;
  session.departmentId = departamento.id;

  session.agentNumber = departamento.responsavelNumero;
  session.agentName = departamento.responsavelNome ?? session.agentName;
  session.status = "WAITING_AGENT_CONFIRMATION";

  if (session.atendimentoId) {
    await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
      departamentoId: departamento.id,
      agenteNumero: departamento.responsavelNumero,
      agenteNome: departamento.responsavelNome ?? null,
      status: "WAITING_AGENT_CONFIRMATION" as any,
    });
  }

  const msgDir = `Aguarde um momento, estou chamando o responsável pelo setor *${departamento.nome}*.`;
  await sendTextMessage(session.citizenNumber, msgDir, { idcliente: session.idcliente });
  await logIAMessage(session, msgDir);

  if (session.agentNumber && session.idcliente != null) {
    await sendNovoAtendimentoTemplateToAgent({
      to: session.agentNumber,
      citizenName: session.citizenName,
      citizenPhone: session.citizenNumber,
      idcliente: session.idcliente,
    });
  }
}

async function tentarTratarConsultaProtocolo(session: Session, text: string): Promise<boolean> {
  if (!text) return false;

  const codigo = extractProtocolCode(text);
  if (!codigo) return false;

  const repo = AppDataSource.getRepository(Atendimento);
  const atd = await repo.findOne({ where: { idcliente: session.idcliente as any, protocolo: codigo } as any });

  if (atd) {
    const desc = mapStatusToDescricao(atd.status);
    const msg = `📄 Protocolo ${codigo}\nStatus: ${desc}`;
    await sendTextMessage(session.citizenNumber, msg, { idcliente: session.idcliente });
    await logIAMessage(session, msg);
    return true;
  }

  return false;
}

// ====================== ORQUESTRADOR AGENTE ======================

export async function handleAgentMessage(msg: IncomingMessage) {
  const from = normalizePhone(msg.from);
  const text = (msg.text || "").trim();
  const phoneNumberId = msg.phoneNumberId;

  // 1) tenta recover no banco/redis com phoneNumberId (multi-tenant correto)
  let session = await recoverAgentSession(from, phoneNumberId);

  if (!session) {
    console.log(`[AGENT] Nenhuma sessão ativa encontrada para agente ${from}`);
    return;
  }

  // Qualquer interação do agente reinicia o timer de inatividade do chat humano
  clearTimers(session.citizenNumber);

  // Marca o "último a falar" (para controle de inatividade)
  session.lastActiveAt = Date.now();
  (session as any).lastMessageAt = Date.now();
  (session as any).lastMessageBy = "AGENT";

  await setSession(session);

  if (msg.tipo === "TEXT" && text) {
    await logAgentMessage(session, text, msg);
  } else if (msg.tipo !== "TEXT") {
    await logAgentMessage(session, "[Mídia/Arquivo do atendente]", msg);
  }

  // Confirmação de atendimento
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    const opt = normalizeConfirmOption(text);
    if (opt === "1") {
      session.status = "ACTIVE";

      if (session.atendimentoId) {
        await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
          status: "ACTIVE" as any,
        });
      }

      const nomeAg = session.agentName || "Atendente";
      const msgOk = `✅ *${nomeAg}* iniciou a conversa. Pode enviar sua mensagem.`;
      await sendTextMessage(session.citizenNumber, msgOk, { idcliente: session.idcliente });
      await logIAMessage(session, msgOk);

      await setSession(session);
      scheduleActiveChatInactivityTimers(session);
      return;
    }

    if (opt === "2") {
      const msgFila = "Ok, deixei este atendimento na fila.";
      await sendTextMessage(from, msgFila, { idcliente: session.idcliente });
      return;
    }

    await sendTextMessage(from, "Responda:\n1 - Assumir atendimento\n2 - Deixar na fila", {
      idcliente: session.idcliente,
    });
    return;
  }

  // Atendimento ativo
  if (session.status === "ACTIVE") {
    // Se o sistema pediu confirmação por inatividade (agente foi o alvo), tratamos aqui.
    if ((session as any).pendingIdleTarget === "AGENT") {
      const choice = (text || "").replace(/\s+/g, "").trim();

      (session as any).pendingIdleTarget = null;
      (session as any).pendingIdleAt = null;

      if (choice === "2") {
        // Encerrar pelo agente
        const protocolo = await fecharAtendimentoComProtocolo(session);

        session.status = "OFFLINE_POST_AGENT_RESPONSE";
        if (session.atendimentoId) {
          await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
            status: "OFFLINE_POST_AGENT_RESPONSE" as any,
          });
        }

        const msgEnc =
          `Atendimento encerrado pelo agente. Protocolo: *${protocolo}*.\n\n` +
          `Sua solicitação foi resolvida?\n1 - Sim\n2 - Não`;

        await sendTextMessage(session.citizenNumber, msgEnc, { idcliente: session.idcliente });
        await logIAMessage(session, msgEnc);

        await setSession(session);
        return;
      }

      if (choice === "1") {
        const ok = "✅ Certo! Você pode continuar respondendo o cidadão normalmente.";
        await sendTextMessage(from, ok, { idcliente: session.idcliente });
        // se a mensagem foi apenas "1", não encaminha para o cidadão
        if (text === "1") {
          scheduleActiveChatInactivityTimers(session);
          return;
        }
      }
    }

    if (text.toLowerCase() === "encerrar" || text === "3") {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      session.status = "OFFLINE_POST_AGENT_RESPONSE";
      if (session.atendimentoId) {
        await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
          status: "OFFLINE_POST_AGENT_RESPONSE" as any,
        });
      }

      const msgEnc =
        `Atendimento encerrado pelo agente. Protocolo: *${protocolo}*.\n\n` +
        `Sua solicitação foi resolvida?\n1 - Sim\n2 - Não`;

      await sendTextMessage(session.citizenNumber, msgEnc, { idcliente: session.idcliente });
      await logIAMessage(session, msgEnc);

      await setSession(session);
      return;
    }

    const agentName = session.agentName || "Atendente";
    const header = `🧑‍💼 *${agentName}*: `;

    if (msg.tipo === "TEXT") {
      await sendTextMessage(session.citizenNumber, `${header}${text}`, { idcliente: session.idcliente });
    } else {
      await sendTextMessage(session.citizenNumber, `${header}enviou uma mídia.`, {
        idcliente: session.idcliente,
      });
    }

    await setSession(session);
    scheduleActiveChatInactivityTimers(session);
    return;
  }

  if (session.status === "OFFLINE_POST_AGENT_RESPONSE" || session.status === "OFFLINE_RATING") {
    await sendTextMessage(from, "Este atendimento está em fase de pesquisa/encerramento.", {
      idcliente: session.idcliente,
    });
    return;
  }

  await sendTextMessage(from, "Não há atendimento ativo para responder no momento.", {
    idcliente: session.idcliente,
  });
}