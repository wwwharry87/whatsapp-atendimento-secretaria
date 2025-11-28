// src/services/sessionService.ts
import {
  getDepartamentoPorIndice,
  montarMenuDepartamentos
} from "./departmentService";
import { sendTextMessage } from "./whatsappService";
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { salvarMensagem } from "./messageService";
import { MensagemTipo } from "../entities/Mensagem";

export type SessionStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
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
  lastActiveAt?: number; // usado para auto-encerrar por inatividade
};

// caches em memória
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

// chave para mapear agente — usa 11 dígitos finais (ou menos, se não tiver)
function getAgentKey(num?: string | null): string {
  const normalized = normalizePhone(num);
  if (!normalized) return "";
  return normalized.length > 11 ? normalized.slice(-11) : normalized;
}

// ====================== ACESSO AO BANCO ======================

async function criarNovoAtendimento(citizenNumber: string): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: normalizePhone(citizenNumber),
    status: "ASK_NAME" as AtendimentoStatus
  });
  await repo.save(atendimento);
  return atendimento;
}

// novo atendimento, já sabendo o nome (quando o cidadão quer outro setor)
async function criarNovoAtendimentoParaOutroSetor(
  citizenNumber: string,
  citizenName?: string
): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: normalizePhone(citizenNumber),
    cidadaoNome: citizenName,
    status: "ASK_DEPARTMENT" as AtendimentoStatus
  });
  await repo.save(atendimento);
  return atendimento;
}

// carrega um atendimento "ainda em andamento" para esse cidadão
async function carregarAtendimentoAberto(
  citizenNumber: string
): Promise<Atendimento | null> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);

  const atendimento = await repo.findOne({
    where: [
      { cidadaoNumero: numero, status: "ACTIVE" },
      { cidadaoNumero: numero, status: "WAITING_AGENT_CONFIRMATION" },
      { cidadaoNumero: numero, status: "LEAVE_MESSAGE_DECISION" },
      { cidadaoNumero: numero, status: "LEAVE_MESSAGE" }
    ],
    relations: ["departamento"]
  });

  return atendimento;
}

/**
 * Recupera sessão de AGENTE a partir do banco
 * (quando o servidor reinicia e os Maps em memória zeram)
 */
async function recoverAgentSession(agentNumberRaw: string): Promise<Session | null> {
  const agentFull = normalizePhone(agentNumberRaw);
  if (!agentFull) return null;

  const repo = AppDataSource.getRepository(Atendimento);

  const atendimento = await repo.findOne({
    where: [
      { agenteNumero: agentFull, status: "WAITING_AGENT_CONFIRMATION" },
      { agenteNumero: agentFull, status: "ACTIVE" },
      { agenteNumero: agentFull, status: "LEAVE_MESSAGE_DECISION" }
    ],
    relations: ["departamento"]
  });

  if (!atendimento) {
    return null;
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
    lastActiveAt: Date.now()
  };

  const citizenKey = normalizePhone(atendimento.cidadaoNumero);
  const agentKey = getAgentKey(agentFull);

  sessionsByCitizen.set(citizenKey, session);
  sessionsByAgent.set(agentKey, session);

  console.log(
    `🔄 Sessão de agente recuperada do DB: agente=${agentFull}, cidadao=${citizenKey}, status=${session.status}`
  );

  return session;
}

async function getOrCreateSession(citizenNumberRaw: string): Promise<Session> {
  const citizenKey = normalizePhone(citizenNumberRaw);

  const existente = sessionsByCitizen.get(citizenKey);
  if (existente) return existente;

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
    lastActiveAt: Date.now()
  };

  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const key = getAgentKey(session.agentNumber);
    sessionsByAgent.set(key, session);
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

async function fecharAtendimentoComProtocolo(session: Session): Promise<string> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = await repo.findOne({ where: { id: session.atendimentoId } });

  let protocolo = atendimento?.protocolo || null;
  if (!protocolo) {
    protocolo = generateProtocol(session.atendimentoId);
  }

  await repo.update(session.atendimentoId, {
    status: "FINISHED" as AtendimentoStatus,
    encerradoEm: new Date(),
    protocolo
  });

  session.status = "FINISHED";
  return protocolo;
}

// ====================== TIMERS / AUTOMAÇÕES ======================

