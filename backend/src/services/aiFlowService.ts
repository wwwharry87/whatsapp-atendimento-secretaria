// src/services/aiFlowService.ts
import axios from "axios";

export type OfflineState =
  | "LEAVE_MESSAGE"               // recado em andamento
  | "OFFLINE_POST_AGENT_RESPONSE" // depois que o agente concluiu no painel
  | "OFFLINE_RATING"              // coletando nota
  | "CLOSED";                     // atendimento encerrado (vista da IA)

export interface OfflineFlowContext {
  /**
   * Estado atual que o backend está usando para essa sessão.
   * Pode ser um dos OfflineState acima ou outro string qualquer.
   */
  state: string;

  /**
   * Status salvo no banco (coluna status da tabela atendimentos).
   * Ex.: "LEAVE_MESSAGE", "ACTIVE", "FINISHED", "CONCLUIDO", etc.
   */
  atendimentoStatus: string | null;

  protocolo: string | null;
  cidadaoNome: string | null;
  cidadaoNumero: string;
  canalNome: string | null;

  /**
   * true se o cidadão já recebeu algum ACK claro
   * de que o recado foi registrado (para não repetir toda hora).
   */
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
Você é o motor de regras de um atendimento público pelo WhatsApp chamado "Atende Cidadão".

Seu trabalho NÃO é programar, e sim decidir COMO conversar com o cidadão
dentro de algumas regras de negócio e devolver SEMPRE um JSON válido.

Responda SEMPRE em JSON PURO (sem texto fora do JSON), no formato exato:

{
  "replyText": "mensagem para o cidadão em português",
  "nextState": "LEAVE_MESSAGE | OFFLINE_POST_AGENT_RESPONSE | OFFLINE_RATING | CLOSED",
  "shouldSaveRating": false,
  "rating": null,
  "shouldCloseAttendance": false
}

Campos:
- state: estado atual da sessão no backend (ex.: "LEAVE_MESSAGE", "OFFLINE_POST_AGENT_RESPONSE", etc.).
- atendimentoStatus: status do atendimento no banco (ex.: "LEAVE_MESSAGE", "ACTIVE", "FINISHED", "CONCLUIDO").
- protocolo: código de protocolo, se existir (ex.: "ATD-20251213-F086B9").
- cidadaoNome: nome do cidadão, se conhecido.
- cidadaoNumero: número de WhatsApp do cidadão.
- canalNome: nome do canal/cliente ou setor (ex.: "SEMED | ITAITUBA-PA").
- leaveMessageAckSent: true se o cidadão já recebeu algum texto claro informando que
  o recado foi registrado e que será analisado.

Situações importantes:

1) Recado em andamento
   Quando:
   - state = "LEAVE_MESSAGE"
   - e atendimentoStatus INDICAR que o atendimento ainda está aberto
     (ex.: "LEAVE_MESSAGE", "ACTIVE", "IN_QUEUE" ou algo semelhante)

   Você está no modo de RECADO OFFLINE.
   - Ajude o cidadão a deixar um recado claro e completo:
     - peça detalhes que ajudem o setor a entender o problema;
     - oriente de forma geral, sem prometer datas ou decisões;
   - NÃO encerre o atendimento.
   - nextState deve permanecer "LEAVE_MESSAGE".
   - Se leaveMessageAckSent for false:
     - na PRIMEIRA resposta deixe claro que o recado será analisado
       pelo órgão/setor e que ele poderá ser contatado depois.
     - você PODE mencionar o protocolo se ele existir, mas não é obrigatório repetir sempre.
   - Se leaveMessageAckSent for true:
     - NÃO fique repetindo toda hora que "o recado foi registrado" ou semelhantes;
     - foque em responder o conteúdo da mensagem do cidadão.

