// src/services/whatsappService.ts
import axios from "axios";
import { env } from "../config/env";
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";

type WhatsappClientConfig = {
  idcliente: number;
  nome: string;
  phoneNumberId: string;
  accessToken: string;
};

type LoadConfigParams = {
  idcliente?: number;
  phoneNumberId?: string;
};

/**
 * Carrega a configuração do WhatsApp a partir da tabela `clientes`,
 * de forma multi-tenant.
 *
 * Prioridade:
 *  1) phoneNumberId (se informado)
 *  2) idcliente (se informado)
 *  3) primeiro cliente ATIVO (coluna ativo = true)
 *  4) primeiro cliente da tabela
 */
async function loadWhatsappConfigFromDb(
  params?: LoadConfigParams
): Promise<WhatsappClientConfig | null> {
  const repo = AppDataSource.getRepository(Cliente);

  const strictTenant = process.env.WHATSAPP_STRICT_TENANT === "true";
  if (strictTenant && !params?.idcliente && !params?.phoneNumberId) {
    console.error(
      "[WHATSAPP_CONFIG] STRICT mode: idcliente/phoneNumberId não informado. Recusando envio para evitar cruzar municípios."
    );
    return null;
  }


  let cliente: Cliente | null = null;

  // 1) Tenta por phoneNumberId
  if (params?.phoneNumberId) {
    try {
      cliente = await repo.findOne({
        where: { whatsappPhoneNumberId: params.phoneNumberId },
      });
      if (cliente) {
        console.log(
          "[WHATSAPP_CONFIG] Cliente resolvido por phoneNumberId:",
          params.phoneNumberId,
          "-> id=",
          cliente.id,
          "nome=",
          cliente.nome
        );
      }
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar cliente por whatsapp_phone_number_id:",
        err
      );
    }
  }

  // 2) Tenta por idcliente
  if (!cliente && params?.idcliente) {
    try {
      cliente = await repo.findOne({
        where: { id: params.idcliente },
      });
      if (cliente) {
        console.log(
          "[WHATSAPP_CONFIG] Cliente resolvido por idcliente:",
          params.idcliente,
          "-> id=",
          cliente.id,
          "nome=",
          cliente.nome
        );
      }
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar cliente por idcliente:",
        err
      );
    }
  }

  // 3) Primeiro cliente ativo
  if (!cliente) {
    try {
      cliente = await repo.findOne({
        where: { ativo: true as any },
        order: { id: "ASC" as any },
      });
      if (cliente) {
        console.log(
          "[WHATSAPP_CONFIG] Cliente resolvido como primeiro ATIVO: id=",
          cliente.id,
          "nome=",
          cliente.nome
        );
      }
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar primeiro cliente ativo:",
        err
      );
    }
  }

  // 4) Primeiro cliente de qualquer forma
  if (!cliente) {
    try {
      cliente = await repo.findOne({
        order: { id: "ASC" as any },
      });
      if (cliente) {
        console.log(
          "[WHATSAPP_CONFIG] Cliente resolvido como primeiro registro da tabela: id=",
          cliente.id,
          "nome=",
          cliente.nome
        );
      }
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar primeiro cliente na tabela:",
        err
      );
    }
  }

  if (!cliente) {
    console.error(
      "[WHATSAPP_CONFIG] Nenhum registro encontrado na tabela 'clientes'."
    );
    return null;
  }

  const phoneNumberId = (cliente.whatsappPhoneNumberId || "").trim();
  const accessToken = (cliente.whatsappAccessToken || "").trim();

  if (!phoneNumberId || !accessToken) {
    console.error(
      "[WHATSAPP_CONFIG] Cliente encontrado, mas sem whatsapp_phone_number_id ou whatsapp_access_token preenchidos.",
      {
        id: cliente.id,
        nome: cliente.nome,
        whatsappPhoneNumberId: cliente.whatsappPhoneNumberId,
        hasAccessToken: !!cliente.whatsappAccessToken,
      }
    );
    return null;
  }

  return {
    idcliente: cliente.id,
    nome: cliente.nome,
    phoneNumberId,
    accessToken,
  };
}

