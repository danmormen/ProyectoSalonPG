-- ══════════════════════════════════════════════════════════════════
-- Migración: sistema de recordatorios automáticos por correo
-- Ejecutar UNA SOLA VEZ en la base de datos del proyecto.
-- ══════════════════════════════════════════════════════════════════

-- Columnas para rastrear qué recordatorios ya se enviaron.
-- El cron job las marca a 1 después de enviar cada correo
-- para no mandar el mismo recordatorio dos veces.
ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS recordatorio_12h TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recordatorio_2h  TINYINT(1) NOT NULL DEFAULT 0;
