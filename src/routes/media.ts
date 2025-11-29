// src/routes/media.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import { env } from "../config/env";

const router = Router();

/**
 * Proxy simples para buscar mídias da API do WhatsApp.
 * URL padrão gerada: /media/:mediaId
 *
 * Exemplo: /media/1234567890
 */
router.get("/:mediaId", async (req: Request, res: Response) => {
  const { mediaId } = req.params;

  if (!env.whatsapp.accessToken || !env.whatsapp.apiVersion) {
    console.error("Config da API do WhatsApp não está completa");
    return res.status(500).send("WhatsApp não configurado.");
  }

  try {
    // 1) Busca metadados da mídia (url, mime_type, etc.)
    const metaUrl = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${mediaId}`;
    const metaResp = await axios.get(metaUrl, {
      headers: {
        Authorization: `Bearer ${env.whatsapp.accessToken}`
      }
    });

    const { url, mime_type } = metaResp.data || {};

    if (!url) {
      console.warn("Mídia não encontrada na API do WhatsApp:", mediaId);
      return res.status(404).send("Mídia não encontrada.");
    }

    // 2) Baixa a mídia e faz streaming para o cliente
    const mediaResp = await axios.get(url, {
      responseType: "stream"
    });

    if (mime_type) {
      res.setHeader("Content-Type", mime_type);
    }

    mediaResp.data.pipe(res);
  } catch (err: any) {
    console.error(
      "Erro ao buscar mídia do WhatsApp:",
      err?.response?.data || err.message
    );
    res.status(500).send("Erro ao buscar mídia.");
  }
});

export default router;
