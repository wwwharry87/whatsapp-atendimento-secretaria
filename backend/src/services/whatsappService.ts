// src/services/whatsappService.ts
import axios from "axios";
import { env } from "../config/env";
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";

type WhatsappClientConfig = {
  phoneNumberId: string;
  accessToken: string;
};

type WhatsappContext = {
  /** id do cliente (tabela clientes.id) - opcional */
  idcliente?: number;
  /**
   * phone_number_id vindo do WhatsApp (Meta),
   * mapeado na coluna `whatsapp_phone_number_id` da tabela `clientes`.
   */
  phoneNumberId?: string;
};

/**
 * Carrega a configuração do WhatsApp a partir da tabela `clientes`.
 *
 * Regras de prioridade:
 *  1) Se `phoneNumberId` vier preenchido → procura cliente com esse whatsapp_phone_number_id.
 *  2) Senão, se `idcliente` vier preenchido → procura esse cliente pelo ID.
 *  3) Senão, pega o primeiro cliente ATIVO (ativo = true).
 *  4) Se ainda assim não achar, pega o primeiro registro da tabela.
 */
async function loadWhatsappConfigFromDb(
  ctx?: WhatsappContext
): Promise<WhatsappClientConfig | null> {
  const repo = AppDataSource.getRepository(Cliente);

  let cliente: Cliente | null = null;

  // 1) Tentativa por phoneNumberId (multi-tenant real, 1 linha por número de WhatsApp)
  if (ctx?.phoneNumberId) {
    const raw = ctx.phoneNumberId.trim();
    if (raw) {
      try {
        cliente = await repo.findOne({
          where: { whatsappPhoneNumberId: raw as any },
        });

        if (!cliente) {
          console.warn(
            "[WHATSAPP_CONFIG] Nenhum cliente encontrado com whatsapp_phone_number_id=",
            raw
          );
        } else {
          console.log(
            "[WHATSAPP_CONFIG] Cliente encontrado por phoneNumberId=",
            raw,
            " -> id=",
            cliente.id,
            "nome=",
            cliente.nome
          );
        }
      } catch (err) {
        console.error(
          "[WHATSAPP_CONFIG] Erro ao buscar cliente por whatsapp_phone_number_id=",
          raw,
          err
        );
      }
    }
  }

  // 2) Tentativa por idcliente, se não achou pelo phoneNumberId
  if (!cliente && ctx?.idcliente) {
    try {
      cliente = await repo.findOne({
        where: { id: ctx.idcliente as any },
      });

      if (!cliente) {
        console.warn(
          "[WHATSAPP_CONFIG] Nenhum cliente encontrado com id=",
          ctx.idcliente
        );
      } else {
        console.log(
          "[WHATSAPP_CONFIG] Cliente encontrado por idcliente=",
          ctx.idcliente,
          " -> nome=",
          cliente.nome
        );
      }
    } catch (err) {
      console.error(
        "[WHATSAPP_CONFIG] Erro ao buscar cliente por id=",
        ctx.idcliente,
        err
      );
    }
  }

  // 3) Se ainda não tem cliente, tenta o primeiro ATIVO
  if (!cliente) {
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
  }

  // 4) Fallback final: primeiro registro da tabela
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
  };
}

/**
 * Faz o POST para a API do WhatsApp já usando:
 *  - apiVersion vinda do env (estático)
 *  - phoneNumberId e accessToken vindos da tabela `clientes`
 *  - pode receber contexto opcional (idcliente, phoneNumberId) pra multi-tenant
 */
async function postToWhatsapp(payload: any, ctx?: WhatsappContext) {
  const cfg = await loadWhatsappConfigFromDb(ctx);
  if (!cfg) {
    // Já logamos o erro dentro do loader; apenas não envia nada
    return null;
  }

  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${cfg.phoneNumberId}/messages`;

  return axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

// ====================== TEXTO / MÍDIA / TEMPLATES ======================

/**
 * Envia mensagem de texto simples.
 * 
 * - Uso atual (global, 1 cliente só):
 *   sendTextMessage(to, body)
 *
 * - Uso multi-tenant:
 *   sendTextMessage(to, body, { idcliente, phoneNumberId })
 */
export async function sendTextMessage(
  to: string,
  body: string,
  ctx?: WhatsappContext
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
      "ctx=",
      ctx,
      "body=",
      body
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

// ========= ENVIO DE MÍDIA POR ID (REUTILIZANDO mediaId DO PRÓPRIO WHATSAPP) ========= //

export async function sendAudioMessageById(
  to: string,
  mediaId: string,
  ctx?: WhatsappContext
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
      "ctx=",
      ctx,
      "mediaId=",
      mediaId
    );

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
  ctx?: WhatsappContext
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
      "ctx=",
      ctx,
      "mediaId=",
      mediaId
    );

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
  ctx?: WhatsappContext
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
      "ctx=",
      ctx,
      "mediaId=",
      mediaId
    );

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
  ctx?: WhatsappContext
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
      "ctx=",
      ctx,
      "mediaId=",
      mediaId
    );

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
} & WhatsappContext;

export async function sendSaudacaoPedirNomeTemplate(
  params: SaudacaoTemplateParams
) {
  const { to, saudacao, idcliente, phoneNumberId } = params;

  try {
    const ctx: WhatsappContext = { idcliente, phoneNumberId };

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
      "ctx=",
      ctx,
      "saudacao=",
      saudacao
    );

    const res = await postToWhatsapp(payload, ctx);

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
          "Por favor, me informe seu *nome completo* para iniciarmos o atendimento."
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
} & WhatsappContext;

export async function sendNovoAtendimentoTemplateToAgent(
  params: NovoAtendimentoTemplateParams
) {
  const {
    to,
    citizenName,
    departmentName,
    protocolo,
    idcliente,
    phoneNumberId,
  } = params;

  try {
    const ctx: WhatsappContext = { idcliente, phoneNumberId };

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
      "ctx=",
      ctx,
      "nome=",
      citizenName,
      "setor=",
      departmentName,
      "protocolo=",
      protocolo
    );

    const res = await postToWhatsapp(payload, ctx);

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
          `🔖 Protocolo: *${prot}*`
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
} & WhatsappContext;

export async function sendMenuComNomeTemplate(
  params: MenuComNomeTemplateParams
) {
  const { to, citizenName, saudacao, menuTexto, idcliente, phoneNumberId } =
    params;

  const ctx: WhatsappContext = { idcliente, phoneNumberId };

  // Aqui, como o conteúdo do menu é bem dinâmico, é possível que
  // seja mais simples manter em texto em vez de template pronto.
  // A estrutura abaixo deixa aberta a possibilidade de futuramente
  // virar um template no WhatsApp Business.

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
      "ctx=",
      ctx
    );

    const res = await postToWhatsapp(payload, ctx);

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
          `${menuTexto || ""}\n\n` +
          "Responda apenas com o número do setor desejado."
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
