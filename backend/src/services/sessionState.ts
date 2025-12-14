// src/services/sessionState.ts
import { In } from "typeorm"; // <--- Importado corretamente aqui
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
  | "OFFLINE_POST_AGENT_RESPONSE" 
  | "OFFLINE_RATING"              
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
  | "FINISHED"
  | (string & {});

export interface Session {
  citizenNumber: string; 
  citizenName?: string;
  userProfile?: "FUNCIONARIO" | "COMUNIDADE";
  lastCitizenText?: string;

  departmentId?: number;
  departmentName?: string;

  agentNumber?: string; 
  agentName?: string;

  status: SessionStatus;
  atendimentoId: string; 

  busyReminderCount?: number;
  lastActiveAt?: number;

  protocolo?: string;
  idcliente?: number;
  phoneNumberId?: string;

  leaveMessageAckSent?: boolean;
  protocolHintSent?: boolean;

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

export function isAgentNumber(number: string): boolean {
  const key = getAgentKey(number);
  return sessionsByAgent.has(key);
}

// ====================== LÓGICA DE BANCO DE DADOS ======================

async function resolveClienteId(phoneNumberId?: string): Promise<number> {
  const repo = AppDataSource.getRepository(Cliente);

  if (phoneNumberId) {
    const c = await repo.findOne({ where: { whatsappPhoneNumberId: phoneNumberId } });
    if (c) return c.id;
  }

  const ativo = await repo.findOne({ where: { ativo: true as any }, order: { id: "ASC" as any } });
  if (ativo) return ativo.id;

  const primeiro = await repo.findOne({ order: { id: "ASC" as any } });
  if (primeiro) return primeiro.id;

  throw new Error("Nenhum cliente cadastrado no banco.");
}

export async function recoverAgentSession(agentNumberRaw: string): Promise<Session | undefined> {
  const agentFull = normalizePhone(agentNumberRaw);
  const last8 = getAgentKey(agentFull);
  if (!last8) return undefined;

  if (sessionsByAgent.has(last8)) {
    return sessionsByAgent.get(last8);
  }

  const repo = AppDataSource.getRepository(Atendimento);
  
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

  setSession(session);
  return session;
}

export async function getOrCreateSession(
  citizenNumberRaw: string,
  phoneNumberId?: string
): Promise<Session> {
  const citizenKey = normalizePhone(citizenNumberRaw);
  
  const existing = sessionsByCitizen.get(citizenKey);
  if (existing) return existing;

  const repo = AppDataSource.getRepository(Atendimento);
  const idcliente = await resolveClienteId(phoneNumberId);

  // 2. Banco: Busca atendimentos EM ANDAMENTO ou RECADO ABERTO
  const active = await repo.findOne({
    where: {
      cidadaoNumero: citizenKey,
      // CORREÇÃO AQUI: Usando o operador In importado do typeorm
      status: In(["ACTIVE", "LEAVE_MESSAGE", "IN_QUEUE", "WAITING_AGENT_CONFIRMATION"]), 
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
      // Se já estava em recado, assume que já demos o "oi" inicial
      leaveMessageAckSent: active.status === "LEAVE_MESSAGE", 
      lastActiveAt: Date.now(),
    };
    setSession(session);
    return session;
  }

  // 3. Novo Atendimento
  const ultimo = await repo.findOne({
    where: { cidadaoNumero: citizenKey, idcliente },
    order: { criadoEm: "DESC" },
  });

  const temNome = !!ultimo?.cidadaoNome;
  
  const novo = repo.create({
    idcliente,
    cidadaoNumero: citizenKey,
    cidadaoNome: temNome ? ultimo!.cidadaoNome : null,
    status: temNome ? "ASK_PROFILE" : "ASK_NAME",
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