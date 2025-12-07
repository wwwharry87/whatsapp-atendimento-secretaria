// src/routes/webhook.ts
import { Router, Request, Response } from "express";
import { env } from "../config/env";
import {
  handleCitizenMessage,
  handleAgentMessage,
} from "../services/sessionService";
import { MensagemTipo } from "../entities/Mensagem";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";
import { Usuario } from "../entities/Usuario";

const router = Router();

function normalizePhone(num: string): string {
  return num.replace(/\D/g, "");
}

// ===================== VERIFICAÇÃO DO WEBHOOK (GET) =====================

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

// ===================== CHECAGEM SE É AGENTE NO BANCO =====================

async function isAgentFromDatabase(whatsappNumber: string): Promise<boolean> {
  const normalized = normalizePhone(whatsappNumber);
  const last8 = normalized.slice(-8); // ex: 91296984

  const depRepo = AppDataSource.getRepository(Departamento);
  const userRepo = AppDataSource.getRepository(Usuario);

  // 1) Verifica se é responsável de algum departamento
  const dep = await depRepo
    .createQueryBuilder("d")
    .where(
      "right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8",
      { last8 }
    )
    .getOne();

  if (dep) {
    console.log(
      `Número ${whatsappNumber} reconhecido como AGENTE via Departamento (${dep.nome})`
    );
    return true;
  }

  // 2) Verifica se é um usuário cadastrado com TELEFONE (coluna existente)
  const usuario = await userRepo
    .createQueryBuilder("u")
    .where(
      "right(regexp_replace(coalesce(u.telefone, ''), '\\D', '', 'g'), 8) = :last8",
      { last8 }
    )
    .getOne();

  if (usuario) {
    console.log(
      `Número ${whatsappNumber} reconhecido como AGENTE via Usuario (${usuario.nome})`
    );
    return true;
  }

  console.log(`Número ${whatsappNumber} NÃO encontrado como agente no banco.`);
  return false;
}

// ===================== PARSE DE MENSAGEM DO WHATSAPP =====================

type WhatsappMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: {
    id: string;
    mime_type?: string;
    filename?: string;
    caption?: string;
  };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

function mapMessageToIncoming(msg: WhatsappMessage) {
  const { from, id, type } = msg;

  let tipo: MensagemTipo = "TEXT";
  let text: string | undefined;
  let mediaId: string | undefined;
  let mimeType: string | undefined;
  let fileName: string | undefined;

  if (type === "text" && msg.text) {
    tipo = "TEXT";
    text = msg.text.body;
  } else if (type === "image" && msg.image) {
    tipo = "IMAGE";
    mediaId = msg.image.id;
    mimeType = msg.image.mime_type;
    text = msg.image.caption;
  } else if (type === "audio" && msg.audio) {
    tipo = "AUDIO";
    mediaId = msg.audio.id;
    mimeType = msg.audio.mime_type;
  } else if (type === "video" && msg.video) {
    tipo = "VIDEO";
    mediaId = msg.video.id;
    mimeType = msg.video.mime_type;
    text = msg.video.caption;
  } else if (type === "document" && msg.document) {
    tipo = "DOCUMENT";
    mediaId = msg.document.id;
    mimeType = msg.document.mime_type;
    fileName = msg.document.filename;
    text = msg.document.caption;
  } else if (type === "interactive" && msg.interactive) {
    tipo = "TEXT";
    if (msg.interactive.type === "button_reply" && msg.interactive.button_reply) {
      text = msg.interactive.button_reply.title || msg.interactive.button_reply.id;
    } else if (msg.interactive.type === "list_reply" && msg.interactive.list_reply) {
      text = msg.interactive.list_reply.title || msg.interactive.list_reply.id;
    }
  } else {
    // tipos não mapeados a gente trata como TEXT genérico
    tipo = "TEXT";
    text = "";
  }

  return {
    from,
    text,
    tipo,
    whatsappMessageId: id,
    mediaId,
    mimeType,
    fileName,
  };
}

// ===================== WEBHOOK DE MENSAGENS (POST) =====================

router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body;

    if (!body || !body.entry || !Array.isArray(body.entry)) {
      return res.sendStatus(200);
    }

    for (const entry of body.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const messages: WhatsappMessage[] = value.messages || [];
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
          continue;
        }

        for (const message of messages) {
          const from = message.from;
          if (!from) continue;

          const incoming = mapMessageToIncoming(message);
          const isAgent = await isAgentFromDatabase(from);

          if (isAgent) {
            await handleAgentMessage(incoming);
          } else {
            await handleCitizenMessage(incoming);
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

export default router;
