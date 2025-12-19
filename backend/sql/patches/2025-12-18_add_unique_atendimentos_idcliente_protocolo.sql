-- 2025-12-18
-- Garante que um protocolo não "vaze" entre municípios (multi-tenant)
-- e evita duplicidade de protocolo dentro do mesmo cliente.
--
-- ⚠️ Antes de aplicar, verifique se já existem duplicidades:
--   SELECT idcliente, protocolo, COUNT(*) 
--   FROM atendimentos 
--   WHERE protocolo IS NOT NULL 
--   GROUP BY idcliente, protocolo
--   HAVING COUNT(*) > 1;
--
-- Se houver duplicidades, corrija/merge antes de criar o índice.

CREATE UNIQUE INDEX IF NOT EXISTS uq_atendimentos_idcliente_protocolo
ON atendimentos (idcliente, protocolo)
WHERE protocolo IS NOT NULL;
