// src/services/messageService.ts
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

  // 🔹 novos campos (opcionais) para registrar comandos digitados
  //   ex: "AGENT_ACCEPT", "CITIZEN_END", "SAT_RATING_4", etc.
  comandoCodigo?: string | null;
  comandoDescricao?: string | null;
};

export async function salvarMensagem(
  params: SaveMensagemParams
): Promise<Mensagem> {
  const repo = AppDataSource.getRepository(Mensagem);

  // Se não foi passado mediaUrl mas temos um ID de mídia do WhatsApp,
  // geramos uma URL padrão apontando para a rota /media/:mediaId
  const mediaUrl =
    params.mediaUrl ??
    (params.whatsappMediaId ? `/media/${params.whatsappMediaId}` : undefined);

  const msg = repo.create({
    // relacionamento com Atendimento pela FK
    atendimento: { id: params.atendimentoId } as any,

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

    // 🔹 novos campos mapeados para as colunas comando_codigo / comando_descricao
    comandoCodigo: params.comandoCodigo ?? null,
    comandoDescricao: params.comandoDescricao ?? null,
  });

  return await repo.save(msg);
}
