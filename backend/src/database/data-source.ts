// src/database/data-source.ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { Cliente } from "../entities/Cliente";
import { Usuario } from "../entities/Usuario";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  entities: [Cliente, Usuario],
  synchronize: false, // usamos a DDL que você já aplicou no banco
  logging: false,
  ssl: {
    rejectUnauthorized: false,
  },
});
