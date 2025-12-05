// src/scripts/createAdmin.ts
import "reflect-metadata";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

async function main() {
  try {
    // Você pode mudar esses valores se quiser outro login/senha
    const nome = process.env.ADMIN_NOME || "Administrador";
    const login = process.env.ADMIN_LOGIN || "admin";
    const senha = process.env.ADMIN_SENHA || "123456";

    console.log("➡ Inicializando conexão com o banco...");
    await AppDataSource.initialize();

    const usuarioRepo = AppDataSource.getRepository(Usuario);

    const total = await usuarioRepo.count();
    if (total > 0) {
      console.log("⚠ Já existe usuário na base. Não vou criar outro ADMIN padrão.");
      console.log("Se quiser criar manualmente outro, depois fazemos uma rota ou tela pra isso.");
      process.exit(0);
    }

    const existente = await usuarioRepo.findOne({ where: { login } });
    if (existente) {
      console.log(`⚠ Já existe usuário com login "${login}".`);
      process.exit(0);
    }

    console.log("➡ Gerando hash da senha...");
    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = usuarioRepo.create({
      nome,
      login,
      senhaHash,
      tipo: "ADMIN",
      ativo: true,
      email: null,
      telefoneWhatsapp: null,
    });

    await usuarioRepo.save(usuario);

    console.log("✅ Usuário ADMIN criado com sucesso!");
    console.log("====================================");
    console.log(`ID:    ${usuario.id}`);
    console.log(`Nome:  ${usuario.nome}`);
    console.log(`Login: ${login}`);
    console.log(`Senha: ${senha}`);
    console.log("====================================");
    console.log("Guarde esses dados para acessar o sistema.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao criar usuário ADMIN:", err);
    process.exit(1);
  }
}

main();