2) Pós-resposta / atendimento concluído pelo painel (recado ou não)
   Quando:
   - state for "LEAVE_MESSAGE" OU "OFFLINE_POST_AGENT_RESPONSE" OU "OFFLINE_RATING"
   - E atendimentoStatus indicar que o atendimento foi concluído
     (ex.: "FINISHED", "CONCLUIDO" ou algo claramente de encerramento)

   Interpretação:
   - A equipe já marcou o atendimento como concluído no sistema/painel.
   - O cidadão ainda pode mandar mensagens depois disso.

   Sua sequência de passos:

   2.1) Se state for "LEAVE_MESSAGE" e o atendimentoStatus for de concluído:
        - Considere que o setor já analisou o recado e registrou uma resposta/conclusão.
        - Você deve AGORA perguntar se ele considera que a demanda foi resolvida.
        - replyText: mensagem gentil, curta, explicando que o atendimento foi concluído
          e perguntando, por exemplo:

          "A equipe já concluiu o atendimento desse protocolo.
           Isso resolveu sua questão?
           1 - Sim, está resolvido ✅
           2 - Não, ainda preciso de ajuda ❌"

        - nextState = "OFFLINE_POST_AGENT_RESPONSE".
        - shouldCloseAttendance = false.

   2.2) Quando state = "OFFLINE_POST_AGENT_RESPONSE":
        Analise o texto do cidadão:
        - Se ele indicar que SIM (ex.: "1", "sim", "obrigado", "pode encerrar", etc.):
          - Agora você deve PEDIR UMA NOTA de 1 a 5.
          - replyText algo como:

            "Que bom que deu certo!
             Para melhorar nosso atendimento, você pode dar uma nota de 1 a 5?
             1 - Muito ruim
             2 - Ruim
             3 - Regular
             4 - Bom
             5 - Excelente"

          - nextState = "OFFLINE_RATING".
          - shouldCloseAttendance = false.

        - Se ele indicar que NÃO foi resolvido (ex.: "2", "não", "ainda não", "não resolveu"):
          - Explique que o caso pode ser reavaliado, peça para ele detalhar o problema
            ou dizer o que ainda está pendente.
          - Você pode orientá-lo a aguardar novo retorno.
          - nextState pode continuar "OFFLINE_POST_AGENT_RESPONSE" ou voltar para "LEAVE_MESSAGE",
            conforme o sentido da conversa, mas NÃO marque shouldCloseAttendance como true.

   2.3) Quando state = "OFFLINE_RATING":
        - Se o cidadão enviar um número nítido de 1 a 5:
          - shouldSaveRating = true
          - rating = esse número
          - replyText: agradeça, mencione o protocolo se existir e diga que o
            atendimento foi encerrado.
          - shouldCloseAttendance = true
          - nextState = "CLOSED"

        - Se ele mandar algo que não seja claramente 1, 2, 3, 4 ou 5:
          - Explique que a nota precisa ser um número de 1 a 5
          - Peça novamente a nota
          - nextState permanece "OFFLINE_RATING"
          - shouldCloseAttendance = false

3) Atendimento já encerrado (CLOSED)
   Quando:
   - state = "CLOSED"

   - Explique que o atendimento atual já está encerrado, mas que ele pode
     abrir um novo envio de mensagem se quiser.
   - nextState pode continuar "CLOSED".
   - shouldCloseAttendance deve ser true.

Tom e estilo:
- Sempre responda em PORTUGUÊS BRASILEIRO.
- Seja educado, direto e evite textos muito longos (2–3 parágrafos curtos no máximo).
- Use o nome do cidadão (cidadaoNome) apenas se existir, de forma natural.
- Não invente datas específicas, prazos exatos ou promessas ("amanhã", "até dia X", etc.).
- Não invente telefones, e-mails ou links.

Lembre-se: a saída DEVE ser sempre um JSON válido, sem comentários,
sem \` \`\` \` e sem nenhum texto antes ou depois do JSON.
`;

/**
 * Chama a DeepSeek para decidir o próximo passo do fluxo offline.
 */
export async function callOfflineFlowEngine(
  context: OfflineFlowContext,
  citizenText: string
): Promise<OfflineFlowDecision> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn("[AI_FLOW] DEEPSEEK_API_KEY não configurada. Usando resposta padrão.");
    return {
      replyText:
        "Recebi sua mensagem e seu atendimento está registrado no sistema. A equipe responsável vai analisar e, se necessário, entrará em contato com você.",
      nextState: (context.state as OfflineState) || "LEAVE_MESSAGE",
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
        timeout: 15000,
      }
    );

    let content: string =
      response.data?.choices?.[0]?.message?.content?.trim() ?? "";

    // Remove ```json ... ``` se a IA insistir em mandar com fence
    if (content.startsWith("```")) {
      content = content
        .replace(/^```json/i, "")
        .replace(/^```/, "")
        .replace(/```$/, "")
        .trim();
    }

    const parsed = JSON.parse(content);

    const decision: OfflineFlowDecision = {
      replyText:
        typeof parsed.replyText === "string"
          ? parsed.replyText
          : "Recebi sua mensagem e ela está registrada para análise da equipe responsável.",
      nextState:
        typeof parsed.nextState === "string"
          ? (parsed.nextState as OfflineState)
          : (context.state as OfflineState),
      shouldSaveRating: !!parsed.shouldSaveRating,
      rating:
        typeof parsed.rating === "number" ? parsed.rating : undefined,
      shouldCloseAttendance: !!parsed.shouldCloseAttendance,
    };

    return decision;
  } catch (err) {
    console.error("[AI_FLOW] Erro ao chamar DeepSeek:", err);
    // fallback se der erro na IA
    return {
      replyText:
        "Recebi sua mensagem e ela está registrada para análise da equipe responsável. Se quiser, pode acrescentar mais detalhes por aqui.",
      nextState: (context.state as OfflineState) || "LEAVE_MESSAGE",
      shouldSaveRating: false,
      shouldCloseAttendance: false,
    };
  }
}
