// src/routes/recadosRoutes.ts
import { Router, Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import {
  sendTextMessage,
  sendImageMessageById,
  sendDocumentMessageById,
  sendAudioMessageById,
  sendVideoMessageById,
} from "../services/whatsappService";

const router = Router();

/**
 * Helper para obter idcliente a partir do atendimento
 * (multi-tenant seguro).
 */
function getIdCliente(req: Request, atendimento: Atendimento): number {
  const id =
    (atendimento as any).idcliente ??
    (req as any).idcliente ??
    (req as any).clienteId ??
    (req as any).cliente_id;

  if (!id) {
    throw new Error("idcliente não encontrado no atendimento/req");
  }

  return id;
}

/**
 * GET /recados
 *
 * Lista recados em formato resumido para o painel.
 *
 * Query params:
 *   - status: "abertos" | "encerrados" | "todos"
 *   - departamentoId: number (opcional)
 *   - search: string (nome cidadão, telefone ou protocolo)
 *   - page: number (padrão 1)
 *   - perPage: number (padrão 20)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const statusParam = String(req.query.status || "abertos").toLowerCase();
    const departamentoId = req.query.departamentoId
      ? Number(req.query.departamentoId)
      : undefined;
    const search = (req.query.search as string) || "";

    const page = req.query.page ? Number(req.query.page) : 1;
    const perPage = req.query.perPage ? Number(req.query.perPage) : 20;

    let statuses: AtendimentoStatus[] = ["LEAVE_MESSAGE", "LEAVE_MESSAGE_DECISION"];

    if (statusParam === "encerrados") {
      statuses = ["FINISHED"];
    } else if (statusParam === "todos") {
      statuses = ["LEAVE_MESSAGE", "LEAVE_MESSAGE_DECISION", "FINISHED"];
    }

    const qb = repoAtendimento
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .where("a.status IN (:...statuses)", { statuses });

    // filtra por cliente (multi-tenant) se o authMiddleware setar
    const idclienteReq =
      (req as any).idcliente ??
      (req as any).clienteId ??
      (req as any).cliente_id;
    if (idclienteReq) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente: idclienteReq });
    }

    if (departamentoId) {
      qb.andWhere("a.departamento_id = :departamentoId", { departamentoId });
    }

    if (search) {
      const s = `%${search.toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(a.cidadao_nome) LIKE :s OR a.cidadao_numero LIKE :s OR LOWER(a.protocolo) LIKE :s)",
        { s }
      );
    }

    qb.orderBy("a.criado_em", "DESC")
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();

    const data = items.map((a) => ({
      id: a.id,
      protocolo: a.protocolo || null,
      cidadaoNome: (a as any).cidadaoNome,
      cidadaoNumero: (a as any).cidadaoNumero,
      departamentoId: (a as any).departamentoId,
      departamentoNome: a.departamento ? a.departamento.nome : null,
      status: a.status,
      criadoEm: (a as any).criadoEm,
      atualizadoEm: (a as any).atualizadoEm ?? null,
      encerradoEm: (a as any).encerradoEm ?? null,
    }));

    res.json({
      data,
      total,
      page,
      perPage,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao listar recados:", err);
    res.status(500).json({ error: "Erro ao listar recados." });
  }
});

/**
 * GET /recados/:id
 *
 * Detalhe de um recado (atendimento) + mensagens.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);

    const atendimento = await repoAtendimento.findOne({
      where: { id },
      relations: ["departamento"],
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const mensagens = await repoMensagem.find({
      where: { atendimentoId: id },
      order: { criadoEm: "ASC" as any },
    });

    const detalhe = {
      id: atendimento.id,
      protocolo: atendimento.protocolo || null,
      cidadaoNome: (atendimento as any).cidadaoNome,
      cidadaoNumero: (atendimento as any).cidadaoNumero,
      departamentoId: (atendimento as any).departamentoId,
      departamentoNome: atendimento.departamento
        ? atendimento.departamento.nome
        : null,
      status: atendimento.status,
      criadoEm: (atendimento as any).criadoEm,
      atualizadoEm: (atendimento as any).atualizadoEm ?? null,
      encerradoEm: (atendimento as any).encerradoEm ?? null,
      agenteNome: (atendimento as any).agenteNome || null,
      agenteNumero: (atendimento as any).agenteNumero || null,
      foiResolvido: (atendimento as any).foiResolvido ?? null,
      notaSatisfacao: (atendimento as any).notaSatisfacao ?? null,
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: (m as any).direcao,
        tipo: (m as any).tipo,
        conteudoTexto: (m as any).conteudoTexto,
        criadoEm: (m as any).criadoEm,
        remetenteNumero: (m as any).remetenteNumero,
      })),
    };

    res.json(detalhe);
  } catch (err) {
    console.error("[RECADOS] Erro ao carregar recado:", err);
    res.status(500).json({ error: "Erro ao carregar recado." });
  }
});

/**
 * POST /recados/:id/responder
 *
 * Responde ao cidadão a partir do painel (modo recado).
 * Body:
 *  - mensagem?: string
 *  - agenteNome?: string
 *  - agenteNumero?: string
 *  - tipoMidia?: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO"
 *  - mediaId?: string
 *  - mimeType?: string
 *  - fileName?: string
 *  - fileSize?: number
 *  - mediaUrl?: string
 */
router.post("/:id/responder", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      mensagem,
      agenteNome,
      agenteNumero,
      tipoMidia,
      mediaId,
      mimeType,
      fileName,
      fileSize,
      mediaUrl,
    } = req.body as {
      mensagem?: string;
      agenteNome?: string;
      agenteNumero?: string;
      tipoMidia?: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
      mediaId?: string;
      mimeType?: string;
      fileName?: string;
      fileSize?: number;
      mediaUrl?: string;
    };

    if ((!mensagem || !mensagem.trim()) && !mediaId) {
      return res.status(400).json({
        error:
          "É necessário informar pelo menos uma mensagem de texto ou um anexo (mediaId).",
      });
    }

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);

    const atendimento = await repoAtendimento.findOne({ where: { id } });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const numeroCidadao = (atendimento as any).cidadaoNumero;
    if (!numeroCidadao) {
      return res.status(400).json({
        error:
          "Atendimento não possui número de cidadão cadastrado. Não é possível enviar resposta.",
      });
    }

    const idcliente = getIdCliente(req, atendimento);

    // Decide tipo de mensagem
    let tipoMensagem: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" =
      "TEXT";

    if (mediaId) {
      if (tipoMidia) {
        tipoMensagem = tipoMidia;
      } else if (mimeType) {
        if (mimeType.startsWith("image/")) tipoMensagem = "IMAGE";
        else if (mimeType.startsWith("audio/")) tipoMensagem = "AUDIO";
        else if (mimeType.startsWith("video/")) tipoMensagem = "VIDEO";
        else tipoMensagem = "DOCUMENT";
      } else {
        tipoMensagem = "DOCUMENT";
      }
    }

    // 1) Envia para o WhatsApp

    if (mediaId) {
      // envio de mídia
      if (tipoMensagem === "IMAGE") {
        await sendImageMessageById(numeroCidadao, mediaId);
      } else if (tipoMensagem === "AUDIO") {
        await sendAudioMessageById(numeroCidadao, mediaId);
      } else if (tipoMensagem === "VIDEO") {
        await sendVideoMessageById(numeroCidadao, mediaId);
      } else {
        // DOCUMENT ou fallback
        await sendDocumentMessageById(numeroCidadao, mediaId);
      }

      // Se também veio texto, podemos mandar em seguida como texto simples
      if (mensagem && mensagem.trim()) {
        await sendTextMessage(numeroCidadao, mensagem.trim());
      }
    } else if (mensagem && mensagem.trim()) {
      // apenas texto
      await sendTextMessage(numeroCidadao, mensagem.trim());
    }

    // 2) Registra mensagem no histórico (Mensagens)
    const msgEntity = repoMensagem.create({
      idcliente,
      atendimentoId: atendimento.id,
      direcao: "AGENT" as any,
      tipo: tipoMensagem as any,
      conteudoTexto: mensagem?.trim() || null,
      whatsappMediaId: mediaId || null,
      mediaUrl: mediaUrl || null,
      mimeType: mimeType || null,
      fileName: fileName || null,
      fileSize: fileSize ?? null,
      remetenteNumero:
        agenteNumero || (atendimento as any).agenteNumero || "PAINEL",
      comandoCodigo: null,
      comandoDescricao: mediaId
        ? "Resposta (mídia) enviada pelo painel de recados (modo recado)."
        : "Resposta enviada pelo painel de recados (modo recado).",
    } as any);

    await repoMensagem.save(msgEntity);

    // 3) Atualiza nome/número do agente se veio do painel
    const atualizacoes: Partial<Atendimento> = {};
    if (agenteNome && !(atendimento as any).agenteNome) {
      (atualizacoes as any).agenteNome = agenteNome;
    }
    if (agenteNumero && !(atendimento as any).agenteNumero) {
      (atualizacoes as any).agenteNumero = agenteNumero;
    }

    if (Object.keys(atualizacoes).length > 0) {
      await repoAtendimento.update(atendimento.id, atualizacoes);
    }

    res.json({
      ok: true,
      message: "Resposta enviada ao cidadão com sucesso.",
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao responder recado:", err);
    res.status(500).json({ error: "Erro ao responder recado." });
  }
});

