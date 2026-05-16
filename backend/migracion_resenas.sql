-- ══════════════════════════════════════════════════════════════════
-- Migración: sistema de reseñas de clientes
-- Ejecutar UNA SOLA VEZ en la base de datos.
-- ══════════════════════════════════════════════════════════════════

-- 1. Ventana de tiempo para dejar reseña (5 días desde que se completó).
--    Se setea cuando el estilista marca la cita como 'completada'.
--    NULL significa que la cita no está habilitada para reseña todavía.
ALTER TABLE citas
  ADD COLUMN resena_disponible_hasta DATETIME NULL;

-- 2. Tabla de reseñas.
--    cita_id es UNIQUE: una cita = máximo una reseña.
--    El cliente solo puede reseñar citas propias (se valida en el backend).
CREATE TABLE IF NOT EXISTS resenas (
  id            INT          PRIMARY KEY AUTO_INCREMENT,
  cita_id       INT          NOT NULL UNIQUE,
  cliente_id    INT          NOT NULL,
  estilista_id  INT          NOT NULL,
  calificacion  TINYINT      NOT NULL,
  comentario    TEXT         NOT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cita_id)      REFERENCES citas(id)    ON DELETE CASCADE,
  FOREIGN KEY (cliente_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (estilista_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
