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
import recadosRoutes from "./routes/recadosRoutes";

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

// ===============================
// ROTAS PÚBLICAS
// ===============================
app.use("/webhook", webhookRoutes);
app.use("/auth", authRoutes);

// (se quiser deixar o healthcheck público, mantém aqui)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "API Atende Cidadão rodando.",
  });
});

// ===============================
// ROTAS DO PAINEL / DASHBOARD
// ===============================
//
// Usadas direto pelo frontend:
//
// - GET /dashboard/resumo-atendimentos
// - GET /atendimentos
// - GET /atendimentos/:id
// - GET /atendimentos/:id/mensagens
// - GET /atendimentos/:id/eventos
//
app.use("/dashboard", authMiddleware, painelRoutes);
app.use("/", authMiddleware, painelRoutes);

// ===============================
// ROTAS DE CONFIGURAÇÃO
// ===============================
app.use("/departamentos", authMiddleware, departamentosRoutes);
app.use("/usuarios", authMiddleware, usuariosRoutes);
app.use("/horarios", authMiddleware, horariosRoutes);
app.use("/recados", authMiddleware, recadosRoutes);

// ===============================
// ROTAS DE MÍDIA (upload / download) – PRECISAM DO idcliente
// ===============================
app.use("/media", authMiddleware, mediaRoutes);

// ===============================
// ROTAS AVANÇADAS DE ATENDIMENTOS (API técnica)
// ===============================
//
// Exemplo: GET /api/atendimentos/atendimentos?status=ACTIVE
//
app.use("/api/atendimentos", authMiddleware, atendimentosRoutes);

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
