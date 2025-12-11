// src/routes/media.ts
import { Router, Request, Response } from "express";
import axios from "axios";
import multer from "multer";
import FormData from "form-data";
import { AppDataSource } from "../database/data-source";
import { env } from "../config/env";

const router = Router();

// ===============================
// UPLOAD EM MEMÓRIA (multer)
// ===============================
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Pega o idcliente vindo do token (authMiddleware coloca em req.user)
 */
function getRequestClienteId(req: Request): number | undefined {
  const user = (req as any).user;
  if (user && typeof user.idcliente === "number") {
    return user.idcliente;
  }
  return undefined;
}

/**
 * Busca, na tabela "clientes", os dados do WhatsApp para este idcliente
 *
 * Campos usados:
 *  - whatsapp_access_token
 *  - whatsapp_phone_number_id
 *
 * A versão da API (apiVersion) vem da variável de ambiente:
 *  - env.whatsapp.apiVersion  (ex.: "v21.0")
 */
async function getWhatsAppConfigForRequest(req: Request): Promise<{
  idcliente: number;
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}> {
  const idcliente = getRequestClienteId(req);

  if (!idcliente) {
    throw new Error(
      "ID do cliente (idcliente) não encontrado no token de autenticação."
    );
  }

  // Repositório direto na tabela "clientes"
  const repo = AppDataSource.getRepository("clientes");

  const row = await repo
    .createQueryBuilder("c")
    .select([
      "c.id as id",
      "c.whatsapp_access_token as whatsapp_access_token",
      "c.whatsapp_phone_number_id as whatsapp_phone_number_id",
      "c.ativo as ativo",
    ])
    .where("c.id = :id", { id: idcliente })
    .getRawOne();

  if (!row) {
    throw new Error(`Cliente ${idcliente} não encontrado na tabela clientes.`);
  }

  if (row.ativo === false) {
    throw new Error(`Cliente ${idcliente} está inativo.`);
  }

  if (!row.whatsapp_access_token || !row.whatsapp_phone_number_id) {
    throw new Error(
      `Cliente ${idcliente} não possui configuração WhatsApp (token ou phone_number_id).`
    );
  }

  // Versão da API vinda do .env (WHATSAPP_API_VERSION)
  const apiVersion = env.whatsapp.apiVersion || "v21.0";

  return {
    idcliente,
    accessToken: row.whatsapp_access_token as string,
    phoneNumberId: row.whatsapp_phone_number_id as string,
    apiVersion,
  };
}

/**
 * Converte mimetype para um tipo lógico de mídia para usarmos no front/back.
 */
function mapMimeToTipoMidia(
  mime: string | undefined
): "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "TEXT" {
  if (!mime) return "TEXT";

  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("video/")) return "VIDEO";

  // pdf, docx, excel, zip → documento
  if (
    mime === "application/pdf" ||
    mime === "application/msword" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed"
  ) {
    return "DOCUMENT";
  }

  return "DOCUMENT";
}

/**
 * POST /media/upload
 *
 * Recebe um arquivo (campo "file") via multipart/form-data,
 * faz upload na API oficial do WhatsApp e devolve:
 *
 * {
 *   mediaId,
 *   mimeType,
 *   fileName,
 *   fileSize,
 *   mediaUrl: null,
 *   tipoMidia,
 *   tipo
 * }
 */
router.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado." });
      }

      // Config do WhatsApp para o idcliente do token
      const cfg = await getWhatsAppConfigForRequest(req);

      const formData = new FormData();
      formData.append("file", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
        knownLength: file.size,
      });

      const tipoMidia = mapMimeToTipoMidia(file.mimetype);

      // Algumas versões da API aceitam "type" = mimetype
      formData.append("type", file.mimetype);

      const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/media`;

      console.log(
        `[MEDIA] Enviando upload de mídia para: ${url} (cliente ${cfg.idcliente})`
      );

      const response = await axios.post(url, formData, {
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          ...formData.getHeaders(),
        },
      });

      const mediaId = response.data?.id;

      if (!mediaId) {
        console.error("[MEDIA] Retorno da API sem mediaId:", response.data);
        return res
          .status(500)
          .json({ error: "Falha ao obter mediaId da API do WhatsApp." });
      }

      return res.json({
        mediaId,
        mimeType: file.mimetype,
        fileName: file.originalname,
        fileSize: file.size,
        mediaUrl: null,
        tipoMidia,
        tipo: tipoMidia,
      });
    } catch (err: any) {
      console.error(
        "[MEDIA] Erro no upload:",
        err?.message,
        err?.response?.status,
        err?.response?.data
      );
      return res.status(500).json({
        error: "Erro ao fazer upload da mídia no WhatsApp.",
        detalhe: err?.message,
      });
    }
  }
);

/**
 * GET /media/:mediaId
 *
 * Proxy para buscar mídias da API do WhatsApp Cloud.
 *
 *  1) Busca metadados (url, mime_type) via Graph.
 *  2) Baixa a mídia com Authorization do cliente.
 *  3) Faz streaming para o navegador.
 */
router.get("/:mediaId", async (req: Request, res: Response) => {
  const { mediaId } = req.params;

  try {
    const cfg = await getWhatsAppConfigForRequest(req);

    const metaUrl = `https://graph.facebook.com/${cfg.apiVersion}/${mediaId}`;

    console.log(
      `[MEDIA] Buscando metadados da mídia: ${metaUrl} (cliente ${cfg.idcliente})`
    );

    const metaResp = await axios.get(metaUrl, {
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
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

    console.log("[MEDIA] URL da mídia obtida. Baixando arquivo...");

    const mediaResp = await axios.get(url, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
      },
    });

    if (mime_type) {
      res.setHeader("Content-Type", mime_type);
    }

    mediaResp.data.pipe(res);
  } catch (err: any) {
    console.error(
      "[MEDIA] Erro ao buscar mídia do WhatsApp:",
      err?.message,
      err?.response?.status,
      err?.response?.data
    );
    res.status(500).send("Erro ao buscar mídia.");
  }
});

export default router;
