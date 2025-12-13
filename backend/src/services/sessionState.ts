// src/services/sessionState.ts

/**
 * Representa os possíveis estados de uma sessão.
 *
 * Obs.: Mantemos as principais strings conhecidas e ainda
 * deixamos aberto para outros valores via (string & {}), para
 * não quebrar nada se você tiver mais status no projeto.
 */
export type SessionStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
  | "FINISHED"
  // permite outros status existentes sem dar erro de tipo
  | (string & {});

/**
 * Estrutura em memória da sessão de atendimento.
 *
 * Obs.: adiciono um index signature [key: string]: any para
 * evitar quebrar se já houver campos extras no seu projeto.
 */
export interface Session {
  citizenNumber: string;        // WhatsApp do cidadão (normalizado)
  citizenName?: string;
  lastCitizenText?: string;

  departmentId?: number;
  departmentName?: string;

  agentNumber?: string;         // WhatsApp do agente
  agentName?: string;

  status: SessionStatus;
  atendimentoId: string;        // ID do atendimento no banco

  busyReminderCount?: number;
  lastActiveAt?: number;

  protocolo?: string;
  idcliente?: number;
  phoneNumberId?: string;

  // usado no modo recado (LEAVE_MESSAGE)
  leaveMessageAckSent?: boolean;
  protocolHintSent?: boolean;

  // quando a IA sugere departamento por índice/nome
  pendingDepartmentIndice?: number;
  pendingDepartmentName?: string;

  // resumo inicial, se você estiver usando isso na IA
  initialSummary?: string;

  // Campos adicionais que já existirem hoje na sua Session
  // não vão quebrar por causa disso:
  [key: string]: any;
}

/**
 * Map principal: sessão por número do cidadão.
 */
const sessionsByCitizen = new Map<string, Session>();

/**
 * Map auxiliar: sessão por número do agente humano.
 */
const sessionsByAgent = new Map<string, Session>();

/**
 * Exportamos os Maps caso você queira inspecionar em debug,
 * mas a ideia é usar sempre os helpers abaixo.
 */
export { sessionsByCitizen, sessionsByAgent };

/**
 * Obtém sessão pela chave do cidadão (número normalizado).
 */
export function getSessionByCitizen(
  citizenNumber: string
): Session | undefined {
  return sessionsByCitizen.get(citizenNumber);
}

/**
 * Obtém sessão pela chave do agente (número normalizado do agente).
 */
export function getSessionByAgent(agentNumber: string): Session | undefined {
  return sessionsByAgent.get(agentNumber);
}

/**
 * Registra/atualiza uma sessão na memória.
 *
 * - Atualiza o Map de cidadãos.
 * - Se tiver agentNumber, atualiza também o Map de agentes.
 * - Remove mapeamento antigo de agente se ele tiver mudado.
 */
export function setSession(session: Session): void {
  const existing = sessionsByCitizen.get(session.citizenNumber);

  // se o agente mudou, removemos o vínculo anterior
  if (existing?.agentNumber && existing.agentNumber !== session.agentNumber) {
    sessionsByAgent.delete(existing.agentNumber);
  }

  sessionsByCitizen.set(session.citizenNumber, session);

  if (session.agentNumber) {
    sessionsByAgent.set(session.agentNumber, session);
  }
}

/**
 * Invalida (remove) a sessão da memória a partir do número do cidadão.
 *
 * CRÍTICO: é essa função que o painel deve chamar depois de
 * concluir um atendimento (ex.: ao concluir um recado).
 */
export function invalidateSessionCache(citizenNumber: string): void {
  const session = sessionsByCitizen.get(citizenNumber);

  if (session?.agentNumber) {
    sessionsByAgent.delete(session.agentNumber);
  }

  sessionsByCitizen.delete(citizenNumber);
}

/**
 * (Opcional) Reseta tudo. Útil em testes ou se você quiser
 * um endpoint de debug/admin para limpar todas as sessões.
 */
export function clearAllSessions(): void {
  sessionsByCitizen.clear();
  sessionsByAgent.clear();
}
