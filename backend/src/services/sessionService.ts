// src/services/sessionService.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem, MensagemTipo } from "../entities/Mensagem";
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
import { getClientById } from "./credentialService";
import { getOrganizationStyle, HumanMessagesService } from "./humanMessages";

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

const inactivityTimers = new Map<string, NodeJS.Timeout>();
const warningTimers = new Map<string, NodeJS.Timeout>();

// ====================== HELPERS DE LOG / HISTÓRICO ======================

async function logIAMessage(session: Session, texto: string) {
  try {
    await salvarMensagem({
      atendimentoId: session.atendimentoId,
      direcao: "IA" as any,
      tipo: "TEXT",
      conteudoTexto: texto,
      remetenteNumero: "IA",
      idcliente: session.idcliente,
      comandoDescricao: "Resposta automática do sistema/IA",
    });
  } catch (err) {
    console.error("[SESSION] Erro ao salvar mensagem da IA no banco:", err);
  }
}

async function getRecentHistory(
  atendimentoId: string
): Promise<Array<{ sender: string; text: string }>> {
  try {
    const repo = AppDataSource.getRepository(Mensagem);
    const msgs = await repo.find({
      where: { atendimentoId },
      order: { criadoEm: "DESC" },
      take: 6,
    });

    return msgs.reverse().map((m) => ({
      sender: m.direcao === "CITIZEN" ? "Cidadão" : "Sistema/Agente",
      text: m.conteudoTexto || "[Mídia/Arquivo]",
    }));
  } catch (error) {
    console.error("Erro ao buscar histórico:", error);
    return [];
  }
}

