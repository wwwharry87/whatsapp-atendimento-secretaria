// src/routes/webhook.ts
import { Router, Request, Response } from "express";
import { env } from "../config/env";
import {
  IncomingMessage,
  handleCitizenMessage,
  handleAgentMessage,
  isAgentNumber,
} from "../services/sessionService";

const router = Router();

/**
 * Normaliza um número de telefone para somente dígitos.
 * Ex.: "+55 (94) 99123-4567" -> "559491234567"
 */
function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

/**
 * Mapeia a mensagem do WhatsApp (Cloud API) para nosso IncomingMessage.
 * - extrai texto ou interativo
 * - identifica tipo de mídia
 * - traz o phone_number_id para o sessionService descobrir o cliente
 */
function mapMessageToIncoming(
  rawMessage: any,
  phoneNumberId?: string
): IncomingMessage {
  const from = normalizePhone(rawMessage.from);

  let text: string | undefined;
  let tipo: IncomingMessage["tipo"] = "TEXT";
  let mediaId: string | undefined;
  let mimeType: string | undefined;
  let fileName: string | undefined;

  // Tipo padrão recebido da API
  const waType: string = rawMessage.type;

  if (waType === "text") {
    tipo = "TEXT";
    text = rawMessage.text?.body;
  } else if (waType === "image") {
    tipo = "IMAGE";
    mediaId = rawMessage.image?.id;
    mimeType = rawMessage.image?.mime_type;
    text = rawMessage.image?.caption || undefined;
  } else if (waType === "audio") {
    tipo = "AUDIO";
    mediaId = rawMessage.audio?.id;
    mimeType = rawMessage.audio?.mime_type;
  } else if (waType === "video") {
    tipo = "VIDEO";
    mediaId = rawMessage.video?.id;
    mimeType = rawMessage.video?.mime_type;
    text = rawMessage.video?.caption || undefined;
  } else if (waType === "document") {
    tipo = "DOCUMENT";
    mediaId = rawMessage.document?.id;
    mimeType = rawMessage.document?.mime_type;
    fileName = rawMessage.document?.filename || undefined;
  } else if (waType === "interactive") {
    // Botões / listas -> tratamos como TEXTO
    tipo = "TEXT";
    const interactive = rawMessage.interactive;
    if (interactive?.type === "button_reply") {
      text =
        interactive.button_reply?.title ||
        interactive.button_reply?.id ||
        undefined;
    } else if (interactive?.type === "list_reply") {
      text =
        interactive.list_reply?.title ||
        interactive.list_reply?.id ||
        undefined;
    }
  } else {
    // Qualquer outro tipo desconhecido: tratamos como TEXTO com fallback
    tipo = "TEXT";
    text = rawMessage.text?.body || undefined;
  }

  const incoming: IncomingMessage = {
    from,
    text,
    tipo,
    whatsappMessageId: rawMessage.id,
    mediaId,
    mimeType,
    fileName,
    phoneNumberId: phoneNumberId || undefined,
  };

  return incoming;
}

/**
 * GET /webhook
 * Endpoint de verificação do Webhook do WhatsApp (Facebook).
 * Ele envia hub.mode, hub.verify_token e hub.challenge.
 */
router.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const VERIFY_TOKEN = env.whatsapp.verifyToken;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WEBHOOK] Verificação OK.");
    return res.status(200).send(challenge);
  }

  console.warn(
    "[WEBHOOK] Verificação falhou. mode=",
    mode,
    " token=",
    token
  );
  return res.sendStatus(403);
});

/**
 * POST /webhook
 * Recebe eventos de mensagens do WhatsApp Cloud API.
 */
router.post("/", async (req: Request, res: Response) => {
  const body = req.body;

  // Estrutura padrão do WhatsApp Cloud API
  if (!body || body.object !== "whatsapp_business_account") {
    // Não é payload do WhatsApp, apenas responde 200 para não gerar erro.
    return res.sendStatus(200);
  }

  try {
    const entries: any[] = body.entry || [];

    for (const entry of entries) {
      const changes: any[] = entry.changes || [];

      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const phoneNumberId: string | undefined =
          value.metadata?.phone_number_id || undefined;

        const messages: any[] = value.messages || [];

        for (const msg of messages) {
          const fromRaw = msg.from;
          const from = normalizePhone(fromRaw);

          const incoming = mapMessageToIncoming(msg, phoneNumberId);

          // Decide se é um AGENTE ou um CIDADÃO com base nas sessões já carregadas
          const isAgent = isAgentNumber(from);

          console.log(
            `[WEBHOOK] Mensagem recebida de ${from} tipo=${msg.type} phone_number_id=${phoneNumberId} isAgent=${isAgent}`
          );

          if (isAgent) {
            // Fluxo de atendente (painel)
            await handleAgentMessage(incoming);
          } else {
            // Fluxo de cidadão
            await handleCitizenMessage(incoming);
          }
        }

        // Podemos ignorar "statuses" aqui ou tratar depois
        const statuses: any[] = value.statuses || [];
        if (statuses.length > 0) {
          console.log(
            "[WEBHOOK] Recebidos statuses:",
            JSON.stringify(statuses)
          );
        }
      }
    }

    // WhatsApp exige resposta 200 rápida
    return res.sendStatus(200);
  } catch (err) {
    console.error("[WEBHOOK] Erro ao processar payload:", err);
    // Ainda assim retornamos 200 para não o WhatsApp não ficar re-tentando indefinidamente
    return res.sendStatus(200);
  }
});

export default router;
