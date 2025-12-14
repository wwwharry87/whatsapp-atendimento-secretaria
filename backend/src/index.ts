// src/index.ts
import "reflect-metadata";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { env } from "./config/env";
import { AppDataSource, initDataSourceWithRetry } from "./database/data-source";

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

/**
 * =========================
 * 1) Captura rawBody (para assinatura do webhook)
 * =========================
 * Isso permite validar x-hub-signature-256 corretamente.
 */
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * =========================
 * 2) CORS mais seguro
 * =========================
 * Se você quiser restringir, configure:
 * CORS_ORIGINS=https://seu-front.com,https://outro.com
 */
const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // chamadas server-to-server / curl sem origin
      if (!origin) return cb(null, true);

      // se não configurou nada, mantém liberado (comportamento atual)
      if (corsOrigins.length === 0) return cb(null, true);

      // se configurou, restringe
      if (corsOrigins.includes(origin)) return cb(null, true);

      return cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/**
 * =========================
 * 3) Request ID simples (observabilidade)
 * =========================
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const rid =
    (req.headers["x-request-id"] as string) ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  (req as any).requestId = rid;
  res.setHeader("x-request-id", rid);
  next();
});

// ===============================
// ROTAS PÚBLICAS
// ===============================
app.use("/webhook", webhookRoutes);
app.use("/auth", authRoutes);

// healthcheck público
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    env: env.nodeEnv,
    message: "API Atende Cidadão rodando.",
  });
});

// ===============================
// ROTAS DO PAINEL / DASHBOARD
// ===============================
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
// ROTAS DE MÍDIA
// ===============================
app.use("/media", authMiddleware, mediaRoutes);

// ===============================
// ROTAS AVANÇADAS DE ATENDIMENTOS
// ===============================
app.use("/api/atendimentos", authMiddleware, atendimentosRoutes);

/**
 * =========================
 * 4) 404 padronizado
 * =========================
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Rota não encontrada.",
    path: req.path,
  });
});

/**
 * =========================
 * 5) Error handler global
 * =========================
 * - não vaza stack em produção
 * - padroniza resposta
 */
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).requestId;

  console.error("[ERROR_HANDLER]", {
    requestId,
    path: req.path,
    method: req.method,
    message: err?.message,
    stack: env.isProd ? undefined : err?.stack,
  });

  // erro de CORS (do middleware acima)
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS bloqueado para esta origem.",
      requestId,
    });
  }

  return res.status(500).json({
    error: "Erro interno no servidor.",
    requestId,
  });
});

async function start() {
  try {
    // ✅ usa retry (mais robusto no Render)
    await initDataSourceWithRetry({ retries: 10, delayMs: 1500 });

    // Garantia extra (caso você use init em outro lugar)
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    app.listen(env.port, () => {
      console.log(`🚀 Servidor rodando na porta ${env.port} (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error("Erro ao iniciar a aplicação:", err);
    process.exit(1);
  }
}

start();
