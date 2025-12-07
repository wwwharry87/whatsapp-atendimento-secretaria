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

// ===============================
// ROTAS DO PAINEL / DASHBOARD
// ===============================
//
// Aqui estão as rotas que o frontend usa diretamente:
// - GET /dashboard/resumo-atendimentos   (DashboardPage)
// - GET /atendimentos                    (AtendimentosPage)
// - GET /atendimentos/:id                (AtendimentoDetalhePage)
// - GET /atendimentos/:id/mensagens      (AtendimentoDetalhePage)
//
// O mesmo router (painelRoutes) é montado em dois prefixos:
//
// 1) /dashboard  -> para chamadas tipo /dashboard/resumo-atendimentos
// 2) /           -> para chamadas tipo /atendimentos, /atendimentos/:id, etc.
//
app.use("/dashboard", authMiddleware, painelRoutes);
app.use("/", authMiddleware, painelRoutes);

// ===============================
// ROTAS DE CONFIGURAÇÃO
// ===============================
app.use("/departamentos", authMiddleware, departamentosRoutes);
app.use("/usuarios", authMiddleware, usuariosRoutes);
app.use("/horarios", authMiddleware, horariosRoutes);

// ===============================
// ROTAS AVANÇADAS DE ATENDIMENTOS (API)
// ===============================
//
// Essas são rotas mais "técnicas" (filtros/paginação detalhada, etc),
// definidas em src/routes/atendimentos.ts. Para não conflitar com o
// que o painel usa, deixamos sob /api/atendimentos.
//
app.use("/api/atendimentos", authMiddleware, atendimentosRoutes);

// ===============================
// ROTA RAIZ
// ===============================
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
