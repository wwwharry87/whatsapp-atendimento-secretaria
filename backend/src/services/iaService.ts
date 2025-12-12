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
 * Verifica se a IA está habilitada via variável de ambiente.
 * Para funcionar, precisa:
 * - IA_HABILITADA = "true"
 * - DEEPSEEK_API_KEY preenchida
 */
export function iaEstaHabilitada(): boolean {
  return !!env.IA_HABILITADA && !!env.DEEPSEEK_API_KEY;
}

/**
 * Define a temperatura de geração conforme o canal.
 *
 * - whatsapp_cidadao: mais humano (0.6)
 * - whatsapp_agente: mais objetivo (0.4)
 * - painel: bem analítico (0.3)
 *
 * Se quiser controlar via env depois:
 *   IA_TEMPERATURE_DEFAULT, IA_TEMPERATURE_CIDADAO, etc.
 */
function getTemperature(channel: IAChannel): number {
  // Se no futuro quiser puxar de env, é só trocar aqui.
  switch (channel) {
    case "whatsapp_cidadao":
      return 0.6;
    case "whatsapp_agente":
      return 0.4;
    case "painel":
    default:
      return 0.3;
  }
}

/**
 * Gera um prompt de sistema com base no canal de atendimento.
 *
 * Observação importante:
 * - O nome do órgão / cliente / secretaria / município pode ser enviado
 *   no "contextoOpcional" da função gerarRespostaIA.
 * - A IA deve usar exatamente esses nomes vindos do contexto,
 *   sem inventar outros.
 */
function montarSystemPrompt(channel: IAChannel): string {
  if (channel === "whatsapp_cidadao") {
    return `
Você é um assistente virtual chamado "Atende Cidadão", que ajuda cidadãos a falar com órgãos públicos
(por exemplo, prefeituras, secretarias municipais, escolas, etc.) via WhatsApp.

Regras gerais:
- Responda sempre em português do Brasil, de forma simples, educada e direta.
- Use um tom humano, cordial e próximo, mas sem exagerar em emojis ou formalidade.
- Quando o contexto informar o NOME DO ÓRGÃO (ex.: "Secretaria Municipal de Educação de Tucuruí"),
  use esse nome exatamente como foi fornecido, sem inventar outro.
- Não invente o nome de município, secretaria ou programa: se não vier no contexto, fale de forma genérica
  (por exemplo: "a secretaria responsável", "o setor responsável").

Objetivos principais:
- Tirar dúvidas gerais sobre serviços públicos (educação, saúde, transporte, assistência social, etc.), sempre em linhas gerais.
- Quando a dúvida depender claramente de regras locais do município ou do órgão
  (ex.: prazos específicos, documentos exatos, leis locais, regras de programas municipais),
  responda de forma genérica e recomende que o cidadão confirme com o setor responsável.
- Explique, quando fizer sentido, que é possível falar com um atendente humano, mas NÃO prometa prazos ou resultados específicos.

Muito importante sobre VERACIDADE:
- Se você NÃO tiver certeza sobre algo, NÃO invente regra, prazo ou lei.
- Em vez disso, deixe claro que "isso pode variar conforme o município ou o órgão" e recomende confirmar com a equipe responsável.
- Não afirme nada como se fosse regra absoluta se for apenas uma suposição.

Segurança:
- Nunca peça dados sensíveis como senha, código de segurança, dados completos de cartão, fotos de documentos sigilosos, etc.
- Se o cidadão enviar dados sensíveis, oriente com cuidado e evite repetir essas informações na resposta.

Estilo de resposta:
- Priorize respostas curtas, em até 2 ou 3 parágrafos objetivos.
- Evite listas enormes de exemplos; quando precisar de exemplo, cite no máximo 1 ou 2 casos.
- Use o nome do cidadão (se vier no contexto ou na mensagem) com moderação, no máximo 1 vez na abertura.
    `.trim();
  }

  if (channel === "whatsapp_agente") {
    return `
Você é um assistente que ajuda atendentes humanos de órgãos públicos a responderem cidadãos pelo WhatsApp.

Contexto:
- O atendente humano é quem vai usar a sua resposta como base para falar com o cidadão.
- A resposta deve ser um rascunho inteligente para o servidor público, e não um texto cheio de floreios.

Regras:
- Responda sempre em português do Brasil.
- Seja objetivo, claro e profissional.
- Se a pergunta do cidadão for muito genérica ou faltar informação importante,
  sugira explicitamente que o atendente peça mais detalhes ao cidadão antes de decidir algo.
- Se a dúvida depender de regras locais (lei municipal, prazos específicos, regulamentos internos),
  deixe claro que isso deve ser confirmado nas normas do órgão ou com a chefia/responsável.

Estilo:
- Você pode sugerir 1 ou 2 formas de frase para o atendente enviar ao cidadão.
- Evite textos longos; foque em orientação prática e segura.
    `.trim();
  }

  // painel ou outros usos internos
  return `
Você é um assistente interno que ajuda gestores e equipes de órgãos públicos
a analisarem atendimentos realizados pelo WhatsApp (sistema Atende Cidadão).

Regras:
- Responda sempre em português do Brasil.
- Seja claro, direto e focado em resumo, análise e insights práticos.
- Quando fizer inferências (ex.: possíveis causas de problema, pontos de melhoria),
  deixe claro que se trata de uma análise e não de um fato comprovado.

Estilo:
- Prefira listas curtas, tópicos e resumos executivos.
- Se fizer recomendações, deixe claro quais são prioridade alta, média ou baixa, quando fizer sentido.
  `.trim();
}

/**
 * Faz a chamada à API do DeepSeek e retorna o texto gerado.
 *
 * @param mensagemUsuario Texto principal vindo do usuário (ou do sistema chamador)
 * @param channel Canal de atendimento (whatsapp_cidadao, whatsapp_agente, painel)
 * @param contextoOpcional Texto adicional com contexto (cliente, órgão, setor, regras, etc.)
 *
 * Observação:
 * - O contextoOpcional é enviado junto na mensagem do "user" com uma marcação
 *   ("Contexto adicional... Mensagem do usuário...") para a IA usar como referência,
 *   mas sem repetir literalmente na resposta.
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
        `Contexto adicional (NÃO mostre isso literalmente ao usuário, apenas use como referência interna):\n` +
        contextoOpcional +
        `\n\nMensagem do usuário:\n` +
        mensagemUsuario;
    }

    const temperature = getTemperature(channel);

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
        temperature,
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
    console.error(
      "[IA] Erro ao chamar DeepSeek:",
      error?.response?.data || error
    );
    return {
      sucesso: false,
      erro: "Erro ao chamar DeepSeek.",
    };
  }
}
