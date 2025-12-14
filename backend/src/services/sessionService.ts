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

function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
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
      whatsappMessageId: `IA-${Date.now()}-${Math.random().toString(36).substring(7)}` 
    });
  } catch (err) {
    console.error("[SESSION] Erro ao salvar mensagem da IA no banco:", err);
  }
}

async function logAgentMessage(session: Session, texto: string, msg?: IncomingMessage) {
  try {
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
  // 🛡️ CORREÇÃO CRÍTICA: MATADOR DE SESSÃO ZUMBI
  // Se a sessão recuperada estiver "FINISHED" ou presa em "OFFLINE_RATING" antigo,
  // nós a destruímos e começamos uma nova LIMPA imediatamente.
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

  console.log(`[SESSION] Status: ${session.status} | Cidadão: ${citizenKey} | idcliente=${session.idcliente}`);

  // Se for uma sessão nova recém-criada, session.atendimentoId pode ser undefined até o ASK_NAME criar no banco.
  // Mas se já tiver ID, salvamos a mensagem.
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
      // Removido "FINISHED" daqui para garantir que não processe lógica se estiver finalizado
      await processOfflineFlow(session, trimmed);
      break;

    case "FINISHED":
      // Se cair aqui (o que o "Matador de Zumbis" deve evitar), forçamos reinício
      await processAskName(session, trimmed);
      break;

    default:
      await processAskDepartment(session, trimmed);
      break;
  }

  // ✅ Só salva no Redis se NÃO estiver finalizado.
  // Se estiver finished, a própria função de fluxo já deve ter chamado invalidateSessionCache.
  if (session.status !== "FINISHED") {
    await setSession(session);
  }
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

  // Se já existe um atendimento (sessão zumbi ressuscitada), atualizamos.
  // Se não existe, podemos criar agora ou esperar o profile.
  // Pelo logica atual, ASK_NAME é o inicio, então cria se n tiver.
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
    const clienteNomeInfo = await getClientById(session.idcliente || 0);
    // const org = getOrganizationStyle({ displayName: clienteNomeInfo?.nome, orgTipo: null });

    const primeiroNome = session.citizenName?.split(" ")[0] || "";
    let msgIntro = `No momento estamos fechados, ${primeiroNome}.`;

    if (session.userProfile === "FUNCIONARIO") {
      msgIntro += " Mesmo para servidores, o atendimento humano encerrou por hoje.";
    }

    const menu = await montarMenuDepartamentos(session.idcliente || 1, { semTitulo: true, semRodape: true });
    const fullMsg = `${msgIntro}\n${horarioTxt}\n\nMas você pode deixar um recado. Escolha o setor:\n\n${menu}\n\nDigite o número ou o nome da escola/setor.`;

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
  const context: OfflineFlowContext = {
    state: session.status,
    atendimentoStatus: session.status,
    protocolo: session.protocolo || null,
    cidadaoNome: session.citizenName || null,
    cidadaoNumero: session.citizenNumber,
    canalNome: "Atendimento",
    leaveMessageAckSent: session.leaveMessageAckSent || false,
  };

  const decision = await callOfflineFlowEngine(context, text);

  // Envia a resposta (Ex: "Que bom! Avalie com uma nota...")
  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, { idcliente: session.idcliente });
    await logIAMessage(session, decision.replyText);
  }

  // Atualiza o estado da sessão (Ex: muda de OFFLINE_POST_AGENT_RESPONSE para OFFLINE_RATING)
  if (decision.nextState && decision.nextState !== session.status) {
    session.status = decision.nextState as SessionStatus;
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        status: decision.nextState as any,
      });
    }
  }

  // Se salvou uma nota, forçamos o encerramento se o fluxo sugerir ou se já for nota
  if (decision.shouldSaveRating && decision.rating) {
    if (session.atendimentoId) {
      await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
        notaSatisfacao: decision.rating,
      } as any);
    }
    // ✅ FORÇA ENCERRAR AGORA para evitar loop de "Só para confirmar..."
    // Assumimos que se deu nota, acabou.
    await fecharAtendimentoComProtocolo(session);
    session.status = "FINISHED";
    await invalidateSessionCache(session.citizenNumber);
    return;
  }

  // Se o motor de IA decidiu encerrar
  if (decision.shouldCloseAttendance) {
    await fecharAtendimentoComProtocolo(session);
    session.status = "FINISHED";
    await invalidateSessionCache(session.citizenNumber); // ✅ Await e limpeza garantida
    return;
  }
}

// ====================== TIMERS (CUIDADO COM CALLBACKS ASYNC) ======================

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
}

function scheduleInactivityTimers(session: Session) {
  const key = normalizePhone(session.citizenNumber);
  const idcliente = session.idcliente;

  const warnTime = 2 * 60 * 1000;
  const closeTime = 3 * 60 * 1000;

  // ✅ Timer callback agora é async
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

  // ✅ Timer callback agora é async
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

      await invalidateSessionCache(key); // ✅ Await
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
  session.status = "WAITING_AGENT_CONFIRMATION";

  if (session.atendimentoId) {
    await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
      departamentoId: departamento.id,
      agenteNumero: departamento.responsavelNumero,
      status: "WAITING_AGENT_CONFIRMATION" as any,
    });
  }

  const msgDir = `Aguarde um momento, estou chamando o responsável pelo setor *${departamento.nome}*.`;
  await sendTextMessage(session.citizenNumber, msgDir, { idcliente: session.idcliente });
  await logIAMessage(session, msgDir);

  if (session.agentNumber) {
    await sendNovoAtendimentoTemplateToAgent({
      to: session.agentNumber,
      citizenName: session.citizenName,
      departmentName: session.departmentName,
      protocolo: session.protocolo,
      idcliente: session.idcliente,
    });
  }
}

async function tentarTratarConsultaProtocolo(session: Session, text: string): Promise<boolean> {
  if (!text) return false;

  const codigo = extractProtocolCode(text);
  if (!codigo) return false;

  const repo = AppDataSource.getRepository(Atendimento);
  const atd = await repo.findOne({ where: { protocolo: codigo } as any });

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

  // ✅ Garante consistência do cache
  await setSession(session);

  // ✅ salva msg do agente no banco (audit)
  if (msg.tipo === "TEXT" && text) {
    await logAgentMessage(session, text, msg);
  } else if (msg.tipo !== "TEXT") {
    await logAgentMessage(session, "[Mídia/Arquivo do atendente]", msg);
  }

  // Confirmação de atendimento
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (text === "1") {
      session.status = "ACTIVE";

      if (session.atendimentoId) {
        await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, {
          status: "ACTIVE" as any,
        });
      }

      const msgOk = "✅ O atendente iniciou a conversa. Pode enviar sua mensagem.";
      await sendTextMessage(session.citizenNumber, msgOk, { idcliente: session.idcliente });
      await logIAMessage(session, msgOk);

      await setSession(session);
      return;
    }

    if (text === "2") {
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

    // Envia resposta do agente para o cidadão
    if (msg.tipo === "TEXT") {
      await sendTextMessage(session.citizenNumber, text, { idcliente: session.idcliente });
    } else {
      await sendTextMessage(session.citizenNumber, "📎 O atendente enviou uma mídia.", {
        idcliente: session.idcliente,
      });
    }

    await setSession(session);
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