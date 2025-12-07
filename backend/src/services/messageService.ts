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
};

export async function salvarMensagem(params: SaveMensagemParams) {
  const mensagemRepo = AppDataSource.getRepository(Mensagem);

  let idcliente = params.idcliente;

  // Se não veio idcliente, eu descubro pelo atendimento
  if (idcliente == null) {
    const atendimentoRepo = AppDataSource.getRepository(Atendimento);

    const atendimento = await atendimentoRepo.findOne({
      where: { id: params.atendimentoId },
    });

    if (!atendimento) {
      throw new Error(
        `Atendimento ${params.atendimentoId} não encontrado ao salvar mensagem.`
      );
    }

    idcliente = atendimento.idcliente;
  }

  const mediaUrl = params.mediaUrl ?? undefined;

  const msg = mensagemRepo.create({
    atendimentoId: params.atendimentoId,
    idcliente,
    direcao: params.direcao,
    tipo: params.tipo,
    conteudoTexto: params.conteudoTexto ?? null,
    whatsappMessageId: params.whatsappMessageId,
    whatsappMediaId: params.whatsappMediaId,
    mediaUrl,
    mimeType: params.mimeType,
    fileName: params.fileName,
    fileSize: params.fileSize ?? null,
    remetenteNumero: params.remetenteNumero,
    comandoCodigo: params.comandoCodigo ?? null,
    comandoDescricao: params.comandoDescricao ?? null,
  });

  return await mensagemRepo.save(msg);
}
