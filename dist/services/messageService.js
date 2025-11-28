"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.salvarMensagem = salvarMensagem;
const data_source_1 = require("../database/data-source");
const Mensagem_1 = require("../entities/Mensagem");
async function salvarMensagem(params) {
    const repo = data_source_1.AppDataSource.getRepository(Mensagem_1.Mensagem);
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
