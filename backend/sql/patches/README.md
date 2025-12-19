# Patches SQL

Este diretório contém *patches* SQL para aplicar no Postgres quando `synchronize: false`.

## 2025-12-18
- `2025-12-18_add_unique_atendimentos_idcliente_protocolo.sql`
  - Cria índice UNIQUE parcial em `(idcliente, protocolo)` quando `protocolo IS NOT NULL`.
  - Objetivo: evitar duplicidade e impedir consulta de protocolo "atravessar" municípios.

> Dica: sempre rode primeiro a consulta de duplicidade indicada no arquivo antes de aplicar o índice.
