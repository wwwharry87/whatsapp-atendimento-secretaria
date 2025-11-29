// src/routes/media.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { env } from "../config/env";

const router = Router();

/**
 * Proxy para buscar mídias da API do WhatsApp Cloud.
 * Exemplo de uso:
 *   GET /media/25023935153958285
 *
 * Esse endpoint:
 *  1) Chama o Graph API com o mediaId para obter a URL temporária da mídia.
 *  2) Baixa a mídia com Authorization.
 *  3) Faz streaming direto para o cliente (navegador).
 */
router.get("/:mediaId", async (req: Request, res: Response) => {
  const { mediaId } = req.params;

  if (!env.whatsapp.accessToken || !env.whatsapp.apiVersion) {
    console.error("Config da API do WhatsApp não está completa (token ou versão).");
    return res.status(500).send("WhatsApp não configurado.");
  }

  try {
    // 1) Busca metadados da mídia (url, mime_type, etc.)
    const metaUrl = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${mediaId}`;

    console.log("[MEDIA] Buscando metadados da mídia:", metaUrl);

    const metaResp = await axios.get(metaUrl, {
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
      },
    });

    const { url, mime_type } = metaResp.data || {};

    if (!url) {
      console.warn("[MEDIA] Mídia não encontrada na API do WhatsApp:", mediaId, metaResp.data);
      return res.status(404).send("Mídia não encontrada.");
    }

    console.log("[MEDIA] URL da mídia obtida. Baixando arquivo...");

    // 2) Baixa a mídia com Authorization e faz streaming para o cliente
    const mediaResp = await axios.get(url, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`,
      },
    });

    if (mime_type) {
      res.setHeader("Content-Type", mime_type);
    }

    // Opcional: permitir que o browser faça download com nome de arquivo
    // res.setHeader("Content-Disposition", `inline; filename="${mediaId}"`);

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

export default router;
