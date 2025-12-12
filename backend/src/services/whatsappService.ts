// src/services/whatsappService.ts
import axios from "axios";
import { env } from "../config/env";
import {
  getClientByPhoneNumberId,
  getClientById,
  WhatsappClientInfo,
} from "./credentialService";

type SendContext = {
  phoneNumberId?: string | null;
  idcliente?: number | null;
};

async function resolveClient(ctx?: SendContext): Promise<WhatsappClientInfo | null> {
  // 1) Se veio o phone_number_id da mensagem WhatsApp, prioriza isso
  if (ctx?.phoneNumberId) {
    const c = await getClientByPhoneNumberId(ctx.phoneNumberId);
    if (c) return c;
  }

  // 2) Se veio idcliente (ex.: painel / recados), tenta por id
  if (ctx?.idcliente) {
    const c = await getClientById(ctx.idcliente);
    if (c) return c;
  }

  // 3) Cai no cliente default (primeiro ativo)
  return getClientByPhoneNumberId(null);
}

async function postToWhatsapp(payload: any, ctx?: SendContext) {
  const client = await resolveClient(ctx);

  if (!client || !client.phoneNumberId || !client.accessToken) {
    console.error("[WHATSAPP] Nenhum cliente válido para envio.", {
      ctx,
      client,
    });
    return null;
  }

  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${client.phoneNumberId}/messages`;

  console.log("[WHATSAPP] Enviando via cliente:", {
    idcliente: client.idcliente,
    nome: client.nome,
    url,
  });

  return axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${client.accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ====================== TEXTO / MÍDIA / TEMPLATES ======================

export async function sendTextMessage(
  to: string,
  body: string,
  ctx?: SendContext
) {
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

    console.log(
      "[WHATSAPP][TEXT] Enviando texto para",
      to,
      "body=",
      body,
      "ctx=",
      ctx
    );

    const res = await postToWhatsapp(payload, ctx);

    console.log("[WHATSAPP][TEXT] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (texto):",
      err?.response?.data || err.message
    );
  }
}

export async function sendAudioMessageById(
  to: string,
  mediaId: string,
  ctx?: SendContext
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: {
        id: mediaId,
      },
    };

    console.log("[WHATSAPP][AUDIO] Enviando áudio:", { to, mediaId, ctx });

    const res = await postToWhatsapp(payload, ctx);

    console.log("[WHATSAPP][AUDIO] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (áudio):",
      err?.response?.data || err.message
    );
  }
}

export async function sendImageMessageById(
  to: string,
  mediaId: string,
  ctx?: SendContext
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { id: mediaId },
    };

    console.log("[WHATSAPP][IMAGE] Enviando imagem:", { to, mediaId, ctx });

    const res = await postToWhatsapp(payload, ctx);

    console.log("[WHATSAPP][IMAGE] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (imagem):",
      err?.response?.data || err.message
    );
  }
}

export async function sendVideoMessageById(
  to: string,
  mediaId: string,
  ctx?: SendContext
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: { id: mediaId },
    };

    console.log("[WHATSAPP][VIDEO] Enviando vídeo:", { to, mediaId, ctx });

    const res = await postToWhatsapp(payload, ctx);

    console.log("[WHATSAPP][VIDEO] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (vídeo):",
      err?.response?.data || err.message
    );
  }
}

export async function sendDocumentMessageById(
  to: string,
  mediaId: string,
  ctx?: SendContext
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId },
    };

    console.log("[WHATSAPP][DOC] Enviando documento:", { to, mediaId, ctx });

    const res = await postToWhatsapp(payload, ctx);

    console.log("[WHATSAPP][DOC] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (documento):",
      err?.response?.data || err.message
    );
  }
}

// ========== ENVIO DE TEMPLATES (SAUDAÇÃO, NOVO ATENDIMENTO, MENU COM NOME) ========== //

type SaudacaoTemplateParams = {
  to: string;
  saudacao: string;
  idcliente?: number;
};

export async function sendSaudacaoPedirNomeTemplate(
  params: SaudacaoTemplateParams
) {
  const { to, saudacao, idcliente } = params;

  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "saudacao_pedir_nome",
        language: {
          code: "pt_BR",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: saudacao,
              },
            ],
          },
        ],
      },
    };

    console.log(
      "[WHATSAPP_TEMPLATE saudacao_pedir_nome] Enviando template para",
      to,
      "saudacao=",
      saudacao,
      "idcliente=",
      idcliente
    );

    const res = await postToWhatsapp(payload, { idcliente });

    console.log("[WHATSAPP_TEMPLATE saudacao_pedir_nome] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "[WHATSAPP_TEMPLATE saudacao_pedir_nome] Erro ao enviar template:",
      err?.response?.data || err.message
    );

    // Fallback simples em texto
    try {
      await sendTextMessage(
        to,
        `${saudacao}! 👋 Sou o assistente virtual do atendimento.\n` +
          "Por favor, me informe seu *nome completo* para iniciarmos o atendimento.",
        { idcliente }
      );
      console.log(
        "[WHATSAPP_TEMPLATE saudacao_pedir_nome] Fallback de texto enviado com sucesso."
      );
    } catch (fallbackErr: any) {
      console.error(
        "[WHATSAPP_TEMPLATE saudacao_pedir_nome] Falha também no fallback de texto:",
        fallbackErr?.response?.data || fallbackErr.message
      );
    }
  }
}

type NovoAtendimentoTemplateParams = {
  to: string;
  citizenName?: string;
  departmentName?: string;
  protocolo?: string;
  idcliente?: number;
};

export async function sendNovoAtendimentoTemplateToAgent(
  params: NovoAtendimentoTemplateParams
) {
  const { to, citizenName, departmentName, protocolo, idcliente } = params;

  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "novo_atendimento",
        language: {
          code: "pt_BR",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: citizenName || "Cidadão",
              },
              {
                type: "text",
                text: departmentName || "Setor",
              },
              {
                type: "text",
                text: protocolo || "-",
              },
            ],
          },
        ],
      },
    };

    console.log(
      "[WHATSAPP_TEMPLATE novo_atendimento] Enviando para agente",
      to,
      "nome=",
      citizenName,
      "setor=",
      departmentName,
      "protocolo=",
      protocolo,
      "idcliente=",
      idcliente
    );

    const res = await postToWhatsapp(payload, { idcliente });

    console.log("[WHATSAPP_TEMPLATE novo_atendimento] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "[WHATSAPP_TEMPLATE novo_atendimento] Erro ao enviar template:",
      err?.response?.data || err.message
    );

    // Fallback em texto simples
    try {
      const nome = citizenName || "Cidadão";
      const setor = departmentName || "Setor";
      const prot = protocolo || "-";

      await sendTextMessage(
        to,
        `📩 Novo atendimento para o setor *${setor}*.\n` +
          `👤 Cidadão: *${nome}*\n` +
          `🔖 Protocolo: *${prot}*`,
        { idcliente }
      );
      console.log(
        "[WHATSAPP_TEMPLATE novo_atendimento] Fallback de texto enviado com sucesso."
      );
    } catch (fallbackErr: any) {
      console.error(
        "[WHATSAPP_TEMPLATE novo_atendimento] Falha também no fallback de texto:",
        fallbackErr?.response?.data || fallbackErr.message
      );
    }
  }
}

type MenuComNomeTemplateParams = {
  to: string;
  citizenName?: string;
  saudacao?: string;
  menuTexto?: string;
  idcliente?: number;
};

export async function sendMenuComNomeTemplate(
  params: MenuComNomeTemplateParams
) {
  const { to, citizenName, saudacao, menuTexto, idcliente } = params;

  try {
    if (!menuTexto) {
      throw new Error(
        "MenuComNomeTemplate chamado sem menuTexto. Mantendo apenas fallback."
      );
    }

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        body:
          `${saudacao || "Olá"}, *${citizenName || "Cidadão"}*! 👋\n` +
          "Bem-vindo(a) ao nosso atendimento.\n\n" +
          `${menuTexto}\n\n` +
          "Responda com o número do setor desejado.",
        preview_url: false,
      },
    };

    console.log(
      "[WHATSAPP_TEMPLATE menu_com_nome] Enviando menu com nome para",
      to,
      "idcliente=",
      idcliente
    );

    const res = await postToWhatsapp(payload, { idcliente });

    console.log("[WHATSAPP_TEMPLATE menu_com_nome] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "[WHATSAPP_TEMPLATE menu_com_nome] Erro ao enviar menu:",
      err?.response?.data || err.message
    );

    // Fallback de texto mais simples
    try {
      await sendTextMessage(
        to,
        `${saudacao || "Olá"}, *${citizenName || "Cidadão"}*! 👋\n` +
          "Já encontrei seu cadastro aqui.\n\n" +
          `${menuTexto}\n\n` +
          "Responda apenas com o número do setor desejado.",
        { idcliente }
      );
      console.log(
        "[WHATSAPP_TEMPLATE menu_com_nome] Fallback de texto enviado com sucesso."
      );
    } catch (fallbackErr: any) {
      console.error(
        "[WHATSAPP_TEMPLATE menu_com_nome] Falha também no fallback de texto:",
        fallbackErr?.response?.data || fallbackErr.message
      );
    }
  }
}
