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
  // Importando as funções que agora vivem no state
  getOrCreateSession,
  recoverAgentSession,
  sessionsByAgent,
  getAgentKey,
  isAgentNumber as isAgentNumberState, // Renomeamos para re-exportar
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
} from "./horarioService";
import {
  classificarDepartamentoPorIntencaoIA,
  iaEstaHabilitada,
} from "./iaService";
import { callOfflineFlowEngine, OfflineFlowContext } from "./aiFlowService";

// ====================== RE-EXPORT PARA O WEBHOOK ======================
// O webhook.ts importa isAgentNumber daqui, então vamos manter o contrato.
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

// ====================== ORQUESTRADOR PRINCIPAL ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, phoneNumberId } = msg;

  const citizenKey = from.replace(/\D/g, "");
  const trimmed = text.trim();
  
  // Agora chama do sessionState
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

  if (await tentarTratarConsultaProtocolo(session, trimmed)) {
    return; 
  }

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
    case "LEAVE_MESSAGE_DECISION":
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

// ====================== FLUXOS ======================

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
    session.status = "LEAVE_MESSAGE_DECISION";
    await repo.update(session.atendimentoId, { status: "LEAVE_MESSAGE_DECISION" });
    await processOfflineFlow(session, text);
  } else {
    await sendMenuInicial(session);
  }
}

async function processAskDepartment(session: Session, text: string) {
  const idcliente = session.idcliente || 1;
  const num = parseInt(text, 10);

  if (!isNaN(num) && num > 0) {
    const dep = await getDepartamentoPorIndice(idcliente, num);
    if (dep) {
      await direcionarParaDepartamento(session, dep);
      return;
    }
  }

  const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });
  
  if (deps.length === 1) {
    await direcionarParaDepartamento(session, deps[0]);
    return;
  }

  if (iaEstaHabilitada() && text.length > 3) {
    const classificacao = await classificarDepartamentoPorIntencaoIA({
      mensagemUsuario: text,
      // CORREÇÃO DO ERRO DE TIPO: nome nunca será null
      departamentos: deps.map(d => ({ 
        id: d.id, 
        nome: d.nome ?? "Setor", 
        descricao: d.descricao 
      }))
    });

    if (classificacao.indice && (classificacao.confianca === "ALTA" || classificacao.confianca === "MEDIA")) {
      const depAlvo = await getDepartamentoPorIndice(idcliente, classificacao.indice);
      if (depAlvo) {
         await direcionarParaDepartamento(session, depAlvo);
         return;
      }
    }
  }

  await sendMenuInicial(session, "Não entendi qual setor você deseja. Por favor, escolha uma opção abaixo:");
}

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
    await sendTextMessage(session.citizenNumber, decision.replyText, { 
      idcliente: session.idcliente 
    });
  }

  if (decision.nextState !== session.status) {
    session.status = decision.nextState as SessionStatus;
    const repo = AppDataSource.getRepository(Atendimento);
    await repo.update(session.atendimentoId, { status: decision.nextState as any });
  }

  if (decision.shouldSaveRating && decision.rating) {
     const repo = AppDataSource.getRepository(Atendimento);
     await repo.update(session.atendimentoId, { notaSatisfacao: decision.rating });
  }

  if (decision.shouldCloseAttendance) {
    await fecharAtendimentoComProtocolo(session);
    invalidateSessionCache(session.citizenNumber); 
  }

  if (session.status === "LEAVE_MESSAGE" && !session.protocolo) {
    await ensureProtocolForSession(session);
    session.leaveMessageAckSent = true; 
  }
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
  
  const foraHorario = await isOutOfBusinessHoursDB({ 
    idcliente: session.idcliente, 
    departamentoId: departamento.id 
  });

  if (foraHorario) {
    session.status = "LEAVE_MESSAGE_DECISION";
    session.departmentId = departamento.id;
    session.departmentName = departamento.nome;
    await repo.update(session.atendimentoId, { 
      departamentoId: departamento.id,
      status: "LEAVE_MESSAGE_DECISION" 
    });
    await processOfflineFlow(session, ""); 
    return;
  }

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
  
  // Agora chama do sessionState
  let session = sessionsByAgent.get(getAgentKey(agentKey));
  
  if (!session) {
      session = await recoverAgentSession(agentKey);
  }

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