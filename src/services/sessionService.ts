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
  lastActiveAt?: number;
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
  // assim não importa se veio com +55, 0 na frente, etc.
  return normalized.slice(-8);
}

// ====================== BANCO / ATENDIMENTOS ======================

async function criarNovoAtendimento(citizenNumber: string): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: normalizePhone(citizenNumber),
    status: "ASK_NAME" as AtendimentoStatus
  });
  await repo.save(atendimento);
  return atendimento;
}

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

async function carregarAtendimentoAberto(
  citizenNumber: string
): Promise<Atendimento | null> {
  const repo = AppDataSource.getRepository(Atendimento);
  const numero = normalizePhone(citizenNumber);

  const atendimento = await repo.findOne({
    where: {
      cidadaoNumero: numero,
      status: "ACTIVE"
    },
    relations: ["departamento"],
    order: { criadoEm: "DESC" }
  });

  return atendimento;
}

/**
 * Recupera sessão de AGENTE direto do banco caso o mapa em memória tenha se perdido
 * (ex: restart do servidor ou key de agente não bateu).
 */
async function recoverAgentSession(agentNumberRaw: string): Promise<Session | undefined> {
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
        "LEAVE_MESSAGE_DECISION"
      ] as AtendimentoStatus[]
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

  // se o número salvo no atendimento estiver diferente do real, corrige
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
    lastActiveAt: Date.now()
  };

  const citizenKey = normalizePhone(session.citizenNumber);
  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const agentKey = getAgentKey(session.agentNumber);
    if (agentKey) {
      sessionsByAgent.set(agentKey, session);
    }
  }

  console.log(
    `🔄 Sessão do agente recuperada do banco. Agente=${agentFull} Cidadão=${session.citizenNumber}`
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

// ====================== TIMERS ======================

// auto-encerrar recado depois de X minutos
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

    sessionsByCitizen.delete(citizenKey);
  }, MINUTOS * 60 * 1000);
}

// auto-encerrar atendimento ativo por inatividade (aqui 120 segundos = 2 min)
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

    sessionsByCitizen.delete(citizenKey);
  }, TIMEOUT_MINUTOS * 60 * 1000);
}

// lembretes para agente ocupado
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

    await sendTextMessage(
      agenteNumeroEnvio,
      `⏰ Lembrete: Atendimento pendente com *${
        current.citizenName ?? "Cidadão"
      }*.\n` + `Digite:\n1 - Atender agora\n2 - Continuar ocupado`
    );

    scheduleBusyReminder(current);
  }, 2 * 60 * 1000);
}

// ====================== CIDADÃO ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, whatsappMessageId, mediaId, mimeType, fileName } =
    msg;

  const citizenKey = normalizePhone(from);
  const trimmed = text.trim();
  const trimmedLower = trimmed.toLowerCase();
  const onlyDigits = trimmed.replace(/\D/g, "");

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

  if (session.status === "LEAVE_MESSAGE_DECISION") {
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
        "Para qual setor deseja ir agora?\n\n" + menu
      );
      return;
    }
    if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);
      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
      );
      sessionsByCitizen.delete(citizenKey);
      return;
    }
    await sendTextMessage(
      session.citizenNumber,
      "Responda:\n1 - Outro departamento\n2 - Encerrar"
    );
    return;
  }

  if (session.status === "ASK_NAME") {
    if (!session.citizenName) {
      const ignoreWords = ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite"];
      const isGreeting =
        ignoreWords.some((w) => trimmedLower.startsWith(w)) &&
        trimmed.split(" ").length <= 3;

      if (!trimmed || trimmed.length < 3 || isGreeting) {
        await sendTextMessage(
          session.citizenNumber,
          "Olá! 🤝\nPor favor, digite seu *nome completo* para iniciarmos."
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
        `Prazer, ${session.citizenName}! 😊\nCom qual setor deseja falar?\n\n${menu}`
      );
      return;
    }
  }

  if (session.status === "ASK_DEPARTMENT") {
    const numero = parseInt(trimmed, 10);
    if (isNaN(numero)) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Digite apenas o número da opção desejada.\n\n" + menu
      );
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

    if (session.agentNumber) {
      const key = getAgentKey(session.agentNumber);
      if (key) sessionsByAgent.set(key, session);
      const agenteEnvio = normalizePhone(session.agentNumber);

      await sendTextMessage(
        session.citizenNumber,
        `Aguarde um instante, estou contatando o setor *${departamento.nome}*. ⏳\n` +
          `Pode ir descrevendo sua situação aqui.`
      );

      await sendTextMessage(
        agenteEnvio,
        `📲 *Nova solicitação - ${departamento.nome}*\n\n` +
          `Munícipe: *${session.citizenName}*\n` +
          `Telefone: ${session.citizenNumber}\n\n` +
          `Digite:\n` +
          `1 - Atender agora\n` +
          `2 - Informar que está ocupado`
      );

      scheduleBusyReminder(session);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Este setor está sem responsável configurado no momento. Sua solicitação foi registrada."
      );
    }
    return;
  }

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    await sendTextMessage(
      session.citizenNumber,
      "O responsável ainda não confirmou, mas sua mensagem já foi salva. Aguarde mais um pouco ou deixe tudo registrado aqui."
    );
    return;
  }

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

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento finalizado.\nProtocolo: *${protocolo}*.\nAté logo!`
      );
      sessionsByCitizen.delete(citizenKey);
      return;
    }

    if (session.agentNumber) {
      const agenteEnvio = normalizePhone(session.agentNumber);
      let body = `👤 *${session.citizenName}*: `;

      if (tipo === "TEXT") body += text;
      else body += `[Enviou mídia: ${tipo}] ${text || ""}`;

      await sendTextMessage(agenteEnvio, body);
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
  const { from, text = "", tipo, whatsappMessageId, mediaId, mimeType, fileName } =
    msg;

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
    session.status = "ASK_ANOTHER_DEPARTMENT";

    await sendTextMessage(
      agentFullNumber,
      `✅ Atendimento encerrado.\nProtocolo: *${protocolo}*.`
    );

    await sendTextMessage(
      session.citizenNumber,
      `✅ O atendimento com *${session.departmentName}* foi finalizado pelo agente.\n` +
        `Protocolo: *${protocolo}*.\n\n` +
        `Deseja falar com *outro setor*?\n` +
        `1 - Sim\n` +
        `2 - Não, encerrar`
    );
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

  // transferência de setor
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
        await sendTextMessage(agentFullNumber, "Setor inválido. Verifique a lista.");
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
        status: "WAITING_AGENT_CONFIRMATION"
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
    let body = `👨‍💼 *${session.agentName || "Atendente"}*: `;
    if (tipo === "TEXT") body += text;
    else body += `[Enviou mídia: ${tipo}] ${text || ""}`;

    await sendTextMessage(session.citizenNumber, body);
    scheduleActiveAutoClose(session);
    return;
  }

  await sendTextMessage(
    agentFullNumber,
    "Comando não reconhecido ou atendimento já encerrado."
  );
}
