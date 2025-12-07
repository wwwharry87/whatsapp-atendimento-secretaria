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

import { authMiddleware } from "./middlewares/authMiddleware";

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Rotas públicas (webhook do WhatsApp, mídia e login)
app.use("/webhook", webhookRoutes);
app.use("/media", mediaRoutes);
app.use("/auth", authRoutes);

// Rotas protegidas – exigem token JWT
app.use("/atendimentos", authMiddleware, atendimentosRoutes);
app.use("/departamentos", authMiddleware, departamentosRoutes);
app.use("/usuarios", authMiddleware, usuariosRoutes);
app.use("/horarios", authMiddleware, horariosRoutes);

// Rotas do painel/dashboard (resumo de atendimentos, últimos casos, etc.)
app.use("/dashboard", authMiddleware, painelRoutes);

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "API Atende Cidadão rodando.",
  });
});

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
