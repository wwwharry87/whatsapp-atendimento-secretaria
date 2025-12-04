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
    console.error(
      "[WHATSAPP] Config da API do WhatsApp não está completa (accessToken ou phoneNumberId ausentes)"
    );
    return false;
  }
  return true;
}

// ====================== TEXTO ======================

export async function sendTextMessage(to: string, body: string) {
  if (!isWhatsConfigured()) return;

  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body,
        preview_url: false,
      },
    };

    console.log("[WHATSAPP][TEXT] Enviando texto para", to, "body=", body);

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log("[WHATSAPP][TEXT] Sucesso:", res.data);
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
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { id: mediaId },
    };

    console.log(
      "[WHATSAPP][AUDIO] Enviando áudio para",
      to,
      "mediaId=",
      mediaId
    );

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log("[WHATSAPP][AUDIO] Sucesso:", res.data);
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
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { id: mediaId },
    };

    console.log(
      "[WHATSAPP][IMAGE] Enviando imagem para",
      to,
      "mediaId=",
      mediaId
    );

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log("[WHATSAPP][IMAGE] Sucesso:", res.data);
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
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId },
    };

    console.log(
      "[WHATSAPP][DOCUMENT] Enviando documento para",
      to,
      "mediaId=",
      mediaId
    );

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log("[WHATSAPP][DOCUMENT] Sucesso:", res.data);
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
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId },
    };

    console.log(
      "[WHATSAPP][VIDEO] Enviando vídeo para",
      to,
      "mediaId=",
      mediaId
    );

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log("[WHATSAPP][VIDEO] Sucesso:", res.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar vídeo pelo WhatsApp:",
      err?.response?.data || err.message
    );
  }
}

// ====================== TEMPLATE: novo_atendimento_agente ======================

type NovoAtendimentoTemplateParams = {
  to: string;
  departamentoNome: string; // cabeçalho {{1}}
  cidadaoNome: string;      // body {{1}}
  telefoneCidadao: string;  // body {{2}}
  resumo: string;           // body {{3}}
};

/**
 * Template "novo_atendimento_agente"
 *
 * Cabeçalho:
 *   Nova solicitação - {{1}}     -> nome do setor
 *
 * Corpo:
 *   Munícipe: *{{1}}*            -> nome do cidadão
 *   Telefone: {{2}}              -> número do cidadão
 *   Resumo: {{3}}                -> primeira mensagem / resumo
 *
 *   Digite:
 *   1 - ...
 *   2 - ...
 */
export async function sendNovoAtendimentoTemplateToAgent(
  params: NovoAtendimentoTemplateParams
) {
  if (!isWhatsConfigured()) return;

  const { to, departamentoNome, cidadaoNome, telefoneCidadao, resumo } =
    params;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "novo_atendimento_agente", // nome EXATO do template na Meta
      language: { code: "pt_BR" },
      components: [
        // Cabeçalho: "Nova solicitação - {{1}}"
        {
          type: "header",
          parameters: [
            {
              type: "text",
              text: departamentoNome || "-", // {{1}} do header
            },
          ],
        },
        // Corpo:
        // Munícipe: *{{1}}*
        // Telefone: {{2}}
        // Resumo: {{3}}
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: cidadaoNome || "Cidadão", // {{1}} do body
            },
            {
              type: "text",
              text: telefoneCidadao || "-", // {{2}} do body
            },
            {
              type: "text",
              text: resumo || "-", // {{3}} do body
            },
          ],
        },
      ],
    },
  };

  try {
    console.log(
      "[WHATSAPP_TEMPLATE novo_atendimento_agente] Enviando template para",
      to,
      "payload=",
      JSON.stringify(payload)
    );

    const res = await axios.post(baseURL, payload, {
      headers: getAuthHeaders(),
    });

    console.log(
      "[WHATSAPP_TEMPLATE novo_atendimento_agente] Enviado com sucesso:",
      res.data
    );
  } catch (err: any) {
    console.error(
      "[WHATSAPP_TEMPLATE novo_atendimento_agente] Erro ao enviar template:",
      err?.response?.data || err.message
    );

    // Fallback: tenta mandar mensagem de texto simples se o template falhar
    try {
      await sendTextMessage(
        to,
        `📲 *Nova solicitação - ${departamentoNome}*\n\n` +
          `Munícipe: *${cidadaoNome || "Cidadão"}*\n` +
          `Telefone: ${telefoneCidadao}\n` +
          `Resumo: ${resumo || "-"}\n\n` +
          `Digite:\n` +
          `1 - Atender agora\n` +
          `2 - Informar que está ocupado`
      );
      console.log(
        "[WHATSAPP_TEMPLATE novo_atendimento_agente] Fallback de texto enviado com sucesso."
      );
    } catch (fallbackErr: any) {
      console.error(
        "[WHATSAPP_TEMPLATE novo_atendimento_agente] Falha também no fallback de texto:",
        fallbackErr?.response?.data || fallbackErr.message
      );
    }
  }
}
