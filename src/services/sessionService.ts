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
  busyReminderCount?: number; // quantas vezes já lembramos o agente
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

async function criarNovoAtendimento(citizenNumber: string): Promise<Atendimento> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = repo.create({
    cidadaoNumero: citizenNumber,
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
    cidadaoNumero: citizenNumber,
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
    atendimentoId: atendimento.id,
    busyReminderCount: 0
  };

  sessionsByCitizen.set(citizenNumber, session);

  if (session.agentNumber) {
    sessionsByAgent.set(session.agentNumber, session);
  }

  return session;
}

// checa se o número é de um agente
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

/**
 * Agenda lembretes para o agente quando ele marcou "ocupado".
 * Tenta no máximo 3 vezes a cada 2 minutos.
 * Se após 3 tentativas ele não mudar o status, avisamos o cidadão.
 */
function scheduleBusyReminder(session: Session) {
  const agentNumber = session.agentNumber;
  const atendimentoId = session.atendimentoId;

  if (!agentNumber) return;

  const attempt = (session.busyReminderCount ?? 0) + 1;
  session.busyReminderCount = attempt;

  setTimeout(async () => {
    const current = sessionsByAgent.get(agentNumber);
    if (!current) return;

    if (
      current.atendimentoId !== atendimentoId ||
      current.status !== "WAITING_AGENT_CONFIRMATION"
    ) {
      // se já atendeu ou mudou de status, não faz nada
      return;
    }

    // se já passou de 3 tentativas, avisar o cidadão e encerrar lembretes
    if ((current.busyReminderCount ?? 0) >= 3) {
      await sendTextMessage(
        agentNumber,
        "🔔 Você ainda possui um atendimento pendente, mas já fizemos diversas tentativas de contato.\n" +
          "Informamos ao cidadão que você está sem acesso no momento (fora de área ou sem internet)."
      );

      await sendTextMessage(
        current.citizenNumber,
        `⚠️ O responsável de *${current.departmentName}* está sem acesso no momento (fora de área ou sem internet).\n` +
          `Sua solicitação continua registrada. Assim que houver retorno, a equipe poderá entrar em contato novamente.`
      );

      return;
    }

    // ainda dentro do limite → manda lembrete
    await sendTextMessage(
      agentNumber,
      `⏰ Você ainda tem um atendimento pendente com *${current.citizenName ?? "um cidadão"}* (${current.citizenNumber}).\n\n` +
        `Digite:\n` +
        `1 - Para atender agora\n` +
        `2 - Para continuar ocupado (lembraremos mais tarde novamente).`
    );

    // agenda a próxima tentativa
    scheduleBusyReminder(current);
  }, 2 * 60 * 1000); // 2 minutos
}

// ====================== CIDADÃO ======================

export async function handleCitizenMessage(msg: IncomingMessage) {
  const { from, text = "", tipo, whatsappMessageId, mediaId, mimeType, fileName } =
    msg;
  const trimmed = text.trim();

  const session = await getOrCreateSession(from);

  // salva mensagem do cidadão (texto / mídia), independente do status
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

  // cidadão respondendo se quer falar com outro departamento
  if (session.status === "ASK_ANOTHER_DEPARTMENT") {
    if (trimmed === "1") {
      // cria novo atendimento só pra outro setor
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

    if (trimmed === "2") {
      session.status = "FINISHED";
      await atualizarAtendimento(session, {
        status: "FINISHED",
        encerradoEm: new Date()
      });

      await sendTextMessage(
        session.citizenNumber,
        "✅ Atendimento encerrado. Agradecemos o contato! Se precisar novamente, é só mandar um *oi*."
      );
      return;
    }

    await sendTextMessage(
      session.citizenNumber,
      "Não entendi. Responda apenas:\n1 - Para falar com outro departamento\n2 - Para encerrar o atendimento."
    );
    return;
  }

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
    session.busyReminderCount = 0;

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
        `Vou verificar a disponibilidade do responsável, aguarde um instante. ⏳\n\n` +
        `Enquanto isso, você já pode ir explicando sua situação aqui. Suas mensagens serão registradas e o setor poderá visualizar tudo depois.`
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
      "O responsável ainda não confirmou o atendimento. 🙏\n" +
        "Mas fique tranquilo(a): *sua mensagem já foi registrada* e ficará disponível para o setor.\n\n" +
        "Se quiser, pode continuar explicando sua situação aqui normalmente. Assim que o responsável estiver com acesso, poderá visualizar tudo e responder."
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

  if (session.status === "FINISHED") {
    await sendTextMessage(
      session.citizenNumber,
      "Este atendimento já foi encerrado. Se quiser iniciar um novo, mande um *oi*."
    );
    return;
  }

  await sendTextMessage(
    session.citizenNumber,
    "Não entendi sua mensagem. Vamos começar de novo? Mande um *oi*."
  );
  sessionsByCitizen.delete(from);
}

// ====================== AGENTE ======================

export async function handleAgentMessage(msg: IncomingMessage) {
  const { from, text = "", whatsappMessageId, tipo, mediaId, mimeType, fileName } =
    msg;
  const trimmed = text.trim().toLowerCase();

  const session = sessionsByAgent.get(from);
  if (!session) {
    await sendTextMessage(
      from,
      "No momento você não tem nenhuma solicitação pendente vinculada a este número."
    );
    return;
  }

  // salva mensagem do agente
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

  // agente pode encerrar digitando "encerrar" ou "3"
  if (session.status === "ACTIVE" && (trimmed === "encerrar" || trimmed === "3")) {
    session.status = "ASK_ANOTHER_DEPARTMENT";

    // tira esse agente da sessão (ele não está mais em atendimento ativo)
    sessionsByAgent.delete(from);

    await atualizarAtendimento(session, {
      status: "FINISHED",
      encerradoEm: new Date()
    });

    await sendTextMessage(
      from,
      "Você encerrou este atendimento. O cidadão será informado e poderá escolher falar com outro departamento ou finalizar."
    );

    await sendTextMessage(
      session.citizenNumber,
      `✅ O atendimento com o setor *${session.departmentName}* foi encerrado.\n\n` +
        "Você deseja falar com *outro departamento* também?\n\n" +
        "Responda:\n" +
        "1 - Sim, quero falar com outro departamento\n" +
        "2 - Não, pode encerrar o atendimento"
    );

    return;
  }

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
      session.busyReminderCount = 0;
      await sendTextMessage(
        from,
        "Ok, avisei o cidadão que você está ocupado no momento. Quando puder, digite 1 para iniciar o atendimento."
      );
      await sendTextMessage(
        session.citizenNumber,
        `O responsável de *${session.departmentName}* está ocupado no momento.\n` +
          `Sua solicitação foi registrada e será atendida assim que possível. ⏳`
      );

      // agenda lembretes recorrentes (até 3 vezes)
      scheduleBusyReminder(session);
      return;
    }

    await sendTextMessage(
      from,
      "Por favor, responda apenas:\n1 - Para atender agora\n2 - Para avisar que está ocupado.\nOu, se já estiver em atendimento e quiser encerrar, digite *encerrar*."
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

  if (session.status === "ASK_ANOTHER_DEPARTMENT") {
    await sendTextMessage(
      from,
      "Este atendimento já foi encerrado para o setor. O cidadão está decidindo se quer falar com outro departamento."
    );
    return;
  }

  await sendTextMessage(
    from,
    "No momento não há nenhuma ação pendente para este atendimento."
  );
}
