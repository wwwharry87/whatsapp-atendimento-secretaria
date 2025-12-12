// src/services/credentialService.ts
import { AppDataSource } from "../database/data-source";
import { Cliente } from "../entities/Cliente";

export type WhatsappClientInfo = {
  idcliente: number;
  nome: string;
  phoneNumberId: string;
  accessToken: string;
};

const cacheByPhoneNumberId = new Map<string, WhatsappClientInfo>();
let defaultClientCache: WhatsappClientInfo | null = null;

/**
 * Busca cliente pelo phone_number_id vindo do WhatsApp.
 * Se não informar phoneNumberId, cai no cliente "default" (primeiro ativo).
 */
export async function getClientByPhoneNumberId(
  phoneNumberId?: string | null
): Promise<WhatsappClientInfo | null> {
  const repo = AppDataSource.getRepository(Cliente);

  // 1) Quando vier o phone_number_id do webhook
  if (phoneNumberId && phoneNumberId.trim()) {
    const key = phoneNumberId.trim();

    if (cacheByPhoneNumberId.has(key)) {
      return cacheByPhoneNumberId.get(key)!;
    }

    const cliente = await repo.findOne({
      where: { whatsappPhoneNumberId: key },
    });

    if (!cliente) {
      console.warn(
        "[CREDENTIALS] Nenhum cliente encontrado com whatsapp_phone_number_id =",
        key
      );
      return null;
    }

    const info: WhatsappClientInfo = {
      idcliente: cliente.id,
      nome: cliente.nome,
      phoneNumberId: key,
      accessToken: (cliente.whatsappAccessToken || "").trim(),
    };

    cacheByPhoneNumberId.set(key, info);
    return info;
  }

  // 2) Default (primeiro cliente ativo / primeiro da tabela)
  if (defaultClientCache) return defaultClientCache;

  let cliente: Cliente | null = null;

  try {
    cliente = await repo.findOne({
      where: { ativo: true as any },
      order: { id: "ASC" as any },
    });
  } catch (err) {
    console.log(
      "[CREDENTIALS] Erro ao buscar cliente ativo (talvez não exista coluna 'ativo').",
      err
    );
  }

  if (!cliente) {
    cliente = await repo.findOne({
      order: { id: "ASC" as any },
    });
  }

  if (!cliente) {
    console.error(
      "[CREDENTIALS] Nenhum cliente encontrado na tabela 'clientes'."
    );
    return null;
  }

  const info: WhatsappClientInfo = {
    idcliente: cliente.id,
    nome: cliente.nome,
    phoneNumberId: (cliente.whatsappPhoneNumberId || "").trim(),
    accessToken: (cliente.whatsappAccessToken || "").trim(),
  };

  defaultClientCache = info;
  return info;
}

/**
 * Opcional: buscar cliente direto pelo idcliente (para uso no painel/recados).
 */
export async function getClientById(
  idcliente: number
): Promise<WhatsappClientInfo | null> {
  const repo = AppDataSource.getRepository(Cliente);

  const cliente = await repo.findOne({ where: { id: idcliente } });

  if (!cliente) {
    console.warn("[CREDENTIALS] Cliente não encontrado para id =", idcliente);
    return null;
  }

  return {
    idcliente: cliente.id,
    nome: cliente.nome,
    phoneNumberId: (cliente.whatsappPhoneNumberId || "").trim(),
    accessToken: (cliente.whatsappAccessToken || "").trim(),
  };
}
