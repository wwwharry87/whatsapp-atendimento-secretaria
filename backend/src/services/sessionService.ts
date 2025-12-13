// src/services/sessionService.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { MensagemTipo } from "../entities/Mensagem";
import {
  sendTextMessage,
  sendNovoAtendimentoTemplateToAgent,
  sendSaudacaoPedirNomeTemplate,
} from "./whatsappService";
import { salvarMensagem } from "./messageService";
import {
  setSession,
  invalidateSessionCache,
  Session,
  SessionStatus,
  getOrCreateSession,
  recoverAgentSession,
  sessionsByAgent,
  getAgentKey,
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
  getSaudacaoPorHorario,
  getHorarioAtendimentoTexto,
} from "./horarioService";
import {
  classificarDepartamentoPorIntencaoIA,
  iaEstaHabilitada,
} from "./iaService";
import { callOfflineFlowEngine, OfflineFlowContext } from "./aiFlowService";

// ====================== RE-EXPORT PARA O WEBHOOK ======================
export function isAgentNumber(num: string): boolean {
  return isAgentNumberState(num);
}

// ====================== TIPOS ======================
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

// Map para guardar os timers de inatividade (Memória Volátil)
const inactivityTimers = new Map<string, NodeJS.Timeout>();
const warningTimers = new Map<string, NodeJS.Timeout>();

// ====================== ORQUESTRADOR PRINCIPAL ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, phoneNumberId } = msg;
  const citizenKey = from.replace(/\D/g, "");
  const trimmed = text.trim();
  
  // Limpa timers anteriores ao receber nova mensagem
  clearTimers(citizenKey);

  const session = await getOrCreateSession(citizenKey, phoneNumberId);
  session.lastActiveAt = Date.now();
  if (trimmed) session.lastCitizenText = trimmed;

  console.log(`[SESSION] Status: ${session.status} | Cidadão: ${citizenKey}`);

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

  // Tratamento de Protocolo
  if (await tentarTratarConsultaProtocolo(session, trimmed)) return;

  // ROTEAMENTO DE ESTADOS
  switch (session.status) {
    case "ACTIVE":
    case "WAITING_AGENT_CONFIRMATION":
      await processActiveChat(session, msg);
      break;

    case "IN_QUEUE":
      await sendTextMessage(session.citizenNumber, "Você ainda está na fila. Logo será atendido.", { idcliente: session.idcliente });
      break;

    case "ASK_NAME":
      await processAskName(session, trimmed);
      break;

    case "ASK_DEPARTMENT":
      await processAskDepartment(session, trimmed);
      break;

    case "LEAVE_MESSAGE":
      // Modo Recado: IA inteligente + Timers
      await processLeaveMessageFlow(session, trimmed);
      break;

    case "LEAVE_MESSAGE_DECISION": // Caso antigo/fallback
    case "OFFLINE_POST_AGENT_RESPONSE":
    case "OFFLINE_RATING":
    case "CLOSED":
    case "FINISHED":
      await processOfflineFlow(session, trimmed);
      break;

    default:
      await processAskDepartment(session, trimmed);
      break;
  }

  setSession(session);
}

// ====================== FLUXOS ESPECÍFICOS ======================

async function processActiveChat(session: Session, msg: IncomingMessage) {
  if (msg.text?.toLowerCase() === "encerrar" || msg.text === "3") {
    const protocolo = await fecharAtendimentoComProtocolo(session);
    session.status = "OFFLINE_POST_AGENT_RESPONSE"; 
    await sendTextMessage(session.citizenNumber, `Atendimento encerrado (Prot: ${protocolo}).\nIsso resolveu seu problema?\n1 - Sim\n2 - Não`, { idcliente: session.idcliente });
    return;
  }

  if (!session.agentNumber) {
    await sendTextMessage(
      session.citizenNumber,
      "Seu atendimento está ativo, mas aguardando um agente assumir.",
      { idcliente: session.idcliente }
    );
    return;
  }

  const agentTarget = session.agentNumber; 
  const header = `👤 *${session.citizenName || "Cidadão"}*: `;
  
  if (msg.tipo === "TEXT") {
    await sendTextMessage(agentTarget, `${header}${msg.text}`, { idcliente: session.idcliente });
  } else {
    await sendTextMessage(agentTarget, `${header} enviou uma mídia.`, { idcliente: session.idcliente });
  }
}

async function processAskName(session: Session, text: string) {
  if (!text || text.length < 3) {
    const saudacao = getSaudacaoPorHorario();
    await sendSaudacaoPedirNomeTemplate({
      to: session.citizenNumber,
      saudacao,
      idcliente: session.idcliente,
      phoneNumberId: session.phoneNumberId,
    });
    return;
  }

  session.citizenName = text;
  session.status = "ASK_DEPARTMENT";
  
  const repo = AppDataSource.getRepository(Atendimento);
  await repo.update(session.atendimentoId, { 
    cidadaoNome: text, 
    status: "ASK_DEPARTMENT" 
  });

  const foraHorario = await isOutOfBusinessHoursDB({ idcliente: session.idcliente });
  
  if (foraHorario) {
    // === MUDANÇA: Se estiver fora do horário, avisa MAS mostra o menu ===
    const horarioTxt = await getHorarioAtendimentoTexto({ idcliente: session.idcliente });
    const msg = `Olá, ${text}. No momento não temos atendentes disponíveis.\n${horarioTxt}\n\nPorém, você pode deixar um recado. Por favor, escolha para qual **Setor** deseja encaminhar sua mensagem:`;
    
    // Força mostrar o menu para ele rotear o recado
    await sendMenuInicial(session, msg);
  } else {
    await sendMenuInicial(session);
  }
}

