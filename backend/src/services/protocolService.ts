// src/services/protocolService.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";

/**
 * Interface mínima que o serviço de protocolo precisa da sessão.
 */
export interface ProtocolSession {
  atendimentoId: string;
  protocolo?: string | null;
  status: string;
}

/**
 * Gera um código de protocolo no formato:
 * ATD-AAAAMMDD-XXXXXX
 *
 * 🔒 Observação:
 * - O short agora usa 8 chars (mais seguro) mantendo legibilidade.
 */
export function generateProtocol(atendimentoId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const short = atendimentoId.replace(/-/g, "").slice(0, 8).toUpperCase();
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
      select: ["id", "protocolo"] as any,
    });

    if (atendimento?.protocolo) {
      protocolo = atendimento.protocolo;
    }
  } catch (err) {
    console.log("[PROTOCOLO] Erro ao buscar atendimento para garantir protocolo.", err);
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
      await repo.update(session.atendimentoId, {
        protocolo,
        atualizadoEm: new Date(), // ✅ mantém ordenação correta
      } as any);
    } catch (err) {
      console.log("[PROTOCOLO] Erro ao salvar protocolo gerado.", err);
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
    select: ["id", "protocolo"] as any,
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
    atualizadoEm: new Date(), // ✅ importantíssimo
    protocolo,
  } as any);

  session.status = "FINISHED";
  session.protocolo = protocolo;

  return protocolo;
}

/**
 * Extrai um código de protocolo no formato ATD-AAAAMMDD-XXXXXXXX
 * (8 chars no sufixo)
 */
export function extractProtocolCode(texto: string): string | null {
  if (!texto) return null;
  const match = texto.toUpperCase().match(/ATD-\d{8}-[A-Z0-9]{6,12}/);
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
 * Converte status interno do atendimento em descrição legível.
 * ✅ Atualizado com os estados reais do seu fluxo.
 */
export function mapStatusToDescricao(status?: string | null): string {
  if (!status) return "em andamento";
  const s = status.toUpperCase();

  switch (s) {
    case "ASK_NAME":
      return "aguardando a identificação do cidadão";
    case "ASK_PROFILE":
      return "aguardando a confirmação do perfil do cidadão";
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

    case "WAITING_AGENT":
      return "recado registrado; aguardando retorno do setor";

    case "OFFLINE_POST_AGENT_RESPONSE":
      return "atendimento encerrado; aguardando confirmação se foi resolvido";

    case "OFFLINE_RATING":
      return "aguardando avaliação do atendimento";

    case "FINISHED":
    case "CLOSED":
      return "encerrado";

    default:
      return "em andamento";
  }
}
