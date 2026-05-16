-- ============================================================
-- Migración: Walk-in appointments (clientes sin cuenta)
-- Ejecutar UNA sola vez con: mysql -u root -p ponte_guapagt < migracion_walk_in.sql
-- ============================================================

-- 1. Hacer nullable cliente_id para que las citas walk-in no necesiten usuario
ALTER TABLE citas MODIFY COLUMN cliente_id INT NULL;

-- 2. Agregar columnas para datos del cliente externo (walk-in)
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS cliente_externo_nombre   VARCHAR(150) NULL AFTER cliente_id,
  ADD COLUMN IF NOT EXISTS cliente_externo_telefono VARCHAR(20)  NULL AFTER cliente_externo_nombre;
