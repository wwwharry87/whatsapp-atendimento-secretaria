// src/index.ts
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { AppDataSource } from "./database/data-source";

import webhookRoutes from "./routes/webhook";
import mediaRoutes from "./routes/media";
import atendimentosRoutes from "./routes/atendimentos";
import authRoutes from "./routes/auth";

import painelRoutes from "./routes/painel";
import departamentosRoutes from "./routes/departamentos";
import usuariosRoutes from "./routes/usuarios";
import horariosRoutes from "./routes/horarios";

const app = express();

app.use(
  cors({
    origin: "*", // se quiser, depois podemos restringir para o domínio do frontend
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API de Atendimento WhatsApp - Secretaria");
});

// Webhook do WhatsApp (sem auth)
app.use("/webhook", webhookRoutes);

// Auth (login)
app.use("/auth", authRoutes);
app.use("/api/auth", authRoutes); // alias se precisar

// Mídias (se estiver usando)
app.use("/api/media", mediaRoutes);

// Rotas antigas de atendimentos (se houver algo legado)
app.use("/api/atendimentos", atendimentosRoutes);

// 🔹 Rotas do painel (frontend)
// - /atendimentos
// - /dashboard/resumo-atendimentos
// - /departamentos
// - /usuarios
// - /horarios
app.use("/", painelRoutes);
app.use("/departamentos", departamentosRoutes);
app.use("/usuarios", usuariosRoutes);
app.use("/horarios", horariosRoutes);

async function start() {
  try {
    await AppDataSource.initialize();
    console.log("📦 Banco de dados conectado.");

    app.listen(env.port, () => {
      console.log(`🚀 Servidor rodando na porta ${env.port}`);
    });
  } catch (err) {
    console.error("Erro ao iniciar a aplicação:", err);
  }
}

start();
