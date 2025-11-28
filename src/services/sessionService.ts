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

// mapas em memória para roteamento em tempo real
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

// normaliza telefone para só dígitos
function normalizePhone(num?: string | null): string {
  if (!num) return "";
  return num.replace(/\D/g, "");
}

// chave para mapear sessões de AGENTE (últimos 8 dígitos)
function getAgentKey(num?: string | null): string {
  const normalized = normalizePhone(num);
  if (!normalized) return "";
  return normalized.slice(-8);
}

async function criarNovoAtendimento(citizenNumber: string): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: normalizePhone(citizenNumber),
    status: "ASK_NAME" as AtendimentoStatus
  });
  await repo.save(atendimento);
  return atendimento;
}

// novo atendimento para outro departamento (já sabe o nome)
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
    relations: ["departamento"]
  });

  return atendimento;
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
    busyReminderCount: 0
  };

  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const key = getAgentKey(session.agentNumber);
    sessionsByAgent.set(key, session);
  }

  return session;
}

// exposto só se algum dia quiser usar, hoje o webhook já decide pelo banco
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

// gera número de protocolo
function generateProtocol(atendimentoId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const short = atendimentoId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ATD-${yyyy}${mm}${dd}-${short}`;
}

// fecha atendimento no banco + protocolo
async function fecharAtendimentoComProtocolo(session: Session): Promise<string> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = await repo.findOne({
    where: { id: session.atendimentoId }
  });

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

/**
 * Auto-encerramento do modo "deixar recado".
 * Depois de X minutos em LEAVE_MESSAGE, encerra e gera protocolo.
 */
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
        `Guarde este número para acompanhar sua solicitação junto à Secretaria.`
    );

    sessionsByCitizen.delete(citizenKey);
  }, MINUTOS * 60 * 1000);
}

/**
 * Auto-encerramento de um atendimento ATIVO por inatividade (60s).
 */
function scheduleActiveAutoClose(session: Session) {
  const citizenKey = normalizePhone(session.citizenNumber);
  const agentNumber = session.agentNumber ? normalizePhone(session.agentNumber) : null;
  const agentKey = session.agentNumber ? getAgentKey(session.agentNumber) : null;
  const atendimentoId = session.atendimentoId;

  const TIMEOUT_SECONDS = 60;

  const scheduledAt = Date.now();
  session.lastActiveAt = scheduledAt;

  setTimeout(async () => {
    const current = sessionsByCitizen.get(citizenKey);
    if (!current) return;
    if (current.atendimentoId !== atendimentoId) return;
    if (current.status !== "ACTIVE") return;
    if (current.lastActiveAt !== scheduledAt) return; // houve nova mensagem

    const protocolo = await fecharAtendimentoComProtocolo(current);

    if (agentKey) {
      const s = sessionsByAgent.get(agentKey);
      if (s && s.atendimentoId === atendimentoId) {
        sessionsByAgent.delete(agentKey);
      }
    }

    await sendTextMessage(
      current.citizenNumber,
      `Encerramos este atendimento automaticamente por falta de mensagens por algum tempo. ✅\n` +
        `Número de protocolo: *${protocolo}*.\n` +
        `Se ainda precisar de ajuda, é só mandar um *oi* para abrir um novo atendimento.`
    );

    if (agentNumber) {
      await sendTextMessage(
        agentNumber,
        `O atendimento com ${current.citizenName ?? "o munícipe"} (${current.citizenNumber}) foi encerrado automaticamente por inatividade.\n` +
          `Protocolo: *${protocolo}*.`
      );
    }

    sessionsByCitizen.delete(citizenKey);
  }, TIMEOUT_SECONDS * 1000);
}

/**
 * Lembretes para o agente quando está ocupado/sem responder.
 */
function scheduleBusyReminder(session: Session) {
  if (!session.agentNumber) return;

  const key = getAgentKey(session.agentNumber);
  const agenteNumeroEnvio = normalizePhone(session.agentNumber);
  const atendimentoId = session.atendimentoId;

  if (!key || !agenteNumeroEnvio) return;

  const attempt = (session.busyReminderCount ?? 0) + 1;
  session.busyReminderCount = attempt;

  setTimeout(async () => {
    const current = sessionsByAgent.get(key);
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
        "🔔 Você ainda possui um atendimento pendente, mas já fizemos diversas tentativas de contato.\n" +
          "O cidadão será orientado a deixar um recado registrado para análise posterior."
      );

      current.status = "LEAVE_MESSAGE_DECISION";

      await sendTextMessage(
        current.citizenNumber,
        `⚠️ O responsável de *${current.departmentName}* está sem acesso no momento (fora de área ou sem internet).\n` +
          `Sua solicitação continua registrada.\n\n` +
          `Você deseja *deixar um recado detalhado* para que o setor possa analisar assim que estiver online?\n\n` +
          `Responda:\n` +
          `1 - Sim, quero deixar um recado\n` +
          `2 - Não, pode encerrar o atendimento`
      );

      return;
    }

    await sendTextMessage(
      agenteNumeroEnvio,
      `⏰ Você ainda tem um atendimento pendente com *${current.citizenName ?? "um cidadão"}* (${current.citizenNumber}).\n\n` +
        `Digite:\n` +
        `1 - Para atender agora\n` +
        `2 - Para continuar ocupado (lembraremos mais tarde novamente).`
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

  // salva mensagem do cidadão (sempre)
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

  // 1) Decisão se vai deixar recado
  if (session.status === "LEAVE_MESSAGE_DECISION") {
    if (onlyDigits === "1") {
      session.status = "LEAVE_MESSAGE";

      await sendTextMessage(
        session.citizenNumber,
        "Perfeito! 👍\n" +
          "Pode escrever aqui, com o máximo de detalhes, o que está acontecendo.\n" +
          "Você também pode enviar fotos, áudios ou documentos se achar necessário.\n\n" +
          "Após um período sem novas mensagens, sua conversa será encerrada automaticamente, mas tudo ficará registrado no sistema."
      );

      scheduleLeaveMessageAutoClose(session);
      return;
    }

    if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\n` +
          `Número de protocolo: *${protocolo}*.\n` +
          `Agradecemos o contato! Se precisar novamente, é só mandar um *oi*.`
      );
      sessionsByCitizen.delete(citizenKey);
      return;
    }

    await sendTextMessage(
      session.citizenNumber,
      "Não entendi. Responda apenas:\n1 - Para deixar um recado\n2 - Para encerrar o atendimento."
    );
    return;
  }

  // 2) Cidadão está deixando recado
  if (session.status === "LEAVE_MESSAGE") {
    await sendTextMessage(
      session.citizenNumber,
      "Sua mensagem foi registrada. ✅\n" +
        "Você pode continuar explicando, se quiser.\n\n" +
        "Quando ficar um tempo sem enviar novas mensagens, encerraremos automaticamente e geraremos um número de protocolo."
    );

    scheduleLeaveMessageAutoClose(session);
    return;
  }

  // 3) Cidadão decidindo se fala com outro departamento
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

      await sendTextMessage(
        session.citizenNumber,
        "Perfeito! Vou te encaminhar para outro setor.\n\n" +
          "Agora, escolha o novo Departamento / Setor que deseja falar:"
      );

      const menu = await montarMenuDepartamentos();
      await sendTextMessage(session.citizenNumber, menu);
      return;
    }

    if (onlyDigits === "2") {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado.\n` +
          `Número de protocolo: *${protocolo}*.\n` +
          `Agradecemos o contato! Se precisar novamente, é só mandar um *oi*.`
      );
      sessionsByCitizen.delete(citizenKey);
      return;
    }

    await sendTextMessage(
      session.citizenNumber,
      "Não entendi. Responda apenas:\n1 - Para falar com outro departamento\n2 - Para encerrar o atendimento."
    );
    return;
  }

  // 4) Perguntar nome (tratando "Oi" como saudação e não como nome)
  if (session.status === "ASK_NAME") {
    if (!session.citizenName) {
      const normalizedName = trimmedLower
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // remove acentos

      const isGreeting =
        normalizedName === "oi" ||
        normalizedName === "ola" ||
        normalizedName === "ola!" ||
        normalizedName === "olá" ||
        normalizedName === "bom dia" ||
        normalizedName === "boa tarde" ||
        normalizedName === "boa noite" ||
        normalizedName === "hi" ||
        normalizedName === "hello";

      if (!trimmed || trimmed.length < 3 || isGreeting) {
        await sendTextMessage(
          session.citizenNumber,
          "Olá! 🤝\n" +
            "Para continuar, por favor me informe seu *nome completo* (ex.: Maria da Silva Souza)."
        );
        return;
      }

      // agora sim consideramos que é de fato o nome
      session.citizenName = trimmed;
      session.status = "ASK_DEPARTMENT";

      await atualizarAtendimento(session, {
        cidadaoNome: session.citizenName,
        status: "ASK_DEPARTMENT"
      });

      const menu = await montarMenuDepartamentos();

      await sendTextMessage(
        session.citizenNumber,
        `Prazer, ${session.citizenName}! 😊\n` +
          `Agora me diga com qual Departamento / Setor você deseja falar:\n\n` +
          `${menu}`
      );
      return;
    }
  }

  // 5) Escolha de departamento
  if (session.status === "ASK_DEPARTMENT") {
    const numeroEscolhido = parseInt(trimmed, 10);
    if (isNaN(numeroEscolhido)) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Por favor, digite apenas o número do departamento desejado. 😉\n\n" +
          menu
      );
      return;
    }

    const departamento = await getDepartamentoPorIndice(numeroEscolhido);
    if (!departamento) {
      const menu = await montarMenuDepartamentos();
      await sendTextMessage(
        session.citizenNumber,
        "Opção inválida. Tente novamente digitando um dos números da lista.\n\n" +
          menu
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
      sessionsByAgent.set(key, session);
    }

    await sendTextMessage(
      session.citizenNumber,
      `Ótimo! Vou te encaminhar para o setor: *${departamento.nome}*.\n` +
        `Vou verificar a disponibilidade do responsável, aguarde um instante. ⏳\n\n` +
        `Enquanto isso, você já pode ir explicando sua situação aqui.\n` +
        `Suas mensagens serão registradas e o setor poderá visualizar tudo depois.`
    );

    if (session.agentNumber) {
      const agenteEnvio = normalizePhone(session.agentNumber);
      await sendTextMessage(
        agenteEnvio,
        `📲 *Nova solicitação via WhatsApp*\n\n` +
          `Munícipe: *${session.citizenName ?? "Não informado"}*\n` +
          `Telefone: ${session.citizenNumber}\n` +
          `Departamento: *${departamento.nome}*\n\n` +
          `Digite:\n` +
          `1 - Para atender agora\n` +
          `2 - Para informar que está ocupado (o cidadão será avisado)`
      );
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "No momento não há um responsável configurado para este setor. Sua solicitação foi registrada."
      );
    }

    return;
  }

  // 6) Enquanto o agente não confirma
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    await sendTextMessage(
      session.citizenNumber,
      "O responsável ainda não confirmou o atendimento. 🙏\n" +
        "Mas fique tranquilo(a): *sua mensagem já foi registrada* e ficará disponível para o setor.\n\n" +
        "Se quiser, pode continuar explicando sua situação aqui normalmente."
    );
    return;
  }

  // 7) Atendimento ATIVO: cidadão pode falar ou encerrar
  if (session.status === "ACTIVE") {
    const lower = trimmedLower;

    // cidadão pedindo encerramento
    if (lower === "encerrar" || lower === "finalizar" || onlyDigits === "3") {
      const protocolo = await fecharAtendimentoComProtocolo(session);

      if (session.agentNumber) {
        const agenteEnvio = normalizePhone(session.agentNumber);
        await sendTextMessage(
          agenteEnvio,
          `O cidadão encerrou o atendimento de forma voluntária.\n` +
            `Munícipe: ${session.citizenName ?? "Munícipe"} (${session.citizenNumber})\n` +
            `Protocolo: *${protocolo}*.`
        );

        const key = getAgentKey(session.agentNumber);
        sessionsByAgent.delete(key);
      }

      await sendTextMessage(
        session.citizenNumber,
        `✅ Atendimento encerrado a seu pedido.\n` +
          `Número de protocolo: *${protocolo}*.\n` +
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

      // renova timer de auto-encerramento
      scheduleActiveAutoClose(session);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Ocorreu um problema ao localizar o responsável. Tente novamente mais tarde."
      );
    }
    return;
  }

  // 8) Atendimento já encerrado
  if (session.status === "FINISHED") {
    await sendTextMessage(
      session.citizenNumber,
      "Este atendimento já foi encerrado. Se quiser iniciar um novo, mande um *oi*."
    );
    sessionsByCitizen.delete(citizenKey);
    return;
  }

  // fallback
  await sendTextMessage(
    session.citizenNumber,
    "Não entendi sua mensagem. Vamos começar de novo? Mande um *oi*."
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

  const agentPhone = normalizePhone(from);
  const key = getAgentKey(from);
  const trimmed = text.trim().toLowerCase();
  const onlyDigits = trimmed.replace(/\D/g, "");

  const session = sessionsByAgent.get(key);
  if (!session) {
    console.log(
      `handleAgentMessage: nenhuma sessão encontrada para agente ${agentPhone} (key=${key})`
    );
    await sendTextMessage(
      agentPhone,
      "No momento você não tem nenhuma solicitação pendente vinculada a este número."
    );
    return;
  }

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
    remetenteNumero: agentPhone
  });

  // agente encerrando atendimento
  if (
    session.status === "ACTIVE" &&
    (onlyDigits === "3" || trimmed === "encerrar" || trimmed === "finalizar")
  ) {
    const protocolo = await fecharAtendimentoComProtocolo(session);

    sessionsByAgent.delete(key);
    session.status = "ASK_ANOTHER_DEPARTMENT";

    await sendTextMessage(
      agentPhone,
      `Você encerrou este atendimento. Protocolo: *${protocolo}*.\n` +
        "O cidadão será informado e poderá escolher falar com outro departamento ou finalizar."
    );

    await sendTextMessage(
      session.citizenNumber,
      `✅ O atendimento com o setor *${session.departmentName}* foi encerrado.\n` +
        `Número de protocolo: *${protocolo}*.\n\n` +
        "Você deseja falar com *outro departamento* também?\n\n" +
        "Responda:\n" +
        "1 - Sim, quero falar com outro departamento\n" +
        "2 - Não, pode encerrar o atendimento"
    );

    return;
  }

  // agente decidindo se atende ou está ocupado
  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (onlyDigits === "1") {
      session.status = "ACTIVE";

      await atualizarAtendimento(session, {
        status: "ACTIVE"
      });

      await sendTextMessage(
        agentPhone,
        `Você está em atendimento com *${session.citizenName ?? "Munícipe"}* (${session.citizenNumber}).`
      );
      await sendTextMessage(
        session.citizenNumber,
        `✅ O responsável de *${session.departmentName}* iniciou o atendimento.\n` +
          `Pode enviar sua mensagem.`
      );

      // começa contagem de inatividade
      scheduleActiveAutoClose(session);
      return;
    }

    if (onlyDigits === "2") {
      session.busyReminderCount = 0;
      await sendTextMessage(
        agentPhone,
        "Ok, avisei o cidadão que você está ocupado no momento. Quando puder, digite 1 para iniciar o atendimento."
      );
      await sendTextMessage(
        session.citizenNumber,
        `O responsável de *${session.departmentName}* está ocupado no momento.\n` +
          `Sua solicitação foi registrada e será atendida assim que possível. ⏳`
      );

      scheduleBusyReminder(session);
      return;
    }

    await sendTextMessage(
      agentPhone,
      "Por favor, responda apenas:\n1 - Para atender agora\n2 - Para avisar que está ocupado.\nOu, se já estiver em atendimento e quiser encerrar, digite *3* ou *encerrar*."
    );
    return;
  }

  // agente em atendimento ativo trocando mensagens
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

    // renova timer de inatividade
    scheduleActiveAutoClose(session);
    return;
  }

  if (session.status === "ASK_ANOTHER_DEPARTMENT") {
    await sendTextMessage(
      agentPhone,
      "Este atendimento já foi encerrado para este setor. O cidadão está decidindo se quer falar com outro departamento."
    );
    return;
  }

  await sendTextMessage(
    agentPhone,
    "No momento não há nenhuma ação pendente para este atendimento."
  );
}
