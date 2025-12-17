// src/services/aiFlowService.ts
import axios, { AxiosError } from "axios";
import { env } from "../config/env";
import { getSaudacaoPorHorario } from "./horarioService";

export type OfflineState =
  | "LEAVE_MESSAGE"
  | "OFFLINE_POST_AGENT_RESPONSE"
  | "OFFLINE_RATING"
  | "WAITING_AGENT"
  | "CLOSED";

export interface OfflineFlowContext {
  state: string;
  atendimentoStatus: string | null;
  protocolo: string | null;
  cidadaoNome: string | null;
  cidadaoNumero: string;
  canalNome: string | null;
  leaveMessageAckSent: boolean;
  lastMessages?: Array<{ sender: string; text: string }>;
}

export interface OfflineFlowDecision {
  replyText: string;
  nextState: OfflineState | string;
  shouldSaveRating: boolean;
  rating?: number;
  shouldCloseAttendance: boolean;
}

// ====================== PARSERS (DETERMINÍSTICOS) ======================

function norm(s: string) {
  return (s || "").trim().toLowerCase();
}

function isGreeting(t: string) {
  const s = norm(t);
  return (
    s === "oi" ||
    s === "ola" ||
    s === "olá" ||
    s === "bom dia" ||
    s === "boa tarde" ||
    s === "boa noite" ||
    s.startsWith("bom dia") ||
    s.startsWith("boa tarde") ||
    s.startsWith("boa noite") ||
    s.startsWith("eai") ||
    s.startsWith("e aí") ||
    s.startsWith("eai,") ||
    s.startsWith("e aí,")
  );
}

/**
 * ✅ Corrigido: checa NEGATIVO antes do POSITIVO para não confundir "não resolveu".
 */
function parseYesNo(t: string): "YES" | "NO" | null {
  const s = norm(t);

  // 1/2 sempre manda
  if (s === "1") return "YES";
  if (s === "2") return "NO";

  // negativos primeiro
  if (
    /\b(n[aã]o|nao)\b/.test(s) ||
    s.includes("não resolveu") ||
    s.includes("nao resolveu") ||
    s.includes("não resolvido") ||
    s.includes("nao resolvido") ||
    s.includes("ainda não") ||
    s.includes("ainda nao")
  ) {
    return "NO";
  }

  // positivos
  if (/\b(sim|s|resolveu|resolvido|resolvida|foi resolvido|foi resolvida)\b/.test(s)) {
    return "YES";
  }

  return null;
}