/**
 * Faz o POST para a API do WhatsApp já usando:
 *  - apiVersion vinda do env (estático)
 *  - phoneNumberId e accessToken vindos da tabela `clientes`
 */
async function postToWhatsapp(payload: any, params?: LoadConfigParams) {
  const cfg = await loadWhatsappConfigFromDb(params);
  if (!cfg) {
    // Já logamos o erro dentro do loader; apenas não envia nada
    return null;
  }

  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${cfg.phoneNumberId}/messages`;

  console.log("[WHATSAPP] Enviando via cliente:", {
    idcliente: cfg.idcliente,
    nome: cfg.nome,
    url,
  });

  return axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ====================== TEXTO / MÍDIA / TEMPLATES ======================

export async function sendTextMessage(
  to: string,
  body: string,
  params?: LoadConfigParams
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
      "params=",
      params
    );

    const res = await postToWhatsapp(payload, params);

    console.log("[WHATSAPP][TEXT] Sucesso:", res?.data);
  } catch (err: any) {
    console.error(
      "Erro ao enviar mensagem WhatsApp (texto):",
      err?.response?.data || err.message
    );
  }
}

// ========= ENVIO DE MÍDIA POR ID (REUTILIZANDO mediaId DO PRÓPRIO WHATSAPP) ========= //

export async function sendAudioMessageById(
  to: string,
  mediaId: string,
  params?: LoadConfigParams
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

    console.log(
      "[WHATSAPP][AUDIO] Enviando áudio para",
      to,
      "mediaId=",
      mediaId,
      "params=",
      params
    );

    const res = await postToWhatsapp(payload, params);

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
  params?: LoadConfigParams
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: {
        id: mediaId,
      },
    };

    console.log(
      "[WHATSAPP][IMAGE] Enviando imagem para",
      to,
      "mediaId=",
      mediaId,
      "params=",
      params
    );

    const res = await postToWhatsapp(payload, params);

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
  params?: LoadConfigParams
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "video",
      video: {
        id: mediaId,
      },
    };

    console.log(
      "[WHATSAPP][VIDEO] Enviando vídeo para",
      to,
      "mediaId=",
      mediaId,
      "params=",
      params
    );

    const res = await postToWhatsapp(payload, params);

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
  params?: LoadConfigParams
) {
  try {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        id: mediaId,
      },
    };

    console.log(
      "[WHATSAPP][DOC] Enviando documento para",
      to,
      "mediaId=",
      mediaId,
      "params=",
      params
    );

    const res = await postToWhatsapp(payload, params);

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
  phoneNumberId?: string;
};

export async function sendSaudacaoPedirNomeTemplate(
  params: SaudacaoTemplateParams
) {
  const { to, saudacao, idcliente, phoneNumberId } = params;

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
      idcliente,
      "phoneNumberId=",
      phoneNumberId
    );

    const res = await postToWhatsapp(payload, { idcliente, phoneNumberId });

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
        { idcliente, phoneNumberId }
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
  phoneNumberId?: string;
};

export async function sendNovoAtendimentoTemplateToAgent(
  params: NovoAtendimentoTemplateParams
) {
  const { to, citizenName, departmentName, protocolo, idcliente, phoneNumberId } =
    params;

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
      idcliente,
      "phoneNumberId=",
      phoneNumberId
    );

    const res = await postToWhatsapp(payload, { idcliente, phoneNumberId });

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
        { idcliente, phoneNumberId }
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
  phoneNumberId?: string;
};

export async function sendMenuComNomeTemplate(
  params: MenuComNomeTemplateParams
) {
  const { to, citizenName, saudacao, menuTexto, idcliente, phoneNumberId } =
    params;

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
      idcliente,
      "phoneNumberId=",
      phoneNumberId
    );

    const res = await postToWhatsapp(payload, { idcliente, phoneNumberId });

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
        { idcliente, phoneNumberId }
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
