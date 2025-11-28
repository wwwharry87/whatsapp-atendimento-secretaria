import { Router, Request, Response } from "express";
import { env } from "../config/env";
import {
  handleAgentMessage,
  handleCitizenMessage,
  isAgentNumber
} from "../services/sessionService";
import { MensagemTipo } from "../entities/Mensagem";

const router = Router();

// GET para verificação do webhook (Meta)
router.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsapp.verifyToken) {
    console.log("Webhook verificado com sucesso!");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (body.object === "whatsapp_business_account") {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const messages = value?.messages;

      if (Array.isArray(messages)) {
        for (const message of messages) {
          const from = message.from as string;
          const msgId = message.id as string | undefined;
          const msgType = (message.type as string) || "text";

          let tipo: MensagemTipo = "TEXT";
          let text: string | undefined;
          let mediaId: string | undefined;
          let mimeType: string | undefined;
          let fileName: string | undefined;

          if (msgType === "text") {
            tipo = "TEXT";
            text = message.text?.body;
          } else if (msgType === "image") {
            tipo = "IMAGE";
            mediaId = message.image?.id;
            text = message.image?.caption;
            mimeType = message.image?.mime_type;
          } else if (msgType === "audio") {
            tipo = "AUDIO";
            mediaId = message.audio?.id;
            mimeType = message.audio?.mime_type;
          } else if (msgType === "video") {
            tipo = "VIDEO";
            mediaId = message.video?.id;
            text = message.video?.caption;
            mimeType = message.video?.mime_type;
          } else if (msgType === "document") {
            tipo = "DOCUMENT";
            mediaId = message.document?.id;
            text = message.document?.caption;
            mimeType = message.document?.mime_type;
            fileName = message.document?.filename;
          } else {
            tipo = "OUTRO";
          }

          const incoming = {
            from,
            text,
            whatsappMessageId: msgId,
            tipo,
            mediaId,
            mimeType,
            fileName
          };

          console.log("Mensagem recebida:", { from, tipo, text });

          if (isAgentNumber(from)) {
            await handleAgentMessage(incoming);
          } else {
            await processCitizenEntry(incoming);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.sendStatus(500);
  }
});

async function processCitizenEntry(incoming: {
  from: string;
  text?: string;
  whatsappMessageId?: string;
  tipo: MensagemTipo;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
}) {
  const { from, text = "" } = incoming;
  const trimmed = text.trim().toLowerCase();

  if (
    ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"].includes(trimmed)
  ) {
    await handleGreeting(from);
    return;
  }

  await handleCitizenMessage(incoming);
}

async function handleGreeting(from: string) {
  const intro =
    "Olá! 👋\n" +
    "Você está falando com o atendimento automatizado da Secretaria.\n\n" +
    "Por favor, me diga *seu nome completo* para continuarmos.";

  const { sendTextMessage } = await import("../services/whatsappService");
  await sendTextMessage(from, intro);
}

export default router;
