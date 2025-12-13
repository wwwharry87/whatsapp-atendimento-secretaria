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

ESTADO ATUAL: LEAVE_MESSAGE (Modo Recado)
O cidadão está enviando mensagens que serão lidas posteriormente pela equipe humana.

Regras para LEAVE_MESSAGE:
1. Se a mensagem do cidadão contiver uma solicitação, denúncia ou pedido (ex: "preciso de material", "falta luz"):
   - Responda confirmando que foi registrado.
   - Use o nome do cidadão se houver.
   - Pergunte se ele deseja acrescentar mais alguma informação ou foto.
   - NÃO pergunte "qual é a sua demanda" se ele JÁ DISSE a demanda.
   - Mantenha nextState = "LEAVE_MESSAGE".

2. Se a mensagem for curta ou vaga (ex: "oi", "bom dia"):
   - Peça para ele descrever detalhadamente o que precisa.
   - Mantenha nextState = "LEAVE_MESSAGE".

3. Se o cidadão disser que terminou (ex: "só isso", "pode encerrar", "obrigado"):
   - Agradeça e informe que o atendimento foi registrado.
   - nextState = "LEAVE_MESSAGE" (O sistema cuidará do encerramento via Timer ou o cidadão espera). 
   - *Nota*: Você não precisa encerrar explicitamente aqui, o timer do sistema fará isso, mas seja cordial.

ESTADO ATUAL: OFFLINE_POST_AGENT_RESPONSE (Pós Atendimento)
O agente encerrou o chamado.
1. Pergunte se foi resolvido (Sim/Não).
   - Se Sim: nextState = "OFFLINE_RATING", replyText = "Que bom! Nota de 1 a 5?"
   - Se Não: replyText = "Entendo. Pode detalhar o que faltou?", nextState = "LEAVE_MESSAGE" (reabre recado).

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