function parseRating1to5(t: string): number | null {
  const s = norm(t).replace(/[^\d]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return null;
}

function isFinishedSignal(t: string) {
  const s = norm(t);
  return (
    s === "ok" ||
    s === "ok!" ||
    s === "ok." ||
    s === "obrigado" ||
    s === "obrigada" ||
    s === "valeu" ||
    s === "era isso" ||
    s === "é isso" ||
    s === "so isso" ||
    s === "só isso" ||
    s.includes("pode encerrar") ||
    s.includes("pode fechar") ||
    s.includes("encerrar")
  );
}

function firstName(name?: string | null) {
  const n = (name || "").trim();
  if (!n) return "";
  return n.split(/\s+/)[0] || "";
}

function defaultLeaveMessageReply(protocolo?: string | null) {
  if (protocolo) {
    return `✅ Recado registrado no protocolo *${protocolo}*.\n\nSe quiser, envie mais detalhes (texto/áudio/foto). Se já terminou, pode dizer “ok”.`;
  }
  return `✅ Recado registrado.\n\nSe quiser, envie mais detalhes (texto/áudio/foto). Se já terminou, pode dizer “ok”.`;
}

function defaultWaitingAgentReply(protocolo?: string | null) {
  if (protocolo) {
    return `📌 Seu protocolo *${protocolo}* está registrado e aguardando análise da equipe.\n\nSe tiver informação importante nova, pode enviar por aqui que eu adiciono ao registro.`;
  }
  return `📌 Sua solicitação está registrada e aguardando análise da equipe.\n\nSe tiver informação importante nova, pode enviar por aqui que eu adiciono ao registro.`;
}

// ====================== HUMANIZE (DEEPSEEK) ======================

function isIaOn() {
  return Boolean(env.IA_HABILITADA && env.DEEPSEEK_API_KEY);
}

function stripCodeFences(text: string) {
  return (text || "")
    .replace(/^```(?:json|text)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function sanitizeWhatsApp(text: string, maxChars = 900) {
  let t = (text || "").trim();
  if (!t) return t;

  t = t.replace(/```[\s\S]*?```/g, "").trim();
  t = t.replace(/\n{4,}/g, "\n\n").trim();

  if (t.length > maxChars) t = t.slice(0, maxChars - 1).trim() + "…";
  return t;
}

function isRetryableStatus(status?: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status != null && status >= 500);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function humanizeWithDeepseek(opts: {
  baseText: string;
  context: OfflineFlowContext;
  citizenText: string;
}): Promise<string> {
  if (!isIaOn()) return opts.baseText;

  const payload = {
    model: env.DEEPSEEK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Você reescreve mensagens para atendimento público via WhatsApp.\n" +
          "Regras:\n" +
          "- Seja educado, direto e humano.\n" +
          "- NÃO invente informações.\n" +
          "- NÃO mude o sentido.\n" +
          "- NÃO crie perguntas extras.\n" +
          "- Responda curto (até ~6 linhas) e use no máximo 1 emoji.\n" +
          "Retorne APENAS o texto final.",
      },
      {
        role: "user",
        content: JSON.stringify({
          baseText: opts.baseText,
          protocolo: opts.context.protocolo,
          cidadaoNome: opts.context.cidadaoNome,
          citizenText: opts.citizenText,
          estado: opts.context.state,
        }),
      },
    ],
    temperature: 0.2,
    max_tokens: 220,
  };

  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.post(env.DEEPSEEK_API_URL, payload, {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 9000,
      });

      const content = response.data?.choices?.[0]?.message?.content?.trim?.() || "";
      const cleaned = sanitizeWhatsApp(stripCodeFences(content), 900);
      return cleaned || opts.baseText;
    } catch (err: any) {
      const e = err as AxiosError<any>;
      const status = e?.response?.status;
      const retry = isRetryableStatus(status) || e.code === "ECONNABORTED";
      console.error(`[AI_FLOW] DeepSeek humanize error attempt=${attempt} status=${status}`, e?.response?.data || e?.message || e);

      if (!retry || attempt === maxAttempts) return opts.baseText;

      const backoff = 500 * attempt + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }
  }

  return opts.baseText;
}

// ====================== ENGINE (DETERMINÍSTICO) ======================

export async function callOfflineFlowEngine(
  context: OfflineFlowContext,
  citizenText: string
): Promise<OfflineFlowDecision> {
  const state = (context.state || context.atendimentoStatus || "LEAVE_MESSAGE") as OfflineState;
  const text = citizenText || "";
  const sauda = getSaudacaoPorHorario();
  const nome = firstName(context.cidadaoNome);

  // 0) Se já estiver CLOSED, trava e orienta como reabrir
  if (state === "CLOSED") {
    const reply = `${sauda}${nome ? `, ${nome}` : ""}! ✅\nEsse atendimento já foi encerrado.\nSe quiser abrir um novo, envie “oi” e me diga o setor.`;
    return {
      replyText: reply,
      nextState: "CLOSED",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 1) Pós-atendimento: “foi resolvido?”
  if (state === "OFFLINE_POST_AGENT_RESPONSE") {
    const yn = parseYesNo(text);

    if (yn === "YES") {
      return {
        replyText: `${sauda}${nome ? `, ${nome}` : ""}! 🙂\nQue bom!\nAgora avalie o atendimento com uma nota de *1 a 5* (5 = excelente).`,
        nextState: "OFFLINE_RATING",
        shouldSaveRating: false,
        shouldCloseAttendance: false,
      };
    }

    if (yn === "NO") {
      return {
        replyText:
          `${sauda}${nome ? `, ${nome}` : ""}.\nEntendi. Me diga em poucas palavras o que ficou pendente (ou envie áudio/foto) e eu vou registrar para a equipe.`,
        nextState: "LEAVE_MESSAGE",
        shouldSaveRating: false,
        shouldCloseAttendance: false,
      };
    }

    return {
      replyText: `${sauda}${nome ? `, ${nome}` : ""}! Só para confirmar:\nSua solicitação foi resolvida?\n1 - Sim\n2 - Não`,
      nextState: "OFFLINE_POST_AGENT_RESPONSE",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 2) Avaliação: nota 1..5
  if (state === "OFFLINE_RATING") {
    const rating = parseRating1to5(text);

    if (rating != null) {
      return {
        replyText: `Obrigado! ✅ Sua nota *${rating}* foi registrada.\nSe precisar novamente, é só chamar por aqui.`,
        nextState: "CLOSED",
        shouldSaveRating: true,
        rating,
        shouldCloseAttendance: true,
      };
    }

    return {
      replyText: "Por favor, envie uma *nota de 1 a 5* (ex.: 5).",
      nextState: "OFFLINE_RATING",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 3) Recado finalizado / aguardando equipe
  if (state === "WAITING_AGENT") {
    const base = defaultWaitingAgentReply(context.protocolo);

    const baseText = isGreeting(text)
      ? `📌 Seu protocolo já está registrado e aguardando análise.\nSe tiver algo importante novo, pode enviar por aqui.`
      : base;

    const reply = await humanizeWithDeepseek({ baseText, context, citizenText: text });

    return {
      replyText: reply,
      nextState: "WAITING_AGENT",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 4) LEAVE_MESSAGE:
  // ✅ Se o cidadão sinalizou fim (“ok/obrigado/encerrar”), nós já mudamos para WAITING_AGENT,
  // reduzindo o loop e evitando ficar em "recado infinito".
  if (state === "LEAVE_MESSAGE") {
    if (isFinishedSignal(text)) {
      const baseText = `Perfeito${nome ? `, ${nome}` : ""}! ✅ Já deixei tudo registrado${context.protocolo ? ` no protocolo *${context.protocolo}*` : ""}.\nA equipe vai analisar e retornar assim que possível.`;
      const reply = await humanizeWithDeepseek({ baseText, context, citizenText: text });

      return {
        replyText: reply,
        nextState: "WAITING_AGENT",
        shouldSaveRating: false,
        shouldCloseAttendance: false,
      };
    }

    const baseText = defaultLeaveMessageReply(context.protocolo);
    const reply = await humanizeWithDeepseek({ baseText, context, citizenText: text });

    return {
      replyText: reply,
      nextState: "LEAVE_MESSAGE",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 5) fallback seguro
  return {
    replyText: defaultLeaveMessageReply(context.protocolo),
    nextState: "LEAVE_MESSAGE",
    shouldSaveRating: false,
    shouldCloseAttendance: false,
  };
}
