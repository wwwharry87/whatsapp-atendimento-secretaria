// src/services/iaService.ts
import axios from "axios";
import { env } from "../config/env";

export type IAChannel = "whatsapp_cidadao" | "whatsapp_agente" | "painel";

export interface IAResposta {
  sucesso: boolean;
  resposta?: string;
  erro?: string;
}

/**
 * Verifica se a IA está habilitada via variável de ambiente
 */
export function iaEstaHabilitada(): boolean {
  return !!env.IA_HABILITADA && !!env.DEEPSEEK_API_KEY;
}

/**
 * Gera um prompt de sistema com base no canal de atendimento
 */
function montarSystemPrompt(channel: IAChannel): string {
  if (channel === "whatsapp_cidadao") {
    return `
Você é um assistente virtual chamado "Atende Cidadão", que ajuda cidadãos a falar com a prefeitura
via WhatsApp. Responda de forma educada, simples e em português do Brasil.

Objetivos:
- Tirar dúvidas gerais sobre serviços públicos (educação, saúde, transporte, etc.).
- Explicar, quando fizer sentido, que é possível falar com um atendente humano.
- Se a pergunta for algo que claramente depende de regras do município (ex: prazos específicos, leis locais, 
  situações muito específicas), responda de forma genérica e sugira falar com um atendente humano.

Nunca peça dados sensíveis (como senha, número completo de cartão, etc.).
    `.trim();
  }

  if (channel === "whatsapp_agente") {
    return `
Você é um assistente que ajuda atendentes humanos da prefeitura a responder cidadãos pelo WhatsApp.
Responda de forma objetiva, e se a pergunta for muito genérica, sugira que o atendente peça mais detalhes
para o cidadão. Sempre responda em português do Brasil.
    `.trim();
  }

  // painel ou outros usos internos
  return `
Você é um assistente interno que ajuda gestores da prefeitura a analisar atendimentos realizados pelo WhatsApp.
Responda de forma clara, com foco em resumo e insights. Sempre responda em português do Brasil.
  `.trim();
}

/**
 * Faz a chamada à API do DeepSeek e retorna o texto gerado.
 */
export async function gerarRespostaIA(
  mensagemUsuario: string,
  channel: IAChannel = "whatsapp_cidadao",
  contextoOpcional?: string
): Promise<IAResposta> {
  if (!iaEstaHabilitada()) {
    return {
      sucesso: false,
      erro: "IA desabilitada ou faltando API key.",
    };
  }

  try {
    const systemPrompt = montarSystemPrompt(channel);

    let finalUserContent = mensagemUsuario;
    if (contextoOpcional) {
      finalUserContent =
        `Contexto adicional (NÃO mostre isso literalmente ao usuário, apenas use como referência):\n` +
        contextoOpcional +
        `\n\nMensagem do usuário:\n` +
        mensagemUsuario;
    }

    const response = await axios.post(
      env.DEEPSEEK_API_URL,
      {
        model: env.DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: finalUserContent,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    const data = response.data;
    const choice = data?.choices?.[0];
    const content = choice?.message?.content?.trim?.() ?? "";

    if (!content) {
      return {
        sucesso: false,
        erro: "Não foi possível obter resposta da IA.",
      };
    }

    return {
      sucesso: true,
      resposta: content,
    };
  } catch (error: any) {
    console.error("[IA] Erro ao chamar DeepSeek:", error?.response?.data || error);
    return {
      sucesso: false,
      erro: "Erro ao chamar DeepSeek.",
    };
  }
}
