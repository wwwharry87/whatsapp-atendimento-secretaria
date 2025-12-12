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
 * - DEEPSEEK_API_KEY configurada
 */
export function iaEstaHabilitada(): boolean {
  return Boolean(env.IA_HABILITADA && env.DEEPSEEK_API_KEY);
}

function montarSystemPrompt(channel: IAChannel): string {
  if (channel === "whatsapp_agente") {
    return (
      "Você é um assistente para agentes de atendimento público. " +
      "Ajude de forma objetiva e profissional, com linguagem clara, respeitosa e sem inventar informações. " +
      "Se faltar dados, peça o mínimo necessário."
    );
  }

  if (channel === "painel") {
    return (
      "Você é um assistente para um painel administrativo de atendimento público. " +
      "Responda com clareza, foco em processo e dados. Evite respostas longas e vagas."
    );
  }

  // whatsapp_cidadao
  return (
    "Você é um assistente virtual de atendimento público via WhatsApp. " +
    "Fale em português do Brasil, de forma humana, cordial e direta. " +
    "Não mencione políticas internas, não diga que é 'IA' a não ser que o usuário pergunte. " +
    "Não invente informações. Se não souber, oriente o usuário sobre o que informar ou para qual setor direcionar."
  );
}

function getTemperature(channel: IAChannel): number {
  if (channel === "whatsapp_agente") return 0.2;
  if (channel === "painel") return 0.2;
  return 0.5;
}

async function deepSeekChat(params: {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const { system, user, temperature, maxTokens } = params;

  const response = await axios.post(
    env.DEEPSEEK_API_URL,
    {
      model: env.DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      max_tokens: maxTokens,
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
  return content;
}

export async function gerarRespostaIA(
  mensagemUsuario: string,
  channel: IAChannel = "whatsapp_cidadao",
  contextoOpcional?: string
): Promise<IAResposta> {
  if (!iaEstaHabilitada()) {
    return { sucesso: false, erro: "IA desabilitada ou faltando API key." };
  }

  try {
    const systemPrompt = montarSystemPrompt(channel);

    let finalUserContent = mensagemUsuario;
    if (contextoOpcional) {
      finalUserContent =
        "Contexto adicional (NÃO mostre isso literalmente ao usuário, apenas use como referência interna):\n" +
        contextoOpcional +
        "\n\nMensagem do usuário:\n" +
        mensagemUsuario;
    }

    const temperature = getTemperature(channel);

    const content = await deepSeekChat({
      system: systemPrompt,
      user: finalUserContent,
      temperature,
      maxTokens: 500,
    });

    if (!content) {
      return { sucesso: false, erro: "Não foi possível obter resposta da IA." };
    }

    return { sucesso: true, resposta: content };
  } catch (error: any) {
    console.error("[IA] Erro ao chamar DeepSeek:", error?.response?.data || error);
    return { sucesso: false, erro: "Erro ao chamar DeepSeek." };
  }
}

// ====================== CLASSIFICAÇÃO DE SETOR ======================

export type IAConfiancaRoteamento = "ALTA" | "MEDIA" | "BAIXA";

export type IARoteamentoDepartamento = {
  /** índice do menu (1..N). null se não for possível decidir. */
  indice: number | null;
  confianca: IAConfiancaRoteamento;
  /** explicação curta para logs (não enviar ao cidadão) */
  motivo?: string;
};

export type DepartamentoResumo = {
  id: number;
  nome: string;
  descricao?: string | null;
};

function safeJsonExtract(text: string): any | null {
  if (!text) return null;

  // remove possíveis fences ```json ... ```
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  // tenta pegar o primeiro objeto JSON do texto
  const match = cleaned.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : cleaned;

  try {
    return JSON.parse(candidate);
  } catch {
    // fallback: tentar consertar aspas simples comuns
    try {
      const normalized = candidate
        .replace(/\bTrue\b/g, "true")
        .replace(/\bFalse\b/g, "false")
        .replace(/\bNone\b/g, "null")
        .replace(/'/g, '"');
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }
}

/**
 * Usa IA para escolher o melhor setor (por índice do menu 1..N),
 * usando a lista dinâmica de departamentos do cliente.
 */
export async function classificarDepartamentoPorIntencaoIA(params: {
  mensagemUsuario: string;
  departamentos: DepartamentoResumo[];
}): Promise<IARoteamentoDepartamento> {
  const { mensagemUsuario, departamentos } = params;

  if (!iaEstaHabilitada()) {
    return { indice: null, confianca: "BAIXA", motivo: "IA desabilitada" };
  }

  const lista = departamentos
    .map((d, idx) => {
      const nome = String(d.nome || "").trim();
      const desc = String(d.descricao || "").trim();
      const extra = desc ? ` — ${desc}` : "";
      return `${idx + 1} - ${nome}${extra}`;
    })
    .join("\n");

  const system =
    "Você é um classificador de intenção para roteamento de atendimento público. " +
    "Sua tarefa é escolher o MELHOR setor com base na mensagem do cidadão e na lista de setores disponíveis. " +
    "Responda SOMENTE com JSON puro, sem texto extra, sem markdown.";

  const user =
    "Mensagem do cidadão:\n" +
    mensagemUsuario +
    "\n\nSetores disponíveis (índice do menu):\n" +
    lista +
    "\n\nResponda JSON no formato exato:\n" +
    '{ "indice": number|null, "confianca": "ALTA"|"MEDIA"|"BAIXA", "motivo": string }\n' +
    "Regras:\n" +
    "- Use confianca ALTA quando a correspondência for clara.\n" +
    "- Use MEDIA quando houver dúvida entre 2 setores.\n" +
    "- Use BAIXA quando não for possível decidir.\n" +
    "- Se BAIXA, coloque indice = null.\n";

  try {
    const content = await deepSeekChat({
      system,
      user,
      temperature: 0.1,
      maxTokens: 200,
    });

    const parsed = safeJsonExtract(content);
    const indiceRaw = parsed?.indice;
    const confiancaRaw = String(parsed?.confianca || "").toUpperCase();
    const motivo = typeof parsed?.motivo === "string" ? parsed.motivo : undefined;

    const confianca: IAConfiancaRoteamento =
      confiancaRaw === "ALTA" || confiancaRaw === "MEDIA" || confiancaRaw === "BAIXA"
        ? (confiancaRaw as IAConfiancaRoteamento)
        : "BAIXA";

    let indice: number | null = null;
    if (typeof indiceRaw === "number" && Number.isFinite(indiceRaw)) {
      indice = Math.trunc(indiceRaw);
    }

    if (indice !== null) {
      if (indice <= 0 || indice > departamentos.length) {
        indice = null;
      }
    }

    if (confianca === "BAIXA") {
      return { indice: null, confianca, motivo: motivo || "Sem decisão confiável" };
    }

    if (indice === null) {
      return { indice: null, confianca: "BAIXA", motivo: motivo || "Índice inválido" };
    }

    return { indice, confianca, motivo };
  } catch (error: any) {
    console.error(
      "[IA] Erro ao classificar departamento:",
      error?.response?.data || error
    );
    return { indice: null, confianca: "BAIXA", motivo: "Erro ao chamar IA" };
  }
}
