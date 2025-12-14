// src/services/sessionState.ts
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { Cliente } from "../entities/Cliente";

// ====================== TIPOS ======================

export type SessionStatus =
  | "ASK_NAME"
  | "ASK_PROFILE"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "OFFLINE_POST_AGENT_RESPONSE" // Adicionado para fluxo offline
  | "OFFLINE_RATING"              // Adicionado para fluxo offline
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
  | "FINISHED"
  | (string & {});

export interface Session {
  citizenNumber: string; // WhatsApp do cidadão (normalizado)
  citizenName?: string;
  userProfile?: "FUNCIONARIO" | "COMUNIDADE"; // <--- NOVO CAMPO
  lastCitizenText?: string;

  

  departmentId?: number;
  departmentName?: string;

  agentNumber?: string; // WhatsApp do agente
  agentName?: string;

  status: SessionStatus;
  atendimentoId: string; // ID do atendimento no banco

  busyReminderCount?: number;
  lastActiveAt?: number;

  protocolo?: string;
  idcliente?: number;
  phoneNumberId?: string;

  // usado no modo recado / offline
  leaveMessageAckSent?: boolean;
  protocolHintSent?: boolean;

  // IA
  pendingDepartmentIndice?: number;
  pendingDepartmentName?: string;
  initialSummary?: string;

  [key: string]: any;
}

// ====================== MAPS EM MEMÓRIA ======================

export const sessionsByCitizen = new Map<string, Session>();
export const sessionsByAgent = new Map<string, Session>();

// ====================== HELPERS LOCALIZADOS ======================

function normalizePhone(num?: string | null): string {
  if (!num) return "";
  return num.replace(/\D/g, "");
}

/**
 * Retorna os últimos 8 dígitos para chave de agente,
 * evitando problemas com nono dígito.
 */
export function getAgentKey(num?: string | null): string {
  const n = normalizePhone(num);
  if (!n) return "";
  return n.slice(-8);
}

// ====================== GERENCIAMENTO DE SESSÃO ======================

export function getSessionByCitizen(citizenNumber: string): Session | undefined {
  return sessionsByCitizen.get(citizenNumber);
}

export function setSession(session: Session): void {
  const existing = sessionsByCitizen.get(session.citizenNumber);

  // se o agente mudou, removemos o vínculo anterior
  if (existing?.agentNumber && existing.agentNumber !== session.agentNumber) {
    const oldKey = getAgentKey(existing.agentNumber);
    if (oldKey) sessionsByAgent.delete(oldKey);
  }

  sessionsByCitizen.set(session.citizenNumber, session);

  if (session.agentNumber) {
    const agentKey = getAgentKey(session.agentNumber);
    if (agentKey) sessionsByAgent.set(agentKey, session);
  }
}

export function invalidateSessionCache(citizenNumber: string): void {
  const session = sessionsByCitizen.get(citizenNumber);
  if (session?.agentNumber) {
    const key = getAgentKey(session.agentNumber);
    if (key) sessionsByAgent.delete(key);
  }
  sessionsByCitizen.delete(citizenNumber);
}

/**
 * Verifica se um número pertence a um agente que está em atendimento.
 */
export function isAgentNumber(number: string): boolean {
  const key = getAgentKey(number);
  return sessionsByAgent.has(key);
}

// ====================== LÓGICA DE BANCO DE DADOS ======================

/**
 * Busca o cliente padrão ou pelo ID do canal (WhatsApp).
 */
async function resolveClienteId(phoneNumberId?: string): Promise<number> {
  const repo = AppDataSource.getRepository(Cliente);

  // 1. Tenta pelo phoneNumberId
  if (phoneNumberId) {
    const c = await repo.findOne({ where: { whatsappPhoneNumberId: phoneNumberId } });
    if (c) return c.id;
  }

  // 2. Fallback: primeiro cliente ativo ou primeiro da tabela
  const ativo = await repo.findOne({ where: { ativo: true as any }, order: { id: "ASC" as any } });
  if (ativo) return ativo.id;

  const primeiro = await repo.findOne({ order: { id: "ASC" as any } });
  if (primeiro) return primeiro.id;

  throw new Error("Nenhum cliente cadastrado no banco.");
}

