// src/services/aiFlowService.ts
import axios from "axios";

export type OfflineState =
  | "LEAVE_MESSAGE"               
  | "OFFLINE_POST_AGENT_RESPONSE" 
  | "OFFLINE_RATING"              
  | "CLOSED";                     

export interface OfflineFlowContext {
  state: string;
  atendimentoStatus: string | null;
  protocolo: string | null;
  cidadaoNome: string | null;
  cidadaoNumero: string;
  canalNome: string | null;
  leaveMessageAckSent: boolean;
  // NOVO: Histórico recente para a IA ter memória
  lastMessages?: Array<{ sender: string; text: string }>;
}

export interface OfflineFlowDecision {
  replyText: string;
  nextState: OfflineState | string;
  shouldSaveRating: boolean;
  rating?: number;
  shouldCloseAttendance: boolean;
}

const SYSTEM_PROMPT = `
Você é o motor de regras de um atendimento público pelo WhatsApp ("Atende Cidadão").
Sua função é gerar JSON de controle de fluxo e resposta.

Responda SEMPRE JSON válido formato:
{
  "replyText": "string",
  "nextState": "LEAVE_MESSAGE | OFFLINE_POST_AGENT_RESPONSE | OFFLINE_RATING | CLOSED",
  "shouldSaveRating": boolean,
  "rating": number | null,
  "shouldCloseAttendance": boolean
}

CONTEXTO:
Você receberá o texto atual do cidadão e um HISTÓRICO recente de mensagens.
USE O HISTÓRICO para entender se o cidadão JÁ informou o que precisa.

ESTADO ATUAL: LEAVE_MESSAGE (Modo Recado)
O cidadão está enviando mensagens que serão lidas posteriormente pela equipe humana.

Regras para LEAVE_MESSAGE:
1. Analise o HISTÓRICO + Texto Atual.
2. Se o cidadão JÁ detalhou o problema anteriormente (no histórico) e agora só mandou um complemento:
   - Apenas confirme o recebimento.
   - NÃO pergunte novamente "qual é a sua demanda".
   - Diga algo como: "Entendido, adicionei essa informação ao registro."

3. Se é a primeira vez que ele explica o problema (não está no histórico):
   - Confirme que registrou.
   - Pergunte se ele deseja enviar fotos ou mais detalhes.

4. Se o cidadão disser que terminou (ex: "só isso", "pode encerrar", "obrigado"):
   - Agradeça e diga que a equipe analisará.
   - nextState = "LEAVE_MESSAGE". (O sistema encerrará por timer).

ESTADO ATUAL: OFFLINE_POST_AGENT_RESPONSE (Pós Atendimento)
O agente encerrou o chamado.
1. Pergunte se foi resolvido (Sim/Não).
   - Se Sim: nextState = "OFFLINE_RATING", replyText = "Que bom! Nota de 1 a 5?"
   - Se Não: replyText = "Entendo. Pode detalhar o que faltou?", nextState = "LEAVE_MESSAGE".

ESTADO ATUAL: OFFLINE_RATING (Avaliação)
1. Se número 1-5: shouldSaveRating = true, shouldCloseAttendance = true, nextState = "CLOSED".
2. Se texto inválido: pede número novamente.

Tom de voz: Educado, direto, Governo/Prefeitura.
Use Português Brasil.
`;

export async function callOfflineFlowEngine(
  context: OfflineFlowContext,
  citizenText: string
): Promise<OfflineFlowDecision> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return {
      replyText: "Recado registrado. Aguarde retorno.",
      nextState: "LEAVE_MESSAGE",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }

  try {
    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              context,
              citizenText,
            }),
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    let content = response.data?.choices?.[0]?.message?.content?.trim() || "";
    if (content.startsWith("```")) {
      content = content.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(content);
    return {
      replyText: parsed.replyText || "Entendido.",
      nextState: parsed.nextState || context.state,
      shouldSaveRating: !!parsed.shouldSaveRating,
      rating: parsed.rating,
      shouldCloseAttendance: !!parsed.shouldCloseAttendance,
    };
  } catch (err) {
    console.error("[AI_FLOW] Erro:", err);
    return {
      replyText: "Recebido. Se tiver mais detalhes, pode enviar.",
      nextState: context.state as OfflineState,
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }
}