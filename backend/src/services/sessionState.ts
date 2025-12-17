// src/services/sessionState.ts
import { In, MoreThan } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
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
  | "WAITING_AGENT"
  | "OFFLINE_POST_AGENT_RESPONSE"
  | "OFFLINE_RATING"
  | "CLOSED"
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

/**
 * agentKey (NOVO): `${idcliente}:${last8}`
 * -> evita colisão entre municípios
 */
export const sessionsByAgent = new Map<string, Session>();

/**
 * Lock simples por cidadão para evitar corrida criando 2 atendimentos
 * na mesma instância.
 */
const inflightCitizen = new Map<string, Promise<Session>>();

/**
 * Cache de phone_number_id => idcliente
 */
const clienteCacheByPhoneNumberId = new Map<string, { idcliente: number; exp: number }>();
const CLIENTE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// ====================== HELPERS ======================

function normalizePhone(num?: string | null): string {
  if (!num) return "";
  return String(num).replace(/\D/g, "");
}

function last8Digits(num?: string | null): string {
  const n = normalizePhone(num);
  if (!n) return "";
  return n.length > 8 ? n.slice(-8) : n;
}

/**
 * agentKey mais seguro para multi-tenant.
 */
export function getAgentKey(agentNumber?: string | null, idcliente?: number | null): string {
  const last8 = last8Digits(agentNumber);
  if (!last8) return "";
  if (idcliente == null) return `?:${last8}`; // fallback (evitar crash)
  return `${idcliente}:${last8}`;
}

export function getSessionByCitizen(citizenNumber: string): Session | undefined {
  const key = normalizePhone(citizenNumber);
  return sessionsByCitizen.get(key);
}

export function getSessionByAgent(agentNumber: string, idcliente?: number): Session | undefined {
  const key = getAgentKey(agentNumber, idcliente);
  if (!key) return undefined;
  return sessionsByAgent.get(key);
}

export function setSession(session: Session): void {
  const citizenKey = normalizePhone(session.citizenNumber);
  session.citizenNumber = citizenKey;

  const existing = sessionsByCitizen.get(citizenKey);

  // remove vinculo antigo de agente se mudou
  if (
    existing?.agentNumber &&
    (existing.agentNumber !== session.agentNumber || existing.idcliente !== session.idcliente)
  ) {
    const oldKey = getAgentKey(existing.agentNumber, existing.idcliente);
    if (oldKey) sessionsByAgent.delete(oldKey);
  }

  sessionsByCitizen.set(citizenKey, session);

  if (session.agentNumber) {
    const agentKey = getAgentKey(session.agentNumber, session.idcliente);
    if (agentKey) sessionsByAgent.set(agentKey, session);
  }
}

export function invalidateSessionCache(citizenNumber: string): void {
  const citizenKey = normalizePhone(citizenNumber);
  const session = sessionsByCitizen.get(citizenKey);

  if (session?.agentNumber) {
    const key = getAgentKey(session.agentNumber, session.idcliente);
    if (key) sessionsByAgent.delete(key);
  }

  sessionsByCitizen.delete(citizenKey);
}

/**
 * Atenção: isso só responde com base no cache em memória.
 */
export function isAgentNumber(number: string, idcliente?: number): boolean {
  const key = getAgentKey(number, idcliente);
  if (key && sessionsByAgent.has(key)) return true;

  // fallback: se veio sem idcliente, tenta procurar em qualquer cliente (menos seguro).
  if (idcliente == null) {
    const last8 = last8Digits(number);
    if (!last8) return false;
    for (const k of sessionsByAgent.keys()) {
      if (k.endsWith(`:${last8}`)) return true;
    }
  }

  return false;
}

// ====================== RESOLUÇÃO DE CLIENTE ======================

function getClienteCache(phoneNumberId?: string) {
  if (!phoneNumberId) return undefined;
  const hit = clienteCacheByPhoneNumberId.get(phoneNumberId);
  if (!hit) return undefined;
  if (hit.exp <= Date.now()) {
    clienteCacheByPhoneNumberId.delete(phoneNumberId);
    return undefined;
  }
  return hit.idcliente;
}

function setClienteCache(phoneNumberId: string, idcliente: number) {
  clienteCacheByPhoneNumberId.set(phoneNumberId, {
    idcliente,
    exp: Date.now() + CLIENTE_CACHE_TTL_MS,
  });
}

async function resolveClienteIdByPhoneNumberId(phoneNumberId?: string): Promise<number | undefined> {
  if (!phoneNumberId) return undefined;

  const cached = getClienteCache(phoneNumberId);
  if (cached != null) return cached;

  const repo = AppDataSource.getRepository(Cliente);
  const c = await repo.findOne({ where: { whatsappPhoneNumberId: phoneNumberId } as any });
  if (c) {
    setClienteCache(phoneNumberId, c.id);
    return c.id;
  }
  return undefined;
}

