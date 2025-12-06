// backend/src/services/messageService.ts
import { AppDataSource } from "../database/data-source";
import { Mensagem, MensagemDirecao, MensagemTipo } from "../entities/Mensagem";

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

  // novos campos opcionais
  comandoCodigo?: string | null;
  comandoDescricao?: string | null;
};

export async function salvarMensagem(
  params: SaveMensagemParams
): Promise<Mensagem> {
  const repo = AppDataSource.getRepository(Mensagem);

  const mediaUrl =
    params.mediaUrl ??
    (params.whatsappMediaId ? `/media/${params.whatsappMediaId}` : undefined);

  const msg = repo.create({
    atendimento: { id: params.atendimentoId } as any,
    atendimentoId: params.atendimentoId,
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

  return await repo.save(msg);
}