async function processAskDepartment(session: Session, text: string) {
  const idcliente = session.idcliente || 1;
  const num = parseInt(text, 10);

  // Tenta pegar o departamento (seja por número ou IA)
  let depAlvo = null;

  if (!isNaN(num) && num > 0) {
    depAlvo = await getDepartamentoPorIndice(idcliente, num);
  } else {
    // Tenta IA se não for numero
    const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });
    if (iaEstaHabilitada() && text.length > 3) {
      const classif = await classificarDepartamentoPorIntencaoIA({
        mensagemUsuario: text,
        departamentos: deps.map(d => ({ id: d.id, nome: d.nome ?? "Setor", descricao: d.descricao }))
      });
      if (classif.indice && (classif.confianca === "ALTA" || classif.confianca === "MEDIA")) {
        depAlvo = await getDepartamentoPorIndice(idcliente, classif.indice);
      }
    }
  }

  if (depAlvo) {
    // Verifica se esse setor específico está fechado
    const foraHorario = await isOutOfBusinessHoursDB({ idcliente, departamentoId: depAlvo.id });

    if (foraHorario) {
      // === MUDANÇA: Roteia para Modo Recado (LEAVE_MESSAGE) ===
      session.status = "LEAVE_MESSAGE";
      session.departmentId = depAlvo.id;
      session.departmentName = depAlvo.nome ?? undefined;
      session.leaveMessageAckSent = false; // Reset para IA dar oi

      const repo = AppDataSource.getRepository(Atendimento);
      await repo.update(session.atendimentoId, { 
        departamentoId: depAlvo.id,
        status: "LEAVE_MESSAGE" 
      });

      await sendTextMessage(
        session.citizenNumber, 
        `Entendido, encaminharei para o setor *${depAlvo.nome}*.\n\nPode escrever sua mensagem, áudio ou foto agora, que deixarei registrado para a equipe.`, 
        { idcliente: session.idcliente }
      );
      
      // Inicia os timers de silêncio
      scheduleInactivityTimers(session);
      return;
    }

    // Se estiver aberto, segue fluxo normal de chamar agente
    await direcionarParaDepartamento(session, depAlvo);
    return;
  }

  // Se não entendeu o setor
  await sendMenuInicial(session, "Não entendi qual setor você deseja. Por favor, escolha o número abaixo:");
}

/**
 * Novo Fluxo de Recado Inteligente
 */
async function processLeaveMessageFlow(session: Session, text: string) {
  // Garante protocolo se ainda não tem
  if (!session.protocolo) {
    await ensureProtocolForSession(session);
  }

  // 1. Processa a resposta com a IA (aiFlowService)
  // A IA vai agradecer e perguntar se tem mais algo, mas NÃO vai repetir "qual sua demanda"
  const context: OfflineFlowContext = {
    state: "LEAVE_MESSAGE",
    atendimentoStatus: "LEAVE_MESSAGE",
    protocolo: session.protocolo || null,
    cidadaoNome: session.citizenName || null,
    cidadaoNumero: session.citizenNumber,
    canalNome: "Atendimento",
    leaveMessageAckSent: session.leaveMessageAckSent || false
  };

  const decision = await callOfflineFlowEngine(context, text);

  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, { idcliente: session.idcliente });
  }

  session.leaveMessageAckSent = true; // Marca que já falamos "oi/recebido"

  // 2. Renova os Timers de Silêncio
  scheduleInactivityTimers(session);
}

// Fallback para outros status offline (encerramento, pesquisa)
async function processOfflineFlow(session: Session, text: string) {
  const context: OfflineFlowContext = {
    state: session.status,
    atendimentoStatus: session.status, 
    protocolo: session.protocolo || null,
    cidadaoNome: session.citizenName || null,
    cidadaoNumero: session.citizenNumber,
    canalNome: "Atendimento",
    leaveMessageAckSent: session.leaveMessageAckSent || false
  };

  const decision = await callOfflineFlowEngine(context, text);

  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, { idcliente: session.idcliente });
  }

  if (decision.nextState !== session.status) {
    session.status = decision.nextState as SessionStatus;
    await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, { status: decision.nextState as any });
  }

  if (decision.shouldSaveRating && decision.rating) {
     await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, { notaSatisfacao: decision.rating });
  }

  if (decision.shouldCloseAttendance) {
    await fecharAtendimentoComProtocolo(session);
    invalidateSessionCache(session.citizenNumber); 
  }
}

// ====================== TIMERS LOGIC ======================

