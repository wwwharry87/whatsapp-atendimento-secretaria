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
  | "ACTIVE";

export type Session = {
  citizenNumber: string;
  citizenName?: string;
  departmentId?: number;
  departmentName?: string;
  agentNumber?: string;
  agentName?: string;
  status: SessionStatus;
  atendimentoId: string;
};

// Mapa em memória (rápido para roteamento em tempo real)
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

async function criarNovoAtendimento(citizenNumber: string): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: citizenNumber,
    status: "ASK_NAME" as AtendimentoStatus
  });
  await repo.save(atendimento);
  return atendimento;
}

async function carregarAtendimentoAberto(
  citizenNumber: string
): Promise<Atendimento | null> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = await repo.findOne({
    where: {
      cidadaoNumero: citizenNumber,
      status: "ACTIVE"
    },
    relations: ["departamento"]
  });

  return atendimento;
}

async function getOrCreateSession(citizenNumber: string): Promise<Session> {
  const existente = sessionsByCitizen.get(citizenNumber);
  if (existente) return existente;

  let atendimento = await carregarAtendimentoAberto(citizenNumber);

  if (!atendimento) {
    atendimento = await criarNovoAtendimento(citizenNumber);
  }

  const session: Session = {
    citizenNumber,
    status: atendimento.status as SessionStatus,
    citizenName: atendimento.cidadaoNome ?? undefined,
    departmentId: atendimento.departamentoId ?? undefined,
    departmentName: atendimento.departamento?.nome ?? undefined,
    agentNumber: atendimento.agenteNumero ?? undefined,
    agentName: atendimento.agenteNome ?? undefined,
    atendimentoId: atendimento.id
  };

  sessionsByCitizen.set(citizenNumber, session);

  if (session.agentNumber) {
    sessionsByAgent.set(session.agentNumber, session);
  }

  return session;
}

// Números de agentes: usa o mapa de sessões (já vinculados)
export function isAgentNumber(whatsappNumber: string): boolean {
  const normalized = whatsappNumber.replace(/\D/g, "");
  for (const [agentNumber] of sessionsByAgent.entries()) {
    if (agentNumber.replace(/\D/g, "") === normalized) return true;
  }
  return false;
}

async function atualizarAtendimento(
  session: Session,
  parcial: Partial<Atendimento>
) {
  const repo = AppDataSource.getRepository(Atendimento);
  await repo.update(session.atendimentoId, parcial);
}

// CIDADÃO
export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, whatsappMessageId, mediaId, mimeType, fileName } =
    msg;
  const trimmed = text.trim();

  const session = await getOrCreateSession(from);

  // Salvar mensagem recebida (texto, áudio, imagem, etc.)
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
    remetenteNumero: from
  });

  if (session.status === "ASK_NAME") {
    if (!session.citizenName) {
      if (!trimmed) {
        await sendTextMessage(
          session.citizenNumber,
          "Por favor, me diga seu *nome completo* em texto para continuarmos. 😊"
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
        `Prazer, ${session.citizenName}! 😊\n` +
          `Vou te ajudar a falar com o setor correto.\n\n` +
          `${menu}`
      );
      return;
    }
  }

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

    await atualizarAtendimento(session, {
      departamentoId: departamento.id,
      agenteNumero: session.agentNumber,
      agenteNome: session.agentName,
      status: "WAITING_AGENT_CONFIRMATION"
    });

    if (session.agentNumber) {
      sessionsByAgent.set(session.agentNumber, session);
    }

    await sendTextMessage(
      session.citizenNumber,
      `Ótimo! Vou te encaminhar para o setor: *${departamento.nome}*.\n` +
        `Vou verificar a disponibilidade do responsável, aguarde um instante. ⏳`
    );

    if (session.agentNumber) {
      await sendTextMessage(
        session.agentNumber,
        `📲 *Nova solicitação via WhatsApp*\n\n` +
          `Munícipe: *${session.citizenName}*\n` +
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

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    await sendTextMessage(
      session.citizenNumber,
      "Ainda estou aguardando a confirmação do responsável. 🙏\n" +
        "Assim que ele aceitar o atendimento, eu te aviso."
    );
    return;
  }

  if (session.status === "ACTIVE") {
    if (session.agentNumber) {
      let body = `👤 ${session.citizenName} (${session.citizenNumber}):\n`;

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

      await sendTextMessage(session.agentNumber, body);
    } else {
      await sendTextMessage(
        session.citizenNumber,
        "Ocorreu um problema ao localizar o responsável. Tente novamente mais tarde."
      );
    }
    return;
  }

  await sendTextMessage(
    session.citizenNumber,
    "Não entendi sua mensagem. Vamos começar de novo? Mande um *oi*."
  );
  sessionsByCitizen.delete(from);
}

// AGENTE
export async function handleAgentMessage(msg: IncomingMessage) {
  const { from, text = "", whatsappMessageId, tipo, mediaId, mimeType, fileName } =
    msg;
  const trimmed = text.trim();

  const session = sessionsByAgent.get(from);
  if (!session) {
    await sendTextMessage(
      from,
      "No momento você não tem nenhuma solicitação pendente vinculada a este número."
    );
    return;
  }

  // Salvar mensagem do agente
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
    remetenteNumero: from
  });

  if (session.status === "WAITING_AGENT_CONFIRMATION") {
    if (trimmed === "1") {
      session.status = "ACTIVE";

      await atualizarAtendimento(session, {
        status: "ACTIVE"
      });

      await sendTextMessage(
        from,
        `Você está em atendimento com *${session.citizenName}* (${session.citizenNumber}).`
      );
      await sendTextMessage(
        session.citizenNumber,
        `✅ O responsável de *${session.departmentName}* iniciou o atendimento.\n` +
          `Pode enviar sua mensagem.`
      );
      return;
    }

    if (trimmed === "2") {
      await sendTextMessage(
        from,
        "Ok, avisei o cidadão que você está ocupado no momento. Quando puder, digite 1 para iniciar o atendimento."
      );
      await sendTextMessage(
        session.citizenNumber,
        `O responsável de *${session.departmentName}* está ocupado no momento.\n` +
          `Sua solicitação foi registrada e será atendida assim que possível. ⏳`
      );
      return;
    }

    await sendTextMessage(
      from,
      "Por favor, responda apenas:\n1 - Para atender agora\n2 - Para avisar que está ocupado."
    );
    return;
  }

  if (session.status === "ACTIVE") {
    let body = `👨‍💼 ${session.agentName}:\n`;

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
    return;
  }

  await sendTextMessage(
    from,
    "No momento não há nenhuma ação pendente para este atendimento."
  );
}