/**
 * Resolve o idcliente com prioridade:
 * 1) pelo phoneNumberId (ideal)
 * 2) pelo último atendimento do cidadão (se phoneNumberId não veio)
 * 3) pelo cliente ativo (fallback)
 * 4) primeiro cliente (fallback)
 * 5) 1 (último fallback)
 */
async function resolveClienteId(citizenKey: string, phoneNumberId?: string): Promise<number> {
  // 1) phoneNumberId
  const byPhone = await resolveClienteIdByPhoneNumberId(phoneNumberId);
  if (byPhone != null) return byPhone;

  // 2) inferir pelo último atendimento do cidadão
  if (citizenKey) {
    const atendimentoRepo = AppDataSource.getRepository(Atendimento);
    const last = await atendimentoRepo.findOne({
      where: { cidadaoNumero: citizenKey } as any,
      order: { atualizadoEm: "DESC" as any } as any,
      select: ["idcliente"] as any,
    });
    if (last?.idcliente != null) return last.idcliente as any;
  }

  // 3) cliente ativo
  const clienteRepo = AppDataSource.getRepository(Cliente);
  const ativo = await clienteRepo.findOne({
    where: { ativo: true as any } as any,
    order: { id: "ASC" as any } as any,
  });
  if (ativo) return ativo.id;

  // 4) primeiro
  const primeiro = await clienteRepo.findOne({
    order: { id: "ASC" as any } as any,
  });
  if (primeiro) return primeiro.id;

  // 5) fallback final
  return 1;
}

// ====================== LÓGICA DE RECUPERAÇÃO ======================

export async function recoverAgentSession(
  agentNumberRaw: string,
  phoneNumberId?: string
): Promise<Session | undefined> {
  const agentFull = normalizePhone(agentNumberRaw);
  const last8 = last8Digits(agentFull);
  if (!last8) return undefined;

  // tenta resolver idcliente pelo número do WhatsApp do município
  const idclienteByPhone = await resolveClienteIdByPhoneNumberId(phoneNumberId);

  // cache (se tiver idcliente resolvido)
  if (idclienteByPhone != null) {
    const cachedKey = getAgentKey(agentFull, idclienteByPhone);
    if (cachedKey && sessionsByAgent.has(cachedKey)) {
      return sessionsByAgent.get(cachedKey);
    }
  }

  const repo = AppDataSource.getRepository(Atendimento);

  // 🔥 IMPORTANTE:
  // - Se phoneNumberId veio, filtra por idcliente (multi-tenant correto)
  // - Se NÃO veio, busca o atendimento mais recente em QUALQUER cliente
  const qb = repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .andWhere("a.status IN (:...statuses)", {
      statuses: ["WAITING_AGENT_CONFIRMATION", "ACTIVE", "WAITING_AGENT"],
    })
    .andWhere(
      "(right(regexp_replace(coalesce(a.agente_numero, ''), '\\D', '', 'g'), 8) = :last8 " +
        "OR right(regexp_replace(coalesce(d.responsavel_numero, ''), '\\D', '', 'g'), 8) = :last8)",
      { last8 }
    )
    .orderBy("a.atualizado_em", "DESC");

  if (idclienteByPhone != null) {
    qb.andWhere("a.idcliente = :idcliente", { idcliente: idclienteByPhone });
  }

  const atendimento = await qb.getOne();
  if (!atendimento) return undefined;

  const idclienteFinal = atendimento.idcliente as any;

  // se agora temos idcliente, tenta cache novamente
  const cachedKey2 = getAgentKey(agentFull, idclienteFinal);
  if (cachedKey2 && sessionsByAgent.has(cachedKey2)) {
    return sessionsByAgent.get(cachedKey2);
  }

  const session: Session = {
    citizenNumber: normalizePhone(atendimento.cidadaoNumero),
    status: atendimento.status as SessionStatus,
    atendimentoId: atendimento.id,
    citizenName: atendimento.cidadaoNome ?? undefined,
    departmentId: atendimento.departamentoId ?? undefined,
    departmentName: atendimento.departamento?.nome ?? undefined,
    agentNumber: normalizePhone(atendimento.agenteNumero ?? ""),
    agentName: atendimento.agenteNome ?? undefined,
    protocolo: atendimento.protocolo ?? undefined,
    idcliente: idclienteFinal,
    phoneNumberId,
    lastActiveAt: Date.now(),
  };

  setSession(session);
  return session;
}

// ====================== GET OR CREATE ======================

