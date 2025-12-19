// src/routes/media.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";

import { env } from "../config/env";
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

/**
 * Multer em memória para upload de arquivo
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

/**
 * Lê o idcliente colocado pelo authMiddleware no req
 */
function getRequestClienteId(req: Request): number | undefined {
  const { idcliente } = req as AuthRequest;
  if (typeof idcliente === "number") {
    return idcliente;
  }
  return undefined;
}

/**
 * Resolve um Cliente a partir de:
 *  1) idcliente do token, se existir;
 *  2) atendimentoId informado (buscando o Atendimento e pegando o idcliente).
 */
async function resolveClienteFromRequest(
  req: Request,
  atendimentoIdFromBody?: string
): Promise<Cliente> {
  const clienteRepo = AppDataSource.getRepository(Cliente);
  const atendimentoRepo = AppDataSource.getRepository(Atendimento);

  const idcliente = getRequestClienteId(req);

  // 🔒 Em produção multi-tenant, idcliente SEMPRE vem do token (authMiddleware).
  if (!idcliente) {
    console.error("[MEDIA] Erro: idcliente ausente no request (token).");
    throw {
      status: 401,
      message: "Não autorizado. Faça login novamente.",
    };
  }

  // Se o painel informou atendimentoId, validamos que ele pertence a este cliente
  if (atendimentoIdFromBody) {
    const atendimento = await atendimentoRepo.findOne({
      where: { id: atendimentoIdFromBody as any, idcliente: idcliente as any } as any,
      select: ["id", "idcliente"] as any,
    });

    if (!atendimento) {
      console.error(
        "[MEDIA] Upload recusado: atendimentoId não encontrado para este cliente.",
        { idcliente, atendimentoIdFromBody }
      );
      throw {
        status: 403,
        message: "Atendimento inválido para este município.",
      };
    }
  }

  const cliente = await clienteRepo.findOneBy({ id: idcliente });

  if (!cliente) {
    console.error("[MEDIA] Cliente não encontrado para idcliente=", idcliente);
    throw {
      status: 404,
      message: "Cliente não encontrado para o usuário autenticado.",
    };
  }

  if (!cliente.whatsappAccessToken || !cliente.whatsappPhoneNumberId) {
    console.error(
      "[MEDIA] Cliente sem configuração WhatsApp completa:",
      cliente.id,
      cliente.nome
    );
    throw {
      status: 500,
      message:
        "Cliente não possui configuração de WhatsApp completa (token ou phone_number_id ausente).",
    };
  }

  return cliente;
}

/**
 * GET /media/:mediaId

 *
 * Proxy para buscar mídias da API do WhatsApp Cloud.
 *
 * Aqui usamos o idcliente do token para descobrir qual Cliente (e token)
 * deve ser usado para buscar a mídia.
 *
 * Opcionalmente, também tentamos cruzar com a tabela de Mensagens para
 * validar que a mídia pertence a este cliente.
 */
router.get("/:mediaId", async (req: Request, res: Response) => {
  const { mediaId } = req.params;

  if (!env.whatsapp.apiVersion) {
    console.error(
      "Config da API do WhatsApp não está completa (WHATSAPP_API_VERSION)."
    );
    return res.status(500).send("WhatsApp não configurado.");
  }

  try {
    const clienteRepo = AppDataSource.getRepository(Cliente);
    const mensagemRepo = AppDataSource.getRepository(Mensagem);

    const idcliente = getRequestClienteId(req);

    // 🔒 idcliente sempre vem do token (authMiddleware)
    if (!idcliente) {
      return res.status(401).send("Não autorizado.");
    }

    // 🔒 Valida que a mídia pertence a este município (evita baixar mídia aleatória)
    const msg = await mensagemRepo.findOne({
      where: { idcliente: idcliente as any, whatsappMediaId: mediaId as any } as any,
      select: ["id", "idcliente", "whatsappMediaId"] as any,
    });

    if (!msg) {
      return res.status(404).send("Mídia não encontrada para este município.");
    }

    const cliente = await clienteRepo.findOneBy({ id: idcliente });

    if (!cliente || !cliente.whatsappAccessToken) {
      console.error("[MEDIA] Cliente sem token configurado:", idcliente);
      return res.status(500).send("Configuração de WhatsApp não encontrada.");
    }

    // 1) Busca metadados da mídia (url, mime_type, etc.)
    const metaUrl = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${mediaId}`;

    console.log("[MEDIA] Buscando metadados da mídia:", metaUrl);

    const metaResp = await axios.get(metaUrl, {
      headers: {
        Authorization: `Bearer ${cliente.whatsappAccessToken}`,
      },
    });

    const { url, mime_type } = metaResp.data || {};

    if (!url) {
      console.warn(
        "[MEDIA] Mídia não encontrada na API do WhatsApp:",
        mediaId,
        metaResp.data
      );
      return res.status(404).send("Mídia não encontrada.");
    }

    // 2) Baixa a mídia com Authorization e faz streaming para o cliente
    const mediaResp = await axios.get(url, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${cliente.whatsappAccessToken}`,
      },
    });

    if (mime_type) {
      res.setHeader("Content-Type", mime_type);
    }

    mediaResp.data.pipe(res);
  } catch (err: any) {
    console.error(
      "[MEDIA] Erro ao buscar mídia do WhatsApp:",
      err?.response?.status,
      err?.response?.data || err.message
    );
    res.status(500).send("Erro ao buscar mídia.");
  }
});

/**
 * POST /media/upload

 *
 * Upload de um arquivo para a API do WhatsApp Cloud, retornando o mediaId.
 *
 * Corpo (multipart/form-data):
 *  - file: arquivo (campo obrigatório)
 *  - atendimentoId: string (opcional, mas recomendado no painel,
 *    para conseguirmos descobrir o idcliente a partir do atendimento,
 *    caso algo falhe no token).
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!env.whatsapp.apiVersion) {
        console.error(
          "[MEDIA] WHATSAPP_API_VERSION não configurado nas variáveis de ambiente."
        );
        return res.status(500).json({
          error: "WhatsApp não configurado (versão da API ausente).",
        });
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        return res
          .status(400)
          .json({ error: "Arquivo (campo 'file') é obrigatório." });
      }

      const { atendimentoId } = req.body as { atendimentoId?: string };

      // Resolve cliente baseado no token OU no atendimentoId
      const cliente = await resolveClienteFromRequest(req, atendimentoId);

      const graphUrl = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${cliente.whatsappPhoneNumberId}/media`;

      const form = new FormData();
      form.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });
      form.append("messaging_product", "whatsapp");

      console.log("[MEDIA] Enviando arquivo para WhatsApp Cloud:", {
        graphUrl,
        filename: file.originalname,
        size: file.size,
        mime: file.mimetype,
        clienteId: cliente.id,
      });

      const resp = await axios.post(graphUrl, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${cliente.whatsappAccessToken}`,
        },
      });

      const mediaId = resp.data?.id;
      if (!mediaId) {
        console.error(
          "[MEDIA] Resposta da API de mídia não retornou ID:",
          resp.data
        );
        return res
          .status(500)
          .json({ error: "Erro ao enviar mídia para WhatsApp." });
      }

      return res.json({
        mediaId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size,
      });
    } catch (err: any) {
      const status = err?.status || 500;
      const message =
        err?.message || "Erro interno ao fazer upload de mídia.";

      console.error("[MEDIA] Erro no upload:", err);
      return res.status(status).json({ error: message });
    }
  }
);

export default router;