// ====================== ORQUESTRADOR PRINCIPAL ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, phoneNumberId } = msg;
  const citizenKey = from.replace(/\D/g, "");
  const trimmed = text.trim();

  if (tipo === "TEXT" && !trimmed) {
    return;
  }

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

  if (await tentarTratarConsultaProtocolo(session, trimmed)) return;

  switch (session.status) {
    case "ACTIVE":
    case "WAITING_AGENT_CONFIRMATION":
      await processActiveChat(session, msg);
      break;

    case "IN_QUEUE":
      const msgFila = "Você ainda está na fila. Logo será atendido.";
      await sendTextMessage(session.citizenNumber, msgFila, {
        idcliente: session.idcliente,
      });
      await logIAMessage(session, msgFila);
      break;

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

// ====================== FLUXOS ESPECÍFICOS ======================

async function processActiveChat(session: Session, msg: IncomingMessage) {
  if (msg.text?.toLowerCase() === "encerrar" || msg.text === "3") {
    const protocolo = await fecharAtendimentoComProtocolo(session);
    session.status = "OFFLINE_POST_AGENT_RESPONSE";

    const msgEnc = `Atendimento encerrado (Prot: ${protocolo}).\nIsso resolveu seu problema?\n1 - Sim\n2 - Não`;
    await sendTextMessage(session.citizenNumber, msgEnc, {
      idcliente: session.idcliente,
    });
    await logIAMessage(session, msgEnc);
    return;
  }

  if (!session.agentNumber) {
    const msgWait =
      "Seu atendimento está ativo, mas aguardando um agente assumir.";
    await sendTextMessage(session.citizenNumber, msgWait, {
      idcliente: session.idcliente,
    });
    await logIAMessage(session, msgWait);
    return;
  }

  const agentTarget = session.agentNumber;
  const header = `👤 *${session.citizenName || "Cidadão"}*: `;

  if (msg.tipo === "TEXT") {
    await sendTextMessage(agentTarget, `${header}${msg.text}`, {
      idcliente: session.idcliente,
    });
  } else {
    await sendTextMessage(agentTarget, `${header} enviou uma mídia.`, {
      idcliente: session.idcliente,
    });
  }
}

async function processAskName(session: Session, text: string) {
  if (!text || text.length < 3) {
    const clientInfo = await getClientById(session.idcliente || 0);
    const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });
    
    const saudacao = HumanMessagesService.greetingAskName({
      org,
      seed: session.citizenNumber,
      now: new Date()
    });

    await sendTextMessage(session.citizenNumber, saudacao, { idcliente: session.idcliente });
    await logIAMessage(session, saudacao);
    return;
  }

  session.citizenName = text;
  session.status = "ASK_PROFILE"; 
  const repo = AppDataSource.getRepository(Atendimento);
  await repo.update(session.atendimentoId, { 
    cidadaoNome: text, 
    status: "ASK_PROFILE" 
  });

  const clientInfo = await getClientById(session.idcliente || 0);
  const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });
  
  const msgPerfil = HumanMessagesService.askProfile({
    citizenName: text,
    org,
    seed: session.citizenNumber
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
  
  const repo = AppDataSource.getRepository(Atendimento);
  // Se tiver a coluna perfil no banco: await repo.update(session.atendimentoId, { perfil });
  await repo.update(session.atendimentoId, { status: "ASK_DEPARTMENT" }); 

  await verificarHorarioEMostrarMenu(session);
}

async function verificarHorarioEMostrarMenu(session: Session) {
  const foraHorario = await isOutOfBusinessHoursDB({ idcliente: session.idcliente });
  
  if (foraHorario) {
    const horarioTxt = await getHorarioAtendimentoTexto({ idcliente: session.idcliente });
    const clienteNomeInfo = await getClientById(session.idcliente || 0);
    const org = getOrganizationStyle({ displayName: clienteNomeInfo?.nome, orgTipo: null });

    const primeiroNome = session.citizenName?.split(' ')[0] || "";
    let msgIntro = `No momento estamos fechados, ${primeiroNome}.`;
    
    if (session.userProfile === "FUNCIONARIO") {
      msgIntro += " Mesmo para servidores, o atendimento humano encerrou por hoje.";
    }

    const menu = await montarMenuDepartamentos(session.idcliente || 1, { semTitulo: true, semRodape: true });
    
    const fullMsg = `${msgIntro}\n${horarioTxt}\n\nMas você pode deixar um recado. Escolha o setor:\n\n${menu}\n\nDigite o número ou o nome da escola/setor.`;
    
    await sendTextMessage(session.citizenNumber, fullMsg, { idcliente: session.idcliente });
    await logIAMessage(session, fullMsg);
  } else {
    await sendMenuInicial(session);
  }
}

async function processAskDepartment(session: Session, text: string) {
  const idcliente = session.idcliente || 1;
  const num = parseInt(text, 10);

  let depAlvo = null;

  if (!isNaN(num) && num > 0) {
    depAlvo = await getDepartamentoPorIndice(idcliente, num);
  } 
  
  if (!depAlvo) {
    const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });
    const matchExato = deps.find(d => d.nome?.toLowerCase() === text.toLowerCase());
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

      const repo = AppDataSource.getRepository(Atendimento);
      await repo.update(session.atendimentoId, {
        departamentoId: depAlvo.id,
        status: "LEAVE_MESSAGE",
      });

      const protocolo = await ensureProtocolForSession(session);

      const msgRecado = `Entendido, encaminharei para o setor *${depAlvo.nome}*.\nProtocolo aberto: *${protocolo}*.\n\nPode escrever sua mensagem, áudio ou foto agora, que deixarei registrado para a equipe.`;

      await sendTextMessage(session.citizenNumber, msgRecado, {
        idcliente: session.idcliente,
      });
      await logIAMessage(session, msgRecado);

      scheduleInactivityTimers(session);
      return;
    }

    await direcionarParaDepartamento(session, depAlvo);
    return;
  }

  await sendMenuInicial(session, "Não entendi qual setor você deseja. Por favor, escolha o número abaixo ou digite o nome do setor:");
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
    await sendTextMessage(session.citizenNumber, decision.replyText, {
      idcliente: session.idcliente,
    });
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

  if (decision.replyText) {
    await sendTextMessage(session.citizenNumber, decision.replyText, {
      idcliente: session.idcliente,
    });
    await logIAMessage(session, decision.replyText);
  }

  if (decision.nextState !== session.status) {
    session.status = decision.nextState as SessionStatus;
    await AppDataSource.getRepository(Atendimento).update(
      session.atendimentoId,
      { status: decision.nextState as any }
    );
  }

  if (decision.shouldSaveRating && decision.rating) {
    await AppDataSource.getRepository(Atendimento).update(
      session.atendimentoId,
      { notaSatisfacao: decision.rating }
    );
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

  const warnTime = 2 * 60 * 1000; // 2 minutos
  const closeTime = 3 * 60 * 1000; // 3 minutos totais

  const warnTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);
    if (current.status === "LEAVE_MESSAGE") {
      let msgWarn = "⏳ Ainda está por aí? Se já terminou de enviar os dados, pode fechar a conversa ou apenas aguardar.";
      await sendTextMessage(key, msgWarn, { idcliente });
      await logIAMessage(current, msgWarn);
    }
  }, warnTime);

  const closeTimer = setTimeout(async () => {
    const current = await getOrCreateSession(key);
    if (current.status === "LEAVE_MESSAGE") {
      // AQUI MUDOU: Não encerra (não muda DB para FINISHED). Apenas limpa a RAM.
      const protocolo = current.protocolo || "registrado";
      const msgFinal = `✅ Recebemos suas mensagens.
Protocolo: *${protocolo}*.

Nossa equipe irá analisar e entrar em contato. Se precisar enviar mais algo depois, basta responder aqui.`;

      await sendTextMessage(key, msgFinal, { idcliente });
      await logIAMessage(current, msgFinal);
      
      // Limpa da memória RAM, mas deixa 'LEAVE_MESSAGE' no banco.
      invalidateSessionCache(key);
    }
    clearTimers(key);
  }, closeTime);

  warningTimers.set(key, warnTimer);
  inactivityTimers.set(key, closeTimer);
}