export async function getOrCreateSession(
  citizenNumberRaw: string,
  phoneNumberId?: string
): Promise<Session> {
  const citizenKey = normalizePhone(citizenNumberRaw);
  if (!citizenKey) {
    throw new Error("Número do cidadão inválido ao criar sessão.");
  }

  // 1) memória
  const existing = sessionsByCitizen.get(citizenKey);
  if (existing) return existing;

  // 2) lock em memória (evita corrida local)
  const inflight = inflightCitizen.get(citizenKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const repo = AppDataSource.getRepository(Atendimento);
    const idcliente = await resolveClienteId(citizenKey, phoneNumberId);

    // 3) Banco: Busca atendimentos "vivos" (inclui pós-atendimento)
    const active = await repo.findOne({
      where: {
        cidadaoNumero: citizenKey,
        idcliente,
        status: In([
          "ACTIVE",
          "LEAVE_MESSAGE",
          "IN_QUEUE",
          "WAITING_AGENT_CONFIRMATION",
          "LEAVE_MESSAGE_DECISION",
          "ASK_NAME",
          "ASK_PROFILE",
          "ASK_DEPARTMENT",
          "OFFLINE_POST_AGENT_RESPONSE",
          "OFFLINE_RATING",
          "WAITING_AGENT",
        ]) as any,
      } as any,
      relations: ["departamento"],
      order: { atualizadoEm: "DESC" as any } as any,
    });

    if (active) {
      const session: Session = {
        citizenNumber: citizenKey,
        status: active.status as SessionStatus,
        atendimentoId: active.id,
        citizenName: active.cidadaoNome ?? undefined,
        departmentId: active.departamentoId ?? undefined,
        departmentName: active.departamento?.nome ?? undefined,
        agentNumber: active.agenteNumero ? normalizePhone(active.agenteNumero) : undefined,
        agentName: active.agenteNome ?? undefined,
        protocolo: active.protocolo ?? undefined,
        idcliente: active.idcliente,
        phoneNumberId,
        leaveMessageAckSent: active.status === "LEAVE_MESSAGE" ? false : true,
        lastActiveAt: Date.now(),
      };
      setSession(session);
      return session;
    }

    // 4) Busca atendimento encerrado recente (últimas 24h) -> permite pós-atendimento
    // ✅ Mas não reabre se já tiver nota (evita pedir avaliação repetida)
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);

    const recentFinished = await repo.findOne({
      where: {
        cidadaoNumero: citizenKey,
        status: "FINISHED" as any,
        idcliente,
        atualizadoEm: MoreThan(ontem) as any,
      } as any,
      order: { atualizadoEm: "DESC" as any } as any,
    });

    if (recentFinished) {
      const jaTemNota = (recentFinished as any)?.notaSatisfacao != null;

      if (!jaTemNota) {
        console.log(
          `[SESSION] Recuperando atendimento ENCERRADO recente (sem nota): ID=${recentFinished.id}`
        );

        const session: Session = {
          citizenNumber: citizenKey,
          status: "OFFLINE_POST_AGENT_RESPONSE",
          atendimentoId: recentFinished.id,
          citizenName: recentFinished.cidadaoNome ?? undefined,
          protocolo: recentFinished.protocolo ?? undefined,
          idcliente: recentFinished.idcliente,
          phoneNumberId,
          lastActiveAt: Date.now(),
        };
        setSession(session);
        return session;
      }
    }

    // 5) Novo atendimento
    const ultimo = await repo.findOne({
      where: { cidadaoNumero: citizenKey, idcliente } as any,
      order: { criadoEm: "DESC" as any } as any,
    });

    const temNome = !!ultimo?.cidadaoNome;

    const novoAtendimento = repo.create({
      idcliente,
      cidadaoNumero: citizenKey,
      cidadaoNome: temNome ? ultimo!.cidadaoNome : null,
      status: temNome ? "ASK_PROFILE" : "ASK_NAME",
    });

    const savedAtendimento = await repo.save(novoAtendimento);

    console.log(
      `[SESSION] Novo atendimento criado no banco: ID=${savedAtendimento.id} Status=${savedAtendimento.status} idcliente=${idcliente}`
    );

    const newSession: Session = {
      citizenNumber: citizenKey,
      status: savedAtendimento.status as SessionStatus,
      atendimentoId: savedAtendimento.id,
      citizenName: savedAtendimento.cidadaoNome ?? undefined,
      idcliente,
      phoneNumberId,
      lastActiveAt: Date.now(),
    };

    setSession(newSession);
    return newSession;
  })();

  inflightCitizen.set(citizenKey, promise);

  try {
    return await promise;
  } finally {
    inflightCitizen.delete(citizenKey);
  }
}
