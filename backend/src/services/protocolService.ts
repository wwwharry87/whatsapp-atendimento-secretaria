// src/services/protocolService.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";

/**
 * Interface mínima que o serviço de protocolo precisa da sessão.
 * O tipo Session do sessionService "encaixa" nisso (TypeScript é estrutural),
 * então você pode passar a Session aqui sem problemas.
 */
export interface ProtocolSession {
  atendimentoId: string;
  protocolo?: string | null;
  status: string;
}

/**
 * Gera um código de protocolo no formato:
 * ATD-AAAAMMDD-XXXXXX
 * onde XXXXXX são os 6 primeiros caracteres do id do atendimento (sem hífens).
 */
export function generateProtocol(atendimentoId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const short = atendimentoId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ATD-${yyyy}${mm}${dd}-${short}`;
}

/**
 * Garante que o atendimento associado à sessão tenha protocolo.
 * - Se já existir no banco, usa o existente;
 * - Se não existir, gera e salva.
 * - Atualiza session.protocolo.
 */
export async function ensureProtocolForSession(
  session: ProtocolSession
): Promise<string> {
  const repo = AppDataSource.getRepository(Atendimento);

  let protocolo = session.protocolo ?? null;

  try {
    const atendimento = await repo.findOne({
      where: { id: session.atendimentoId },
    });

    if (atendimento?.protocolo) {
      protocolo = atendimento.protocolo;
    }
  } catch (err) {
    console.log(
      "[PROTOCOLO] Erro ao buscar atendimento para garantir protocolo.",
      err
    );
  }

  if (!protocolo) {
    protocolo = generateProtocol(session.atendimentoId);
    console.log(
      "[PROTOCOLO] Gerando protocolo para atendimento=",
      session.atendimentoId,
      "protocolo=",
      protocolo
    );
    try {
      await repo.update(session.atendimentoId, { protocolo });
    } catch (err) {
      console.log(
        "[PROTOCOLO] Erro ao salvar protocolo gerado.",
        err
      );
    }
  }

  session.protocolo = protocolo;
  return protocolo;
}

/**
 * Fecha o atendimento no banco com status FINISHED,
 * garantindo um protocolo (usa o que já tem ou gera um novo).
 * Também atualiza session.status e session.protocolo.
 */
export async function fecharAtendimentoComProtocolo(
  session: ProtocolSession
): Promise<string> {
  const repo = AppDataSource.getRepository(Atendimento);
  const atendimento = await repo.findOne({
    where: { id: session.atendimentoId },
  });

  let protocolo = atendimento?.protocolo || session.protocolo || null;
  if (!protocolo) {
    protocolo = generateProtocol(session.atendimentoId);
  }

  console.log(
    "[ATENDIMENTO] Fechando atendimento id=",
    session.atendimentoId,
    "com protocolo=",
    protocolo
  );

  await repo.update(session.atendimentoId, {
    status: "FINISHED" as AtendimentoStatus,
    encerradoEm: new Date(),
    protocolo,
  });

  session.status = "FINISHED";
  session.protocolo = protocolo;

  return protocolo;
}

/**
 * Extrai um código de protocolo no formato ATD-AAAAMMDD-XXXXXX
 * de um texto qualquer (mensagem do cidadão, por exemplo).
 */
export function extractProtocolCode(texto: string): string | null {
  if (!texto) return null;
  const match = texto.toUpperCase().match(/ATD-\d{8}-[A-Z0-9]{6}/);
  return match ? match[0] : null;
}

/**
 * Formata uma data/hora em pt-BR com fuso de São Paulo.
 */
export function formatDateTimeBr(value: any): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;

  try {
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toLocaleString("pt-BR");
  }
}

/**
 * Converte o status interno do atendimento em uma descrição legível
 * para mostrar ao cidadão na consulta de protocolo.
 */
export function mapStatusToDescricao(status?: string | null): string {
  if (!status) return "em andamento";
  const s = status.toUpperCase();

  switch (s) {
    case "ASK_NAME":
      return "aguardando a identificação do cidadão";
    case "ASK_DEPARTMENT":
      return "aguardando escolha do setor responsável";
    case "WAITING_AGENT_CONFIRMATION":
      return "aguardando o responsável do setor iniciar o atendimento";
    case "ACTIVE":
      return "em atendimento com a equipe";
    case "IN_QUEUE":
      return "aguardando na fila de atendimento";
    case "LEAVE_MESSAGE_DECISION":
    case "LEAVE_MESSAGE":
      return "com recado registrado, aguardando análise do setor";
    case "ASK_SATISFACTION_RESOLUTION":
    case "ASK_SATISFACTION_RATING":
    case "ASK_ANOTHER_DEPARTMENT":
      return "atendimento finalizado, em pesquisa de satisfação";
    case "FINISHED":
      return "encerrado";
    default:
      return "em andamento";
  }
}