// ====================== HELPERS ======================

async function sendMenuInicial(session: Session, headerText?: string) {
  const idcliente = session.idcliente || 1;
  const menuText = await montarMenuDepartamentos(idcliente, {
    semTitulo: true,
    semRodape: true,
  });
  const clientInfo = await getClientById(idcliente);
  const org = getOrganizationStyle({ displayName: clientInfo?.nome, orgTipo: null });

  let body = "";
  if (headerText) {
    body = `${headerText}\n\n${menuText}\n\nDigite o número ou o nome da escola/setor.`;
  } else {
    const msgHuman = HumanMessagesService.menuMessage({
      org,
      citizenName: session.citizenName,
      menuText,
      seed: session.citizenNumber
    });
    body = msgHuman;
  }

  await sendTextMessage(session.citizenNumber, body, {
    idcliente: session.idcliente,
  });
  await logIAMessage(session, body);
}

async function direcionarParaDepartamento(
  session: Session,
  departamento: any
) {
  const repo = AppDataSource.getRepository(Atendimento);
  session.departmentName = departamento.nome ?? undefined;
  session.departmentId = departamento.id;

  session.agentNumber = departamento.responsavelNumero;
  session.status = "WAITING_AGENT_CONFIRMATION";

  await repo.update(session.atendimentoId, {
    departamentoId: departamento.id,
    agenteNumero: departamento.responsavelNumero,
    status: "WAITING_AGENT_CONFIRMATION",
  });

  const msgDir = `Aguarde um momento, estou chamando o responsável pelo setor *${departamento.nome}*.`;
  await sendTextMessage(session.citizenNumber, msgDir, {
    idcliente: session.idcliente,
  });
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

async function tentarTratarConsultaProtocolo(
  session: Session,
  text: string
): Promise<boolean> {
  if (!text) return false;
  const codigo = extractProtocolCode(text);
  if (codigo) {
    const repo = AppDataSource.getRepository(Atendimento);
    const atd = await repo.findOne({ where: { protocolo: codigo } });
    if (atd) {
      const desc = mapStatusToDescricao(atd.status);
      const msg = `📄 Protocolo ${codigo}\nStatus: ${desc}`;
      await sendTextMessage(session.citizenNumber, msg, {
        idcliente: session.idcliente,
      });
      await logIAMessage(session, msg);
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
      await AppDataSource.getRepository(Atendimento).update(
        session.atendimentoId,
        { status: "ACTIVE" }
      );
      const msgOk = "O atendente iniciou a conversa.";
      await sendTextMessage(session.citizenNumber, msgOk, {
        idcliente: session.idcliente,
      });
      await logIAMessage(session, msgOk);
    } else if (text === "2") {
      await sendTextMessage(from, "Ok, deixei na fila.", {
        idcliente: session.idcliente,
      });
    }
    return;
  }

  if (session.status === "ACTIVE") {
    if (text.toLowerCase() === "encerrar" || text === "3") {
      const protocolo = await fecharAtendimentoComProtocolo(session);
      const msgEnc = `Atendimento encerrado pelo agente. Protocolo: ${protocolo}`;
      await sendTextMessage(session.citizenNumber, msgEnc, {
        idcliente: session.idcliente,
      });
      await logIAMessage(session, msgEnc);
      invalidateSessionCache(session.citizenNumber);
      return;
    }
    await sendTextMessage(session.citizenNumber, text, {
      idcliente: session.idcliente,
    });
  }
}