// src/services/whatsappService.ts
import axios from "axios";
import { env } from "../config/env";
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";

type WhatsappClientConfig = {
  phoneNumberId: string;
  accessToken: string;
  idcliente: number;
  nomeCliente?: string;
};

type PostOpts = {
  idcliente?: number;
};

/**
 * Carrega a configuração do WhatsApp a partir da tabela `clientes`.
 *
 * - Se receber idcliente, busca EXATAMENTE esse cliente.
 *   (sem fallback para outro cliente, pra não vazar número)
 * - Se não receber idcliente, cai no comportamento antigo:
 *   primeiro cliente ativo, ou primeiro cliente da tabela.
 */
async function loadWhatsappConfigFromDb(
  idcliente?: number
): Promise<WhatsappClientConfig | null> {
  const repo = AppDataSource.getRepository(Cliente);
  let cliente: Cliente | null = null;

  if (idcliente) {
    try {
      cliente = await repo.findOne({
        where: { id: idcliente as any },
      });
    } catch (err) {
      console.error(
        `[WHATSAPP_CONFIG] Erro ao buscar cliente id=${idcliente}:`,
        err
      );
    }

    if (!cliente) {
      console.error(
        `[WHATSAPP_CONFIG] Cliente com id=${idcliente} não encontrado ao carregar config do WhatsApp.`
      );
      return null;
    }
  } else {
    // Comportamento "global" legado: pega primeiro cliente ativo,
    // senão o primeiro da tabela
    try {
      cliente = await repo.findOne({
        where: { ativo: true as any },
        order: { id: "ASC" as any },
      });
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar cliente ativo na tabela 'clientes':",
        err
      );
    }

    if (!cliente) {
      try {
        cliente = await repo.findOne({
          order: { id: "ASC" as any },
        });
      } catch (err) {
        console.error(
          "[WHATSAPP_CONFIG] Erro ao buscar primeiro cliente na tabela 'clientes':",
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
    phoneNumberId,
    accessToken,
    idcliente: cliente.id,
    nomeCliente: cliente.nome,
  };
}

/**
 * Faz o POST para a API do WhatsApp usando:
 *  - apiVersion do env
 *  - phoneNumberId / accessToken do cliente certo
 */
async function postToWhatsapp(payload: any, opts?: PostOpts) {
  const cfg = await loadWhatsappConfigFromDb(opts?.idcliente);
  if (!cfg) {
    console.error(
      "[WHATSAPP] Não foi possível obter configuração do WhatsApp para envio.",
      { idcliente: opts?.idcliente }
    );
    return null;
  }

  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${cfg.phoneNumberId}/messages`;

  console.log("[WHATSAPP] Enviando via cliente:", {
    idcliente: cfg.idcliente,
    nome: cfg.nomeCliente,
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

type SendOpts = {
  idcliente?: number;
};

export async function sendTextMessage(
  to: string,
  body: string,
  opts?: SendOpts
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
      "opts=",
      opts
    );

    const res = await postToWhatsapp(payload, opts);

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
  opts?: SendOpts
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
      "opts=",
      opts
    );

    const res = await postToWhatsapp(payload, opts);

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
  opts?: SendOpts
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
      "opts=",
      opts
    );

    const res = await postToWhatsapp(payload, opts);

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
  opts?: SendOpts
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
      "opts=",
      opts
    );

    const res = await postToWhatsapp(payload, opts);

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
  opts?: SendOpts
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
      "opts=",
      opts
    );

    const res = await postToWhatsapp(payload, opts);

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