function clearTimers(citizenKey: string) {
  if (warningTimers.has(citizenKey)) {
    clearTimeout(warningTimers.get(citizenKey)!);
    warningTimers.delete(citizenKey);
  }
  if (inactivityTimers.has(citizenKey)) {
    clearTimeout(inactivityTimers.get(citizenKey)!);
    inactivityTimers.delete(citizenKey);
  }
}

function scheduleInactivityTimers(session: Session) {
  const key = session.citizenNumber;
  const idcliente = session.idcliente;

  // Timer 1: Aviso após 2 minutos (120000 ms)
  const warnTime = 2 * 60 * 1000;
  // Timer 2: Encerramento após +1 minuto (total 3 min do inicio)
  const closeTime = 3 * 60 * 1000; 

  // Aviso
  const warnTimer = setTimeout(async () => {
    // Checa se a sessão ainda existe e está em LEAVE_MESSAGE
    const current = await getOrCreateSession(key);
    if (current.status === "LEAVE_MESSAGE") {
      await sendTextMessage(key, "⏳ Ainda está por aí? Deseja acrescentar mais alguma informação ou posso encerrar e gerar seu protocolo?", { idcliente });
    }
  }, warnTime);

  // Encerramento
  const closeTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);
    if (current.status === "LEAVE_MESSAGE") {
      // Gera protocolo final
      const protocolo = await fecharAtendimentoComProtocolo(current);
      await sendTextMessage(key, `✅ Como não houve interação, estou encerrando o registro.\nProtocolo: *${protocolo}*.\n\nSua demanda foi encaminhada para a equipe.`, { idcliente });
      invalidateSessionCache(key);
    }
    clearTimers(key);
  }, closeTime);

  warningTimers.set(key, warnTimer);
  inactivityTimers.set(key, closeTimer);
}

// ====================== HELPERS ======================

async function sendMenuInicial(session: Session, headerText?: string) {
  const menu = await montarMenuDepartamentos(session.idcliente || 1, { semTitulo: true, semRodape: true });
  const saudacao = headerText || `Olá ${session.citizenName || ""}! Como posso te ajudar hoje?`;
  const body = `${saudacao}\n\n${menu}\n\nDigite o número do setor ou escreva o que precisa.`;
  await sendTextMessage(session.citizenNumber, body, { idcliente: session.idcliente });
}

async function direcionarParaDepartamento(session: Session, departamento: any) {
  const repo = AppDataSource.getRepository(Atendimento);
  session.departmentId = departamento.id;
  session.departmentName = departamento.nome;
  session.agentNumber = departamento.responsavelNumero;
  session.status = "WAITING_AGENT_CONFIRMATION";
  
  await repo.update(session.atendimentoId, {
    departamentoId: departamento.id,
    agenteNumero: departamento.responsavelNumero,
    status: "WAITING_AGENT_CONFIRMATION"
  });

  await sendTextMessage(session.citizenNumber, `Aguarde um momento, estou chamando o responsável pelo setor *${departamento.nome}*.`, { idcliente: session.idcliente });

  if (session.agentNumber) {
     await sendNovoAtendimentoTemplateToAgent({
        to: session.agentNumber,
        citizenName: session.citizenName,
        departmentName: session.departmentName,
        protocolo: session.protocolo,
        idcliente: session.idcliente
     });
  }
}

async function tentarTratarConsultaProtocolo(session: Session, text: string): Promise<boolean> {
   if (!text) return false;
   const codigo = extractProtocolCode(text);
   if (codigo) {
      const repo = AppDataSource.getRepository(Atendimento);
      const atd = await repo.findOne({ where: { protocolo: codigo } });
      if (atd) {
         const desc = mapStatusToDescricao(atd.status);
         await sendTextMessage(session.citizenNumber, `📄 Protocolo ${codigo}\nStatus: ${desc}`, { idcliente: session.idcliente });
         return true;
      }
   }
   return false;
}

// ====================== AGENTE ======================

export async function handleAgentMessage(msg: IncomingMessage) {
  const { from, text = "" } = msg;
  const agentKey = from.replace(/\D/g, "");
  let session = sessionsByAgent.get(getAgentKey(agentKey));
  
  if (!session) session = await recoverAgentSession(agentKey);
  if (!session) return;

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
      if (text === "1") {
          session.status = "ACTIVE";
          await AppDataSource.getRepository(Atendimento).update(session.atendimentoId, { status: "ACTIVE" });
          await sendTextMessage(session.citizenNumber, "O atendente iniciou a conversa.", { idcliente: session.idcliente });
      } else if (text === "2") {
          await sendTextMessage(from, "Ok, deixei na fila.", { idcliente: session.idcliente });
      }
      return;
  }

  if (session.status === "ACTIVE") {
      if (text.toLowerCase() === "encerrar" || text === "3") {
          const protocolo = await fecharAtendimentoComProtocolo(session);
          await sendTextMessage(session.citizenNumber, `Atendimento encerrado pelo agente. Protocolo: ${protocolo}`, { idcliente: session.idcliente });
          invalidateSessionCache(session.citizenNumber); 
          return;
      }
      await sendTextMessage(session.citizenNumber, text, { idcliente: session.idcliente });
  }
}