// auto-encerrar após período em modo "deixar recado"
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
        `Guarde este número para futuras consultas.`
    );

    sessionsByCitizen.delete(citizenKey);
  }, MINUTOS * 60 * 1000);
}

// auto-encerrar atendimento ativo após inatividade
function scheduleActiveAutoClose(session: Session) {
  const citizenKey = normalizePhone(session.citizenNumber);
  const agentFull = session.agentNumber ? normalizePhone(session.agentNumber) : null;
  const agentKey = session.agentNumber ? getAgentKey(session.agentNumber) : null;
  const atendimentoId = session.atendimentoId;

  // ⏱ Tempo de inatividade: 2 minutos (120 segundos)
  const TIMEOUT_MINUTOS = 2;

  const scheduledAt = Date.now();
  session.lastActiveAt = scheduledAt;

  setTimeout(async () => {
    const current = sessionsByCitizen.get(citizenKey);
    if (!current) return;
    if (current.atendimentoId !== atendimentoId) return;
    if (current.status !== "ACTIVE") return;
    if (current.lastActiveAt !== scheduledAt) return; // já houve nova interação

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

    if (agentFull) {
      await sendTextMessage(
        agentFull,
        `💤 O atendimento com ${current.citizenName ?? "o munícipe"} (${current.citizenNumber}) foi encerrado por inatividade.\n` +
          `Protocolo: *${protocolo}*.`
      );
    }

    sessionsByCitizen.delete(citizenKey);
  }, TIMEOUT_MINUTOS * 60 * 1000);
}

