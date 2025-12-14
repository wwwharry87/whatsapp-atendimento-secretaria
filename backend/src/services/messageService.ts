// src/services/messageService.ts
import { AppDataSource } from "../database/data-source";
import { Mensagem, MensagemDirecao, MensagemTipo } from "../entities/Mensagem";
import { Atendimento } from "../entities/Atendimento";

export type SaveMensagemParams = {
  atendimentoId: string;
  direcao: MensagemDirecao;
  tipo: MensagemTipo;
  conteudoTexto: string | null;

  whatsappMessageId?: string;
  whatsappMediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: string | null;

  remetenteNumero: string;

  comandoCodigo?: string | null;
  comandoDescricao?: string | null;

  /**
   * Opcional: se você quiser passar o idcliente explicitamente.
   * Se não vier, eu busco pelo atendimento.
   */
  idcliente?: number;

  /**
   * Opcional: se você já tiver o atendimento em mãos, evita uma query.
   */
  atendimento?: Pick<Atendimento, "id" | "idcliente">;
};

function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "");
}

function isUniqueViolation(err: any): boolean {
  // Postgres: 23505
  return Boolean(err?.code === "23505");
}

export async function salvarMensagem(params: SaveMensagemParams) {
  const mensagemRepo = AppDataSource.getRepository(Mensagem);

  // --- validações mínimas ---
  if (!params.atendimentoId) {
    throw new Error("atendimentoId é obrigatório para salvar mensagem.");
  }
  if (!params.direcao) {
    throw new Error("direcao é obrigatório para salvar mensagem.");
  }
  if (!params.tipo) {
    throw new Error("tipo é obrigatório para salvar mensagem.");
  }

  // Normaliza sempre (evita null/undefined no banco)
  const remetenteNumero = normalizePhone(params.remetenteNumero);
  if (!remetenteNumero) {
    throw new Error(
      "remetenteNumero é obrigatório (e deve conter dígitos) para salvar mensagem."
    );
  }

  // resolve idcliente da forma mais barata possível
  let idcliente: number | undefined = params.idcliente;

  if (idcliente == null) {
    if (params.atendimento?.id === params.atendimentoId && params.atendimento?.idcliente != null) {
      idcliente = params.atendimento.idcliente as any;
    } else {
      const atendimentoRepo = AppDataSource.getRepository(Atendimento);
      const atendimento = await atendimentoRepo.findOne({
        where: { id: params.atendimentoId },
        select: ["id", "idcliente"],
      });

      if (!atendimento) {
        throw new Error(
          `Atendimento ${params.atendimentoId} não encontrado ao salvar mensagem.`
        );
      }
      idcliente = atendimento.idcliente as any;
    }
  }

  const whatsappMessageId = params.whatsappMessageId?.trim() || undefined;

  // ============================
  // IDEMPOTÊNCIA (DEDUPE)
  // ============================
  // Se houver whatsappMessageId, tentamos retornar a mensagem já existente
  // pelo par (idcliente + whatsappMessageId).
  //
  // Para ficar 100% garantido em multi-instância, você vai adicionar
  // um índice único no banco (te passo já já no Mensagem.ts).
  if (whatsappMessageId) {
    const existing = await mensagemRepo.findOne({
      where: { idcliente: idcliente as any, whatsappMessageId } as any,
    });
    if (existing) return existing;
  }

  // Cria a entidade
  const msg = mensagemRepo.create({
    atendimentoId: params.atendimentoId,
    idcliente,
    direcao: params.direcao,
    tipo: params.tipo,
    conteudoTexto: params.conteudoTexto ?? null,

    whatsappMessageId,
    whatsappMediaId: params.whatsappMediaId?.trim() || undefined,
    mediaUrl: params.mediaUrl ?? undefined,
    mimeType: params.mimeType ?? undefined,
    fileName: params.fileName ?? undefined,
    fileSize: params.fileSize ?? null,

    remetenteNumero,
    comandoCodigo: params.comandoCodigo ?? null,
    comandoDescricao: params.comandoDescricao ?? null,
  });

  // Salva com tratamento de corrida (quando houver unique index)
  try {
    return await mensagemRepo.save(msg);
  } catch (err: any) {
    // Se você colocar UNIQUE(idcliente, whatsappMessageId), pode acontecer:
    // duas instâncias tentarem salvar ao mesmo tempo -> uma falha 23505.
    if (whatsappMessageId && isUniqueViolation(err)) {
      const existing = await mensagemRepo.findOne({
        where: { idcliente: idcliente as any, whatsappMessageId } as any,
      });
      if (existing) return existing;
    }

    throw err;
  }
}
