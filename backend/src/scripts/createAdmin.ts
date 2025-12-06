// src/scripts/createAdmin.ts
import "reflect-metadata";
import crypto from "crypto";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function main() {
  try {
    await AppDataSource.initialize();
    console.log("[createAdmin] Conectado ao banco.");

    const repo = AppDataSource.getRepository(Usuario);

    const idcliente =
      Number(process.env.DEFAULT_CLIENTE_ID || "1") || 1;

    const adminEmail =
      process.env.ADMIN_EMAIL || "admin@semed.tucurui.pa.gov.br";
    const adminNome = process.env.ADMIN_NOME || "Administrador SEMED";
    const adminSenha = process.env.ADMIN_SENHA || "admin123";

    const emailLower = adminEmail.toLowerCase();

    const existente = await repo.findOne({
      where: { email: emailLower, idcliente },
    });

    if (existente) {
      console.log(
        `[createAdmin] Já existe usuário admin (${emailLower}) para idcliente=${idcliente}. Nada a fazer.`
      );
      process.exit(0);
      return;
    }

    // 🔒 força o tipo para Usuario (não Usuario[])
    const usuario = repo.create({
      idcliente,
      nome: adminNome,
      email: emailLower,
      telefone: null,
      perfil: "ADMIN",
      senhaHash: hashPassword(adminSenha),
      ativo: true,
    } as any) as Usuario;

    await repo.save(usuario);

    console.log("[createAdmin] Usuário admin criado com sucesso:");
    console.log("  id:", usuario.id);
    console.log("  nome:", usuario.nome);
    console.log("  email:", usuario.email);
    console.log("  senha:", adminSenha);
    console.log("  idcliente:", idcliente);

    process.exit(0);
  } catch (err) {
    console.error("[createAdmin] Erro ao criar admin:", err);
    process.exit(1);
  }
}

main();
