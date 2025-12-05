import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { handleCitizenMessage, handleAgentMessage } from "../services/sessionService";
import { MensagemTipo } from "../entities/Mensagem";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";
import { Usuario } from "../entities/Usuario";

const router = Router();

function normalizePhone(num: string): string {
  return num.replace(/\D/g, "");
}

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

// Verifica no BANCO se o número é de um agente
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

  // 2) Verifica se é um usuário cadastrado com telefone_whatsapp
  const usuario = await userRepo
    .createQueryBuilder("u")
    .where(
      "right(regexp_replace(coalesce(u.telefone_whatsapp, ''), '\\D', '', 'g'), 8) = :last8",
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


// Webhook de mensagens (POST)
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
            console.log("Mensagem de tipo não suportado ainda:", message.type);
            continue;
          }

          const isAgent = await isAgentFromDatabase(from);

          const incoming = {
            from, // número original do WhatsApp
            text: texto,
            whatsappMessageId: message.id,
            tipo,
            mediaId,
            mimeType,
            fileName
          };

          if (isAgent) {
            console.log("→ Roteando como AGENTE:", from, texto);
            await handleAgentMessage(incoming);
          } else {
            console.log("→ Roteando como CIDADÃO:", from, texto);
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