// lembretes para agente ocupado / sem responder
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

    // se perdemos a sessão da memória, tenta recuperar a partir do banco
    if (!current) {
      current == await recoverAgentSession(agenteNumeroEnvio);
    }
    if (!current) return;

    if (
      current.atendimentoId !== atendimentoId ||
      current.status !== "WAITING_AGENT_CONFIRMATION"
    ) {
      return;
    }

    if ((current.busyReminderCount ?? 0) >= 3) {
      await sendTextMessage(
        agenteNumeroEnvio,
        "🔔 Limite de lembretes atingido. O cidadão será orientado a deixar um recado."
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

    await sendTextMessage(
      agenteNumeroEnvio,
      `⏰ Você ainda tem um atendimento pendente com *${current.citizenName ?? "o cidadão"}* (${current.citizenNumber}).\n\n` +
        `Digite:\n` +
        `1 - Atender agora\n` +
        `2 - Continuar ocupado`
    );

    scheduleBusyReminder(current);
  }, 2 * 60 * 1000);
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
    fileName
  } = msg;

  const citizenKey = normalizePhone(from);
  const trimmed = text.trim();
  const onlyDigits = trimmed.replace(/\D/g, "");
  const trimmedLower = trimmed.toLowerCase();

  const session = await getOrCreateSession(citizenKey);
  session.lastActiveAt = Date.now();

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
    remetenteNumero: citizenKey
  });

  // 1) decisão sobre deixar recado
  if (session.status === "LEAVE_MESSAGE_DECISION") {
    if (onlyDigits === "1") {
      session.status = "LEAVE_MESSAGE";
      await sendTextMessage(
        session.citizenNumber,
        "Perfeito! 👍\nEscreva sua mensagem com o máximo de detalhes. Você pode enviar texto, fotos, áudios ou documentos.\nTudo ficará registrado."
      );
      scheduleLeaveMessageAutoClose(session);
    } else if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);
      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
      );
      sessionsByCitizen.delete(citizenKey);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Não entendi. Responda apenas:\n1 - Para deixar recado\n2 - Para encerrar o atendimento"
      );
    }
    return;
  }

  // 2) cidadão está deixando recado
  if (session.status === "LEAVE_MESSAGE") {
    await sendTextMessage(
      session.citizenNumber,
      "Recebi sua mensagem. ✅\nSe tiver mais informações, pode continuar enviando.\nEncerramos automaticamente após um tempo sem novas mensagens."
    );
    scheduleLeaveMessageAutoClose(session);
    return;
  }

  // 3) cidadão decidindo se quer outro departamento
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

      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Perfeito! Para qual setor deseja falar agora?\n\n" + menu
      );
    } else if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);
      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
      );
      sessionsByCitizen.delete(citizenKey);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Responda apenas:\n1 - Outro departamento\n2 - Encerrar"
      );
    }
    return;
  }

  // 4) perguntando o nome — NÃO usar "Oi" como nome
  if (session.status === "ASK_NAME") {
    if (!session.citizenName) {
      const greetings = [
        "oi",
        "ola",
        "olá",
        "bom dia",
        "boa tarde",
        "boa noite",
        "teste",
        "iniciar",
        "hi",
        "hello"
      ];
      const isGreeting = greetings.includes(trimmedLower);

      if (!trimmed || trimmed.length < 3 || isGreeting) {
        await sendTextMessage(
          session.citizenNumber,
          "Olá! 🤝\nPara iniciarmos, por favor digite seu *nome completo* (ex.: Maria da Silva Souza)."
        );
        return;
      }

      session.citizenName = trimmed;
      session.status = "ASK_DEPARTMENT";

      await atualizarAtendimento(session, {
        cidadaoNome: session.citizenName,
        status: "ASK_DEPARTMENT"
      });

      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        `Prazer, ${session.citizenName}! 😊\nCom qual Departamento / Setor você deseja falar?\n\n${menu}`
      );
      return;
    }
  }

  // 5) cidadão escolhendo o departamento
  if (session.status === "ASK_DEPARTMENT") {
    const numero = parseInt(trimmed, 10);
    if (isNaN(numero)) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Por favor, digite apenas o número do setor desejado.\n\n" + menu
      );
      return;
    }

    const departamento = await getDepartamentoPorIndice(numero);
    if (!departamento) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Opção inválida. Tente novamente escolhendo um dos números da lista.\n\n" + menu
      );
      return;
    }

    session.departmentId = departamento.id;
    session.departmentName = departamento.nome;
    session.agentNumber = departamento.responsavelNumero || undefined;
    session.agentName = departamento.responsavelNome || "Responsável";
    session.status = "WAITING_AGENT_CONFIRMATION";
    session.busyReminderCount = 0;

    await atualizarAtendimento(session, {
      departamentoId: departamento.id,
      agenteNumero: session.agentNumber,
      agenteNome: session.agentName,
      status: "WAITING_AGENT_CONFIRMATION"
    });

    await sendTextMessage(
      session.citizenNumber,
      `Ótimo! Vou te encaminhar para o setor *${departamento.nome}*.\n` +
        `Estou verificando a disponibilidade do responsável. ⏳\n\n` +
        `Enquanto isso, se quiser, já pode ir explicando sua situação aqui.\n` +
        `Todas as mensagens ficarão registradas para o setor.`
    );

    if (session.agentNumber) {
      const agenteEnvio = normalizePhone(session.agentNumber);
      const key = getAgentKey(session.agentNumber);
      sessionsByAgent.set(key, session);

      await sendTextMessage(
        agenteEnvio,
        `📲 *Nova solicitação - ${departamento.nome}*\n\n` +
          `Munícipe: *${session.citizenName ?? "Não informado"}*\n` +
          `Telefone: ${session.citizenNumber}\n\n` +
          `Digite:\n` +
          `1 - Atender agora\n` +
          `2 - Informar que está ocupado`
      );

      scheduleBusyReminder(session);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Este setor está sem responsável configurado no momento. Sua solicitação foi registrada no sistema."
      );
    }

    return;
  }

  // 6) agente ainda não confirmou
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    await sendTextMessage(
      session.citizenNumber,
      "O responsável ainda não confirmou o atendimento. 🙏\n" +
        "Mas fique tranquilo(a): sua mensagem já está registrada e o setor poderá visualizar tudo.\n\n" +
        "Se quiser, pode continuar explicando sua situação por aqui."
    );
    return;
  }

  // 7) atendimento ativo — troca normal com o agente
  if (session.status === "ACTIVE") {
    // cidadão pode pedir encerramento
    if (
      ["encerrar", "finalizar", "sair"].includes(trimmedLower) ||
      onlyDigits === "3"
    ) {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      if (session.agentNumber) {
        const agenteEnvio = normalizePhone(session.agentNumber);
        const key = getAgentKey(session.agentNumber);
        sessionsByAgent.delete(key);

        await sendTextMessage(
          agenteEnvio,
          `ℹ️ O cidadão encerrou o atendimento.\n` +
            `Munícipe: ${session.citizenName ?? "Munícipe"} (${session.citizenNumber})\n` +
            `Protocolo: *${protocolo}*.`
        );
      }

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado a seu pedido.\nProtocolo: *${protocolo}*.\n` +
          `Se precisar novamente, é só mandar um *oi*.`
      );

      sessionsByCitizen.delete(citizenKey);
      return;
    }

    // mensagem normal → encaminhar para o agente
    if (session.agentNumber) {
      const agenteEnvio = normalizePhone(session.agentNumber);
      let body = `👤 ${session.citizenName ?? "Munícipe"} (${session.citizenNumber}):\n`;

      if (tipo === "TEXT") {
        body += text;
      } else {
        const tipoLabel =
          tipo === "IMAGE"
            ? "uma imagem"
            : tipo === "AUDIO"
            ? "um áudio"
            : tipo === "VIDEO"
            ? "um vídeo"
            : tipo === "DOCUMENT"
            ? "um documento"
            : "um arquivo";
        body += `Enviou ${tipoLabel}.`;
        if (text) {
          body += `\nLegenda: ${text}`;
        }
      }

      await sendTextMessage(agenteEnvio, body);
      scheduleActiveAutoClose(session);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Ocorreu um problema ao localizar o responsável neste momento. Tente novamente mais tarde."
      );
    }
    return;
  }

  if (session.status === "FINISHED") {
    await sendTextMessage(
      session.citizenNumber,
      "Este atendimento já foi encerrado. Se quiser iniciar um novo, mande um *oi*."
    );
    sessionsByCitizen.delete(citizenKey);
    return;
  }

  await sendTextMessage(
    session.citizenNumber,
    "Não entendi. Vamos começar de novo? Mande um *oi*."
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
    fileName
  } = msg;

  const agentFullNumber = normalizePhone(from);
  const key = getAgentKey(from);
  const trimmed = text.trim();
  const trimmedLower = trimmed.toLowerCase();
  const onlyDigits = trimmed.replace(/\D/g, "");

  let session = sessionsByAgent.get(key);

  // se não achou na memória, tenta recuperar do banco
  if (!session) {
    session == await recoverAgentSession(agentFullNumber);
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
    remetenteNumero: agentFullNumber
  });

  // comando de ajuda
  if (trimmedLower === "ajuda" || trimmedLower === "menu") {
    await sendTextMessage(
      agentFullNumber,
      `🛠 *Comandos do Agente*\n\n` +
        `1 - Atender (se pendente)\n` +
        `2 - Ocupado (se pendente)\n` +
        `3 ou "encerrar" - Finalizar atendimento\n` +
        `"transferir X" - Transferir para setor número X\n\n` +
        `Você está falando com: ${session.citizenName ?? "Munícipe"}`
    );
    return;
  }

  // agente encerrando atendimento
  if (
    session.status === "ACTIVE" &&
    (onlyDigits === "3" ||
      trimmedLower === "encerrar" ||
      trimmedLower === "finalizar")
  ) {
    const protocolo = await fecharAtendimentoComProtocolo(session);

    sessionsByAgent.delete(key);
    session.status = "ASK_ANOTHER_DEPARTMENT";

    await sendTextMessage(
      agentFullNumber,
      `✅ Você encerrou este atendimento.\nProtocolo: *${protocolo}*.`
    );

    await sendTextMessage(
      session.citizenNumber,
      `✅ O atendimento com o setor *${session.departmentName}* foi finalizado.\n` +
        `Protocolo: *${protocolo}*.\n\n` +
        `Você deseja falar com *outro departamento*?\n` +
        `1 - Sim\n` +
        `2 - Não, encerrar`
    );

    return;
  }

  // agente confirmando / ocupado
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (onlyDigits === "1") {
      session.status = "ACTIVE";

      await atualizarAtendimento(session, { status: "ACTIVE" });

      await sendTextMessage(
        agentFullNumber,
        `✅ Você iniciou o atendimento com *${session.citizenName ?? "Munícipe"}* (${session.citizenNumber}).`
      );
      await sendTextMessage(
        session.citizenNumber,
        `✅ O responsável de *${session.departmentName}* iniciou o atendimento.\n` +
          `Pode enviar sua mensagem.`
      );

      scheduleActiveAutoClose(session);
      return;
    }

    if (onlyDigits === "2") {
      session.busyReminderCount = 0;
      await sendTextMessage(
        agentFullNumber,
        "Certo, informei ao cidadão que você está ocupado. Quando estiver disponível, responda 1 para iniciar."
      );
      await sendTextMessage(
        session.citizenNumber,
        `O responsável de *${session.departmentName}* está ocupado no momento.\n` +
          `Sua solicitação está registrada e será atendida assim que possível.`
      );

      scheduleBusyReminder(session);
      return;
    }

    await sendTextMessage(
      agentFullNumber,
      "Responda apenas:\n1 - Para atender agora\n2 - Para avisar que está ocupado."
    );
    return;
  }

  // transferência de atendimento para outro setor
  if (session.status === "ACTIVE") {
    const words = trimmedLower.split(/\s+/);
    const cmd = words[0];

    if (cmd === "transferir" || cmd === "setor") {
      const idxStr = words[1];
      const idx = parseInt(idxStr, 10);

      if (isNaN(idx)) {
        await sendTextMessage(
          agentFullNumber,
          "Para transferir, use o formato:\n" +
            `*transferir 7*\n` +
            "Onde 7 é o número do setor no menu de departamentos."
        );
        return;
      }

      const novoDep = await getDepartamentoPorIndice(idx);
      if (!novoDep) {
        await sendTextMessage(
          agentFullNumber,
          "Setor não encontrado. Verifique o número informado e tente novamente."
        );
        return;
      }

      const oldDepName = session.departmentName ?? "Setor atual";

      if (session.agentNumber) {
        const oldKey = getAgentKey(session.agentNumber);
        sessionsByAgent.delete(oldKey);
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
        status: "WAITING_AGENT_CONFIRMATION"
      });

      await sendTextMessage(
        session.citizenNumber,
        `🔄 Seu atendimento está sendo transferido para o setor *${novoDep.nome}*. \n` +
          `Aguarde um momento, por favor.`
      );

      await sendTextMessage(
        agentFullNumber,
        `✅ Atendimento transferido de *${oldDepName}* para *${novoDep.nome}*.\n` +
          `Você não receberá mais mensagens deste cidadão.`
      );

      if (session.agentNumber) {
        const newKey = getAgentKey(session.agentNumber);
        sessionsByAgent.set(newKey, session);

        const novoAgenteZap = normalizePhone(session.agentNumber);
        await sendTextMessage(
          novoAgenteZap,
          `📲 *Atendimento transferido de outro setor*\n\n` +
            `Munícipe: *${session.citizenName ?? "Não informado"}*\n` +
            `Telefone: ${session.citizenNumber}\n` +
            `Setor anterior: *${oldDepName}*\n` +
            `Novo setor: *${novoDep.nome}*\n\n` +
            `Digite:\n` +
            `1 - Para atender agora\n` +
            `2 - Para informar que está ocupado`
        );

        scheduleBusyReminder(session);
      } else {
        await sendTextMessage(
          session.citizenNumber,
          "O novo setor ainda não possui um responsável configurado. Sua solicitação permanece registrada."
        );
      }

      return;
    }
  }

  // troca normal de mensagens agente → cidadão
  if (session.status === "ACTIVE") {
    let body = `👨‍💼 ${session.agentName ?? "Atendente"}:\n`;

    if (tipo === "TEXT") {
      body += text;
    } else {
      const tipoLabel =
        tipo === "IMAGE"
          ? "uma imagem"
          : tipo === "AUDIO"
          ? "um áudio"
          : tipo === "VIDEO"
          ? "um vídeo"
          : tipo === "DOCUMENT"
          ? "um documento"
          : "um arquivo";
      body += `Enviou ${tipoLabel}.`;
      if (text) {
        body += `\nMensagem: ${text}`;
      }
    }

    await sendTextMessage(session.citizenNumber, body);
    scheduleActiveAutoClose(session);
    return;
  }

  if (session.status === "ASK_ANOTHER_DEPARTMENT") {
    await sendTextMessage(
      agentFullNumber,
      "Este atendimento já foi encerrado para este setor. O cidadão está decidindo se quer falar com outro departamento."
    );
    return;
  }

  await sendTextMessage(
    agentFullNumber,
    "No momento não há nenhuma ação pendente para este atendimento ou ele já foi encerrado."
  );
}