/**
 * Tenta recuperar uma sessão de AGENTE baseada no número dele.
 * Útil se o servidor reiniciou e o agente mandou mensagem.
 */
export async function recoverAgentSession(agentNumberRaw: string): Promise<Session | undefined> {
  const agentFull = normalizePhone(agentNumberRaw);
  const last8 = getAgentKey(agentFull);
  if (!last8) return undefined;

  // Se já está na memória, retorna
  if (sessionsByAgent.has(last8)) {
    return sessionsByAgent.get(last8);
  }

  const repo = AppDataSource.getRepository(Atendimento);
  
  // Busca atendimento ativo vinculado a esse agente
  const atendimento = await repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .where("a.status IN (:...statuses)", {
      statuses: ["WAITING_AGENT_CONFIRMATION", "ACTIVE"],
    })
    .andWhere(
      "(right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
      "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8)",
      { last8 }
    )
    .orderBy("a.atualizado_em", "DESC")
    .getOne();

  if (!atendimento) return undefined;

  // Reconstrói a sessão
  const session: Session = {
    citizenNumber: normalizePhone(atendimento.cidadaoNumero),
    status: atendimento.status as SessionStatus,
    atendimentoId: atendimento.id,
    citizenName: atendimento.cidadaoNome ?? undefined,
    departmentId: atendimento.departamentoId ?? undefined,
    departmentName: atendimento.departamento?.nome ?? undefined,
    agentNumber: normalizePhone(atendimento.agenteNumero ?? ""),
    agentName: atendimento.agenteNome ?? undefined,
    idcliente: atendimento.idcliente,
    lastActiveAt: Date.now(),
  };

  // Salva no cache
  setSession(session);
  return session;
}

/**
 * Cria ou recupera a sessão do CIDADÃO.
 * Se não existir em memória, busca 'ACTIVE' no banco. Se não, cria novo.
 */
export async function getOrCreateSession(
  citizenNumberRaw: string,
  phoneNumberId?: string
): Promise<Session> {
  const citizenKey = normalizePhone(citizenNumberRaw);
  
  // 1. Memória
  const existing = sessionsByCitizen.get(citizenKey);
  if (existing) return existing;

  const repo = AppDataSource.getRepository(Atendimento);
  const idcliente = await resolveClienteId(phoneNumberId);

  // 2. Banco (Atendimento em andamento)
  const active = await repo.findOne({
    where: {
      cidadaoNumero: citizenKey,
      status: "ACTIVE", // Apenas recupera se estiver realmente em chat
      idcliente,
    },
    relations: ["departamento"],
    order: { criadoEm: "DESC" },
  });

  if (active) {
    const session: Session = {
      citizenNumber: citizenKey,
      status: active.status as SessionStatus,
      atendimentoId: active.id,
      citizenName: active.cidadaoNome ?? undefined,
      departmentId: active.departamentoId ?? undefined,
      departmentName: active.departamento?.nome ?? undefined,
      agentNumber: active.agenteNumero ?? undefined,
      agentName: active.agenteNome ?? undefined,
      protocolo: active.protocolo ?? undefined,
      idcliente: active.idcliente,
      phoneNumberId,
      lastActiveAt: Date.now(),
    };
    setSession(session);
    return session;
  }

  // 3. Novo Atendimento
  // Verifica se tem nome de um atendimento anterior para já pular ASK_NAME
  const ultimo = await repo.findOne({
    where: { cidadaoNumero: citizenKey, idcliente },
    order: { criadoEm: "DESC" },
  });

  const temNome = !!ultimo?.cidadaoNome;
  
  const novo = repo.create({
    idcliente,
    cidadaoNumero: citizenKey,
    cidadaoNome: temNome ? ultimo!.cidadaoNome : null,
    status: temNome ? "ASK_DEPARTMENT" : "ASK_NAME",
  });

  await repo.save(novo);

  const newSession: Session = {
    citizenNumber: citizenKey,
    status: novo.status as SessionStatus,
    atendimentoId: novo.id,
    citizenName: novo.cidadaoNome ?? undefined,
    idcliente,
    phoneNumberId,
    lastActiveAt: Date.now(),
  };

  setSession(newSession);
  return newSession;
}