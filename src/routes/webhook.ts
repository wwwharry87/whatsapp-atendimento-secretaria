import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { handleCitizenMessage, handleAgentMessage } from "../services/sessionService";
import { MensagemTipo } from "../entities/Mensagem";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";

const router = Router();

// Verificação do webhook (GET)
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsapp.verifyToken) {
    console.log("WEBHOOK_VERIFIED");
    return res.status(200).send(challenge);
  } else {
    console.warn("Falha na verificação do webhook");
    return res.sendStatus(403);
  }
});

// Função auxiliar: verifica no BANCO se o número é de um responsável de departamento
async function isAgentFromDatabase(whatsappNumber: string): Promise<boolean> {
  const normalized = whatsappNumber.replace(/\D/g, "");

  const repo = AppDataSource.getRepository(Departamento);

  const departamento = await repo
    .createQueryBuilder("d")
    .where(
      "regexp_replace(coalesce(d.responsavelNumero, ''), '\\D', '', 'g') = :num",
      { num: normalized }
    )
    .getOne();

  return !!departamento;
}

// Webhook de mensagens (POST)
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Estrutura padrão do WhatsApp Cloud API
    if (!body || !body.entry || !Array.isArray(body.entry)) {
      return res.sendStatus(200);
    }

    for (const entry of body.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        // Ignora notificações de status, entrega, etc.
        const messages = value.messages;
        if (!messages || !Array.isArray(messages)) continue;

        for (const message of messages) {
          const from = message.from; // número do WhatsApp de quem enviou
          if (!from) continue;

          let tipo: MensagemTipo = "TEXT";
          let texto: string | undefined = undefined;
          let mediaId: string | undefined = undefined;
          let mimeType: string | undefined = undefined;
          let fileName: string | undefined = undefined;

          // Identifica tipo da mensagem
          if (message.type === "text" && message.text) {
            tipo = "TEXT";
            texto = message.text.body;
          } else if (message.type === "image" && message.image) {
            tipo = "IMAGE";
            mediaId = message.image.id;
            mimeType = message.image.mime_type;
            texto = message.image.caption;
          } else if (message.type === "audio" && message.audio) {
            tipo = "AUDIO";
            mediaId = message.audio.id;
            mimeType = message.audio.mime_type;
          } else if (message.type === "video" && message.video) {
            tipo = "VIDEO";
            mediaId = message.video.id;
            mimeType = message.video.mime_type;
            texto = message.video.caption;
          } else if (message.type === "document" && message.document) {
            tipo = "DOCUMENT";
            mediaId = message.document.id;
            mimeType = message.document.mime_type;
            fileName = message.document.filename;
          } else {
            // Tipos que não vamos tratar por enquanto (sticker, location, etc.)
            console.log("Mensagem de tipo não suportado por enquanto:", message.type);
            continue;
          }

          // Descobre se é AGENTE ou CIDADÃO
          const isAgent = await isAgentFromDatabase(from);

          const incoming = {
            from,
            text: texto,
            whatsappMessageId: message.id,
            tipo,
            mediaId,
            mimeType,
            fileName
          };

          if (isAgent) {
            console.log("Mensagem de AGENTE:", from, texto);
            await handleAgentMessage(incoming);
          } else {
            console.log("Mensagem de CIDADÃO:", from, texto);
            await handleCitizenMessage(incoming);
          }
        }
      }
    }

    // WhatsApp espera 200 OK rápido
    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.sendStatus(500);
  }
});

export default router;
