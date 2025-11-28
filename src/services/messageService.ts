import { AppDataSource } from "../database/data-source";
import { Mensagem, MensagemDirecao, MensagemTipo } from "../entities/Mensagem";

type SaveMensagemParams = {
  atendimentoId: string;
  direcao: MensagemDirecao;
  tipo: MensagemTipo;
  conteudoTexto?: string | null;
  whatsappMessageId?: string;
  whatsappMediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: string | null;
  remetenteNumero: string;
};

export async function salvarMensagem(params: SaveMensagemParams) {
  const repo = AppDataSource.getRepository(Mensagem);
  const msg = repo.create({
    atendimentoId: params.atendimentoId,
    direcao: params.direcao,
    tipo: params.tipo,
    conteudoTexto: params.conteudoTexto,
    whatsappMessageId: params.whatsappMessageId,
    whatsappMediaId: params.whatsappMediaId,
    mediaUrl: params.mediaUrl,
    mimeType: params.mimeType,
    fileName: params.fileName,
    fileSize: params.fileSize,
    remetenteNumero: params.remetenteNumero
  });

  await repo.save(msg);
}
