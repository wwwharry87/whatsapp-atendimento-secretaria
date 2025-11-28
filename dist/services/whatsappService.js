"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTextMessage = sendTextMessage;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const baseURL = `https://graph.facebook.com/${env_1.env.whatsapp.apiVersion}/${env_1.env.whatsapp.phoneNumberId}/messages`;
async function sendTextMessage(to, body) {
    if (!env_1.env.whatsapp.accessToken || !env_1.env.whatsapp.phoneNumberId) {
        console.error("Config da API do WhatsApp não está completa");
        return;
    }
    try {
        await axios_1.default.post(baseURL, {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: {
                body
            }
        }, {
            headers: {
                Authorization: `Bearer ${env_1.env.whatsapp.accessToken}`,
                "Content-Type": "application/json"
            }
        });
    }
    catch (err) {
        console.error("Erro ao enviar mensagem WhatsApp:", err?.response?.data || err.message);
    }
}
