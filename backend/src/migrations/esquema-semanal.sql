-- ══════════════════════════════════════════════════════════════════
-- PonteGuapa — Migración: horarios por semana + días bloqueados
-- Ejecutar en MySQL: mysql -u root -p ponte_guapagt < esquema-semanal.sql
-- ══════════════════════════════════════════════════════════════════

-- ── Tabla de días especiales / feriados ──────────────────────────
-- (Si ya existe, este bloque no hace nada)
CREATE TABLE IF NOT EXISTS dias_bloqueados (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  fecha       DATE NOT NULL UNIQUE,
  tipo        ENUM('cerrado','horario_especial') NOT NULL DEFAULT 'cerrado',
  hora_inicio TIME NULL,
  hora_fin    TIME NULL,
  motivo      VARCHAR(255) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Nueva tabla: horarios por semana específica ──────────────────
-- Cada fila representa UN día de UNA semana concreta para UN empleado.
-- semana_inicio es siempre el LUNES de esa semana (DATE).
-- La clave única (empleado_id, semana_inicio, dia_semana) garantiza
-- que no haya duplicados y permite UPSERT con ON DUPLICATE KEY UPDATE.
CREATE TABLE IF NOT EXISTS empleados_horarios_semana (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  empleado_id   INT NOT NULL,
  semana_inicio DATE NOT NULL,
  dia_semana    VARCHAR(20) NOT NULL,
  hora_inicio   TIME NULL,
  hora_fin      TIME NULL,
  es_descanso   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_emp_semana_dia (empleado_id, semana_inicio, dia_semana),
  INDEX idx_emp_semana (empleado_id, semana_inicio),
  INDEX idx_semana_dia (semana_inicio, dia_semana)
);
