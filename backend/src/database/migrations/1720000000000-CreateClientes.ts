// src/database/migrations/1720000000000-CreateClientes.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateClientes1720000000000 implements MigrationInterface {
  name = "CreateClientes1720000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        idcliente SERIAL PRIMARY KEY,
        nome VARCHAR(150) NOT NULL,
        documento VARCHAR(20),
        telefone VARCHAR(20),
        email VARCHAR(150),
        slug VARCHAR(50) UNIQUE NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT true,
        criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
        atualizado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
      );
    `);

    // Opcional: criar um cliente padrão para ambiente de testes
    await queryRunner.query(`
      INSERT INTO clientes (nome, documento, telefone, email, slug, ativo)
      VALUES ('Cliente Padrão', NULL, NULL, NULL, 'default', true)
      ON CONFLICT (slug) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS clientes;`);
  }
}
