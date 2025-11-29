// src/services/whatsappService.ts
import axios from "axios";
import { env } from "../config/env";

const baseURL = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${env.whatsapp.accessToken}`,
    "Content-Type": "application/json",
  };
}

function isWhatsConfigured() {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    console.error("Config da API do WhatsApp não está completa");
    return false;
  }
  return true;
}

export async function sendTextMessage(to: string, body: string) {
  if (!isWhatsConfigured()) return;

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      { headers: getAuthHeaders() }
    );
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (texto):",
      err?.response?.data || err.message
    );
  }
}

// ========= ENVIO DE MÍDIA POR ID (REUTILIZANDO mediaId DO PRÓPRIO WHATSAPP) ========= //

export async function sendAudioMessageById(to: string, mediaId: string) {
  if (!isWhatsConfigured()) return;

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "audio",
        audio: { id: mediaId },
      },
      { headers: getAuthHeaders() }
    );
  } catch (err: any) {
    console.error(
      "Erro ao enviar áudio pelo WhatsApp:",
      err?.response?.data || err.message
    );
  }
}

export async function sendImageMessageById(to: string, mediaId: string) {
  if (!isWhatsConfigured()) return;

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { id: mediaId },
      },
      { headers: getAuthHeaders() }
    );
  } catch (err: any) {
    console.error(
      "Erro ao enviar imagem pelo WhatsApp:",
      err?.response?.data || err.message
    );
  }
}

export async function sendDocumentMessageById(to: string, mediaId: string) {
  if (!isWhatsConfigured()) return;

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { id: mediaId },
      },
      { headers: getAuthHeaders() }
    );
  } catch (err: any) {
    console.error(
      "Erro ao enviar documento pelo WhatsApp:",
      err?.response?.data || err.message
    );
  }
}

export async function sendVideoMessageById(to: string, mediaId: string) {
  if (!isWhatsConfigured()) return;

  try {
    await axios.post(
      baseURL,
      {
        messaging_product: "whatsapp",
        to,
        type: "video",
        video: { id: mediaId },
      },
      { headers: getAuthHeaders() }
    );
  } catch (err: any) {
    console.error(
      "Erro ao enviar vídeo pelo WhatsApp:",
      err?.response?.data || err.message
    );
  }
}
