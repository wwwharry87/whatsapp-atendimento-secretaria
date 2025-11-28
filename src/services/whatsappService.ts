import axios from "axios";
import { env } from "../config/env";

const baseURL = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;

export async function sendTextMessage(to: string, body: string) {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    console.error("Config da API do WhatsApp não está completa");
    return;
  }

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body
        }
      },
      {
        headers: {
          Authorization: `Bearer ${env.whatsapp.accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err: any) {
    console.error("Erro ao enviar mensagem WhatsApp:", err?.response?.data || err.message);
  }
}
