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

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API de Atendimento WhatsApp - Secretaria");
});

// Webhook do WhatsApp (sem auth)
app.use("/webhook", webhookRoutes);

// Rotas de autenticação
app.use("/api/auth", authRoutes);

// Rotas de mídia (se estiver usando)
app.use("/api/media", mediaRoutes);

// Rotas de atendimentos (depois podemos proteger com authMiddleware)
app.use("/api/atendimentos", atendimentosRoutes);

const PORT = process.env.PORT || 3000;

AppDataSource.initialize()
  .then(() => {
    console.log("📦 Banco de dados conectado");
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((error) => console.error("Erro ao conectar no banco", error));
