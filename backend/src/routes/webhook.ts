// src/routes/webhook.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import {
  IncomingMessage,
  handleCitizenMessage,
  handleAgentMessage,
  isAgentNumber,detectIsAgent
} from "../services/sessionService";




const router = Router();

/**
 * =========================
 * Helpers
 * =========================
 */
function normalizePhone(phone: string | undefined | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

function safeString(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Opcional: valida assinatura do Meta/WhatsApp.
 * Para funcionar, você precisa ter o APP_SECRET no env, ex:
 * env.whatsapp.appSecret (adicione no seu config/env)
 *
 * Header esperado: "x-hub-signature-256: sha256=<hash>"
 */
function verifyMetaSignature(req: Request): boolean {
  const appSecret = (env as any)?.whatsapp?.appSecret || process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // se não configurou, não bloqueia

  const header = req.headers["x-hub-signature-256"];
  if (!header || typeof header !== "string") return false;

  const [algo, signature] = header.split("=");
  if (algo !== "sha256" || !signature) return false;

  // ⚠️ IMPORTANTE: precisa do rawBody pra validar corretamente.
  // Se você ainda não captura rawBody no express.json, então aqui
  // tentamos um fallback usando JSON.stringify(body), que NÃO é perfeito.
  // O ideal: configurar express.json({ verify: (req,res,buf)=> req.rawBody = buf })
  const rawBody: Buffer | undefined = (req as any).rawBody;
  const bodyForHmac = rawBody ? rawBody : Buffer.from(JSON.stringify(req.body || {}));

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(bodyForHmac)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Dedup simples em memória (TTL).
 * - Evita processamento duplicado em reentregas.
 * - Em multi-instância, o ideal é garantir dedupe também no banco (unique index).
 */
const DEDUPE_TTL_MS = 10 * 60 * 1000; // 10 min
const dedupeMap = new Map<string, number>(); // msgId -> expiresAt

function cleanupDedupe() {
  const now = Date.now();
  for (const [k, exp] of dedupeMap.entries()) {
    if (exp <= now) dedupeMap.delete(k);
  }
}

function alreadyProcessed(whatsappMessageId: string | undefined): boolean {
  if (!whatsappMessageId) return false;
  cleanupDedupe();
  const now = Date.now();
  const exp = dedupeMap.get(whatsappMessageId);
  if (exp && exp > now) return true;
  dedupeMap.set(whatsappMessageId, now + DEDUPE_TTL_MS);
  return false;
}

/**
 * Mapeia a mensagem do WhatsApp (Cloud API) para IncomingMessage.
 */
function mapMessageToIncoming(rawMessage: any, phoneNumberId?: string): IncomingMessage {
  const from = normalizePhone(rawMessage.from);

  let text: string | undefined;
  let tipo: IncomingMessage["tipo"] = "TEXT";
  let mediaId: string | undefined;
  let mimeType: string | undefined;
  let fileName: string | undefined;

  const waType: string = safeString(rawMessage.type);

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
    tipo = "TEXT";
    text = rawMessage.text?.body || undefined;
  }

  return {
    from,
    text,
    tipo,
    whatsappMessageId: rawMessage.id,
    mediaId,
    mimeType,
    fileName,
    phoneNumberId: phoneNumberId || undefined,
  };
}

/**
 * =========================
 * GET /webhook (verificação)
 * =========================
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

  console.warn("[WEBHOOK] Verificação falhou.", { mode, token });
  return res.sendStatus(403);
});

/**
 * =========================
 * POST /webhook
 * =========================
 *
 * Estratégia:
 * 1) Valida payload mínimo
 * 2) RESPONDE 200 IMEDIATO (WhatsApp exige rápido)
 * 3) Processa mensagens de forma assíncrona (setImmediate)
 */
router.post("/", (req: Request, res: Response) => {
  const body = req.body;

  // (Opcional) valida assinatura se você configurar APP_SECRET
  // Se você quiser forçar, troque para: if (!verifyMetaSignature(req)) return res.sendStatus(403);
  if (!verifyMetaSignature(req)) {
    console.warn("[WEBHOOK] Assinatura inválida (x-hub-signature-256).");
    // Para evitar travar sua operação se ainda não configurou rawBody, eu não bloqueio.
    // Se quiser travar, descomente abaixo:
    // return res.sendStatus(403);
  }

  // Não é WhatsApp payload? responde 200 e sai
  if (!body || body.object !== "whatsapp_business_account") {
    return res.sendStatus(200);
  }

  // ✅ RESPONDE 200 AGORA (muito importante)
  res.sendStatus(200);

  // Processa depois de responder
  setImmediate(async () => {
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

          // Se vier somente statuses (sem messages), só loga de leve
          const statuses: any[] = value.statuses || [];
          if ((!messages || messages.length === 0) && statuses.length > 0) {
            console.log("[WEBHOOK] Status recebido. count=", statuses.length);
          }

          for (const msg of messages) {
            try {
              const from = normalizePhone(msg.from);
              const incoming = mapMessageToIncoming(msg, phoneNumberId);

              // Dedup por whatsappMessageId
              if (alreadyProcessed(incoming.whatsappMessageId)) {
                console.log(
                  `[WEBHOOK] DEDUPE messageId=${incoming.whatsappMessageId} from=${from}`
                );
                continue;
              }

              // Decide se é AGENTE ou CIDADÃO
              const isAgent = await detectIsAgent(from, phoneNumberId);

              console.log(
                `[WEBHOOK] Mensagem recebida de ${from} tipo=${msg.type} phone_number_id=${phoneNumberId} isAgent=${isAgent} msgId=${incoming.whatsappMessageId}`
              );

              if (isAgent) {
                await handleAgentMessage(incoming);
              } else {
                await handleCitizenMessage(incoming);
              }
            } catch (err) {
              console.error("[WEBHOOK] Erro ao processar mensagem individual:", err);
              // continua para a próxima mensagem
            }
          }
        }
      }
    } catch (err) {
      console.error("[WEBHOOK] Erro ao processar payload:", err);
    }
  });
});

export default router;
