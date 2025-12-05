// src/index.ts
import "reflect-metadata";
import express from "express";
import cors from "cors";
import { AppDataSource } from "./database/data-source";

import webhookRoutes from "./routes/webhook";
import atendimentosRoutes from "./routes/atendimentos";
import mediaRoutes from "./routes/media";
import authRoutes from "./routes/auth";

const app = express();

// Middlewares básicos
app.use(
  cors({
    origin: "*", // se quiser travar depois, a gente ajusta
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
  })
);

app.use(express.json());

// Rota raiz (healthcheck)
app.get("/", (req, res) => {
  res.send("API de Atendimento WhatsApp - Secretaria");
});

// Webhook do WhatsApp (sem auth)
app.use("/webhook", webhookRoutes);

// Rotas de autenticação
app.use("/api/auth", authRoutes);

// Alias para compatibilidade com frontend que chama /auth/login
app.use("/auth", authRoutes);

// Rotas de mídia (se estiver usando)
app.use("/api/media", mediaRoutes);

// Rotas de atendimentos (depois podemos proteger com authMiddleware)
app.use("/api/atendimentos", atendimentosRoutes);

const PORT = process.env.PORT || 3000;

// Inicializa o banco e sobe o servidor
AppDataSource.initialize()
  .then(() => {
    console.log("📦 Banco de dados conectado com sucesso");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("❌ Erro ao conectar no banco de dados:", error);
  });

export default app;
