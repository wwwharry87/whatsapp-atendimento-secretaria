// src/services/aiFlowService.ts
import axios from "axios";
import { env } from "../config/env";

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
    s.startsWith("bom dia") ||
    s.startsWith("boa tarde") ||
    s.startsWith("boa noite") ||
    s.startsWith("eai") ||
    s.startsWith("e aí")
  );
}

function parseYesNo(t: string): "YES" | "NO" | null {
  const s = norm(t);

  // aceita “1/2” e variações
  if (s === "1" || s === "sim" || s === "s" || s.includes("resol")) return "YES";
  if (s === "2" || s === "nao" || s === "não" || s === "n" || s.includes("nao resolveu") || s.includes("não resolveu"))
    return "NO";

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

function defaultLeaveMessageReply(protocolo?: string | null) {
  if (protocolo) {
    return `✅ Recado registrado no protocolo *${protocolo}*.\n\nSe quiser, envie mais detalhes (texto/áudio/foto). Se já terminou, pode apenas dizer “ok”.`;
  }
  return `✅ Recado registrado.\n\nSe quiser, envie mais detalhes (texto/áudio/foto). Se já terminou, pode apenas dizer “ok”.`;
}

function defaultWaitingAgentReply(protocolo?: string | null) {
  if (protocolo) {
    return `📌 Seu protocolo *${protocolo}* já está registrado e aguardando análise da equipe.\n\nSe tiver informação importante nova, pode enviar por aqui que eu adiciono ao registro.`;
  }
  return `📌 Sua solicitação já está registrada e aguardando análise da equipe.\n\nSe tiver informação importante nova, pode enviar por aqui que eu adiciono ao registro.`;
}

// ====================== DEEPSEEK (SÓ HUMANIZA TEXTO) ======================

async function humanizeWithDeepseek(opts: {
  baseText: string;
  context: OfflineFlowContext;
  citizenText: string;
}): Promise<string> {
  if (!env.IA_HABILITADA) return opts.baseText;
  if (!env.DEEPSEEK_API_KEY) return opts.baseText;

  try {
    const response = await axios.post(
      env.DEEPSEEK_API_URL,
      {
        model: env.DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente de atendimento público via WhatsApp. Reescreva a mensagem base com tom educado, direto e humano. NÃO invente regras, NÃO mude o sentido, NÃO crie perguntas extras. Retorne APENAS o texto final.",
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
      },
      {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 9000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content?.trim();
    if (!content) return opts.baseText;

    // garante que não venha “JSON” ou blocos
    const cleaned = content.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "").trim();
    return cleaned || opts.baseText;
  } catch (err) {
    console.error("[AI_FLOW] DeepSeek humanize error:", err);
    return opts.baseText;
  }
}

// ====================== ENGINE (DETERMINÍSTICO) ======================

export async function callOfflineFlowEngine(
  context: OfflineFlowContext,
  citizenText: string
): Promise<OfflineFlowDecision> {
  const state = (context.state || context.atendimentoStatus || "LEAVE_MESSAGE") as OfflineState;
  const text = citizenText || "";

  // 1) Pós-atendimento: “foi resolvido?”
  if (state === "OFFLINE_POST_AGENT_RESPONSE") {
    const yn = parseYesNo(text);

    if (yn === "YES") {
      return {
        replyText: "Que bom! 😊\nPor favor, avalie o atendimento com uma nota de *1 a 5* (5 = excelente).",
        nextState: "OFFLINE_RATING",
        shouldSaveRating: false,
        shouldCloseAttendance: false,
      };
    }

    if (yn === "NO") {
      return {
        replyText:
          "Entendi. Pode me dizer o que ainda ficou pendente? (descreva em poucas palavras ou envie áudio)\n\nVou registrar como recado para a equipe.",
        nextState: "LEAVE_MESSAGE",
        shouldSaveRating: false,
        shouldCloseAttendance: false,
      };
    }

    return {
      replyText: "Só para confirmar: sua solicitação foi resolvida?\n1 - Sim\n2 - Não",
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

  // 3) Recado já finalizado por timer: aguardando equipe
  if (state === "WAITING_AGENT") {
    const base = defaultWaitingAgentReply(context.protocolo);

    // se for só “oi”, responde mais curto
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

  // 4) Recado em andamento (LEAVE_MESSAGE): confirma e orienta
  // Importante: aqui a regra não fecha por IA; quem fecha é o timer (seu scheduleInactivityTimers)
  if (state === "LEAVE_MESSAGE") {
    const baseText = isFinishedSignal(text)
      ? `Perfeito! ✅ Já deixei tudo registrado${context.protocolo ? ` no protocolo *${context.protocolo}*` : ""}.\nA equipe vai analisar e retornar assim que possível.`
      : defaultLeaveMessageReply(context.protocolo);

    const reply = await humanizeWithDeepseek({ baseText, context, citizenText: text });

    return {
      replyText: reply,
      nextState: "LEAVE_MESSAGE",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  // 5) fallback
  return {
    replyText: defaultLeaveMessageReply(context.protocolo),
    nextState: "LEAVE_MESSAGE",
    shouldSaveRating: false,
    shouldCloseAttendance: false,
  };
}