/**
 * PATCH /recados/:id/concluir
 *
 * Marca o recado (atendimento em modo recado) como FINISHED.
 * Após isso, o painel não deixará mais responder.
 */
router.patch("/:id/concluir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const atendimento = await repoAtendimento.findOne({
      where: { id },
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    // Ajusta status e data de encerramento
    (atendimento as any).status = "FINISHED";
    (atendimento as any).encerradoEm = new Date();

    await repoAtendimento.save(atendimento);

    res.json({
      ok: true,
      message: "Recado concluído com sucesso.",
      status: atendimento.status,
      encerradoEm: (atendimento as any).encerradoEm,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao concluir recado:", err);
    res.status(500).json({ error: "Erro ao concluir recado." });
  }
});

/**
 * PATCH /recados/:id/transferir
 *
 * Transfere o atendimento (recado) para outro departamento e/ou agente.
 * Body:
 *   - departamentoId?: number
 *   - agenteNome?: string
 *   - agenteNumero?: string
 */
router.patch("/:id/transferir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { departamentoId, agenteNome, agenteNumero } = req.body as {
      departamentoId?: number;
      agenteNome?: string;
      agenteNumero?: string;
    };

    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const atendimento = await repoAtendimento.findOne({
      where: { id },
      relations: ["departamento"],
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const atualizacoes: Partial<Atendimento> = {};

    if (departamentoId) {
      (atualizacoes as any).departamentoId = departamentoId;
    }
    if (agenteNome) {
      (atualizacoes as any).agenteNome = agenteNome;
    }
    if (agenteNumero) {
      (atualizacoes as any).agenteNumero = agenteNumero;
    }

    await repoAtendimento.update(atendimento.id, atualizacoes);

    res.json({
      ok: true,
      message: "Recado transferido/atualizado com sucesso.",
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao transferir recado:", err);
    res.status(500).json({ error: "Erro ao transferir recado." });
  }
});

export default router;
