"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const env_1 = require("../config/env");
const sessionService_1 = require("../services/sessionService");
const router = (0, express_1.Router)();
// GET para verificação do webhook (Meta)
router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === env_1.env.whatsapp.verifyToken) {
        console.log("Webhook verificado com sucesso!");
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});
router.post("/webhook", async (req, res) => {
    try {
        const body = req.body;
        if (body.object === "whatsapp_business_account") {
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const messages = value?.messages;
            if (Array.isArray(messages)) {
                for (const message of messages) {
                    const from = message.from;
                    const msgId = message.id;
                    const msgType = message.type || "text";
                    let tipo = "TEXT";
                    let text;
                    let mediaId;
                    let mimeType;
                    let fileName;
                    if (msgType === "text") {
                        tipo = "TEXT";
                        text = message.text?.body;
                    }
                    else if (msgType === "image") {
                        tipo = "IMAGE";
                        mediaId = message.image?.id;
                        text = message.image?.caption;
                        mimeType = message.image?.mime_type;
                    }
                    else if (msgType === "audio") {
                        tipo = "AUDIO";
                        mediaId = message.audio?.id;
                        mimeType = message.audio?.mime_type;
                    }
                    else if (msgType === "video") {
                        tipo = "VIDEO";
                        mediaId = message.video?.id;
                        text = message.video?.caption;
                        mimeType = message.video?.mime_type;
                    }
                    else if (msgType === "document") {
                        tipo = "DOCUMENT";
                        mediaId = message.document?.id;
                        text = message.document?.caption;
                        mimeType = message.document?.mime_type;
                        fileName = message.document?.filename;
                    }
                    else {
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
                    if ((0, sessionService_1.isAgentNumber)(from)) {
                        await (0, sessionService_1.handleAgentMessage)(incoming);
                    }
                    else {
                        await processCitizenEntry(incoming);
                    }
                }
            }
        }
        res.sendStatus(200);
    }
    catch (err) {
        console.error("Erro no webhook:", err);
        res.sendStatus(500);
    }
});
async function processCitizenEntry(incoming) {
    const { from, text = "" } = incoming;
    const trimmed = text.trim().toLowerCase();
    if (["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite"].includes(trimmed)) {
        await handleGreeting(from);
        return;
    }
    await (0, sessionService_1.handleCitizenMessage)(incoming);
}
async function handleGreeting(from) {
    const intro = "Olá! 👋\n" +
        "Você está falando com o atendimento automatizado da Secretaria.\n\n" +
        "Por favor, me diga *seu nome completo* para continuarmos.";
    const { sendTextMessage } = await Promise.resolve().then(() => __importStar(require("../services/whatsappService")));
    await sendTextMessage(from, intro);
}
exports.default = router;
