// src/services/credentialService.ts
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";

// Cache simples em memória para não bater no banco em toda mensagem
// Map<idcliente, Cliente>
const clientCache = new Map<number, Cliente>();
// Map<phoneNumberId, Cliente> - para busca rápida no webhook
const phoneIdCache = new Map<string, Cliente>();

// Tempo que os dados ficam na memória (10 minutos)
const CACHE_TTL = 10 * 60 * 1000; 
let lastCacheClear = Date.now();

function checkCacheInvalidation() {
  const now = Date.now();
  if (now - lastCacheClear > CACHE_TTL) {
    console.log("[CACHE] Limpando cache de credenciais de clientes...");
    clientCache.clear();
    phoneIdCache.clear();
    lastCacheClear = now;
  }
}

/**
 * Busca um cliente pelo ID (usado na hora de enviar mensagem)
 */
export async function getClienteById(idcliente: number): Promise<Cliente | null> {
  checkCacheInvalidation();
  
  if (clientCache.has(idcliente)) {
    return clientCache.get(idcliente)!;
  }

  const repo = AppDataSource.getRepository(Cliente);
  const cliente = await repo.findOne({ where: { id: idcliente, ativo: true } });

  if (cliente) {
    clientCache.set(idcliente, cliente);
    if (cliente.whatsappPhoneNumberId) {
      phoneIdCache.set(cliente.whatsappPhoneNumberId, cliente);
    }
  }

  return cliente;
}

/**
 * Busca um cliente pelo Phone Number ID vindo do Webhook (usado na hora de receber)
 */
export async function getClienteByPhoneNumberId(phoneId: string): Promise<Cliente | null> {
  checkCacheInvalidation();

  if (phoneIdCache.has(phoneId)) {
    return phoneIdCache.get(phoneId)!;
  }

  const repo = AppDataSource.getRepository(Cliente);
  const cliente = await repo.findOne({ 
    where: { whatsappPhoneNumberId: phoneId, ativo: true } 
  });

  if (cliente) {
    phoneIdCache.set(phoneId, cliente);
    clientCache.set(cliente.id, cliente);
  }

  return cliente;
}

/**
 * Verifica se o token de verificação (hub.verify_token) bate com algum cliente ativo
 */
export async function verificarTokenValidacao(tokenRecebido: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(Cliente);
  // Busca se existe ALGUM cliente com esse verify_token
  const count = await repo.count({ 
    where: { whatsappVerifyToken: tokenRecebido, ativo: true } 
  });
  return count > 0;
}