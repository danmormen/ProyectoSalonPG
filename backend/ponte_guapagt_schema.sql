-- ══════════════════════════════════════════════════════════════════════════════
-- PonteGuapa GT — 
--
SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. USUARIOS
-- Contiene clientes, estilistas y admins. El campo rol distingue entre ellos.
-- requiere_cambio = 1 obliga al empleado a cambiar la contraseña en el primer
-- login. soft-delete mediante activo = 0 cuando tiene historial de citas.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id               INT           NOT NULL AUTO_INCREMENT,
  nombre           VARCHAR(150)  NOT NULL,
  email            VARCHAR(150)  NOT NULL,
  password         VARCHAR(255)  NOT NULL,
  telefono         VARCHAR(20)   NULL,
  rol              ENUM('admin','estilista','cliente') NOT NULL DEFAULT 'cliente',
  direccion        VARCHAR(255)  NULL,
  fecha_nacimiento DATE          NULL,
  avatar           VARCHAR(500)  NULL,
  activo           TINYINT(1)    NOT NULL DEFAULT 1,
  requiere_cambio  TINYINT(1)    NOT NULL DEFAULT 0,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ESPECIALIDADES
-- Catálogo de especialidades (ej: Coloración, Corte, Manicure…).
-- activa = 0 para deshabilitar sin borrar el historial.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS especialidades (
  id       INT          NOT NULL AUTO_INCREMENT,
  nombre   VARCHAR(100) NOT NULL,
  activa   TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_esp_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EMPLEADO_ESPECIALIDADES  (pivot)
-- Un estilista puede tener varias especialidades. Se reconstruye completo
-- en cada edición (DELETE + INSERT) para reflejar la selección exacta del admin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleado_especialidades (
  empleado_id    INT NOT NULL,
  especialidad_id INT NOT NULL,
  PRIMARY KEY (empleado_id, especialidad_id),
  CONSTRAINT fk_ee_empleado    FOREIGN KEY (empleado_id)    REFERENCES usuarios(id)       ON DELETE CASCADE,
  CONSTRAINT fk_ee_especialidad FOREIGN KEY (especialidad_id) REFERENCES especialidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SERVICIOS
-- Catálogo de servicios del salón. especialidad_id vincula el servicio con
-- la especialidad requerida para filtar qué estilistas pueden realizarlo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS servicios (
  id              INT            NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(150)   NOT NULL,
  descripcion     TEXT           NULL,
  duracion        INT            NOT NULL COMMENT 'Minutos',
  precio          DECIMAL(10,2)  NOT NULL,
  categoria       VARCHAR(100)   NULL,
  imagen          VARCHAR(500)   NULL,
  activo          TINYINT(1)     NOT NULL DEFAULT 1,
  especialidad_id INT            NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_srv_especialidad FOREIGN KEY (especialidad_id) REFERENCES especialidades(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PROMOCIONES
-- Precio especial sobre un servicio con vigencia de fechas.
-- limite_usos = NULL significa sin límite. usos_actuales se incrementa
-- automáticamente al crear una cita con esta promo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promociones (
  id             INT           NOT NULL AUTO_INCREMENT,
  titulo         VARCHAR(200)  NOT NULL,
  descripcion    TEXT          NULL,
  servicio_id    INT           NOT NULL,
  precio_especial DECIMAL(10,2) NOT NULL,
  fecha_inicio   DATE          NOT NULL,
  fecha_fin      DATE          NOT NULL,
  limite_usos    INT           NULL,
  usos_actuales  INT           NOT NULL DEFAULT 0,
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_promo_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. CITAS
-- Tabla central del sistema. cliente_id es nullable para soportar citas
-- walk-in (presenciales sin cuenta). En ese caso los datos del cliente se
-- guardan en cliente_externo_nombre / cliente_externo_telefono.
-- motivo_cancelacion y cancelado_por se rellenan solo al cancelar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citas (
  id                       INT           NOT NULL AUTO_INCREMENT,
  cliente_id               INT           NULL,
  cliente_externo_nombre   VARCHAR(150)  NULL,
  cliente_externo_telefono VARCHAR(20)   NULL,
  estilista_id             INT           NOT NULL,
  fecha                    DATE          NOT NULL,
  hora                     TIME          NOT NULL,
  estado                   ENUM('pendiente','confirmada','completada','cancelada') NOT NULL DEFAULT 'pendiente',
  notas                    TEXT          NULL,
  precio_total             DECIMAL(10,2) NOT NULL DEFAULT 0,
  motivo_cancelacion       TEXT          NULL,
  cancelado_por            VARCHAR(50)   NULL,
  resena_disponible_hasta  DATETIME      NULL,
  recordatorio_12h         TINYINT(1)    NOT NULL DEFAULT 0,
  recordatorio_2h          TINYINT(1)    NOT NULL DEFAULT 0,
  created_at               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_citas_fecha        (fecha),
  INDEX idx_citas_estilista    (estilista_id),
  INDEX idx_citas_cliente      (cliente_id),
  INDEX idx_citas_estado       (estado),
  CONSTRAINT fk_cita_cliente   FOREIGN KEY (cliente_id)   REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_cita_estilista FOREIGN KEY (estilista_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. CITAS_SERVICIOS  (pivot)
-- Una cita puede incluir varios servicios. precio_momento guarda el precio
-- del servicio al momento de agendar para que cambios futuros no alteren
-- el historial de citas pasadas.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citas_servicios (
  id              INT           NOT NULL AUTO_INCREMENT,
  cita_id         INT           NOT NULL,
  servicio_id     INT           NOT NULL,
  precio_momento  DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cita_servicio (cita_id, servicio_id),
  CONSTRAINT fk_cs_cita     FOREIGN KEY (cita_id)     REFERENCES citas(id)     ON DELETE CASCADE,
  CONSTRAINT fk_cs_servicio FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. DIAS_BLOQUEADOS
-- Días especiales o cerrados del salón. tipo='cerrado' bloquea totalmente el día.
-- tipo='horario_especial' restringe los slots disponibles al rango hora_inicio-hora_fin.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dias_bloqueados (
  id          INT           NOT NULL AUTO_INCREMENT,
  fecha       DATE          NOT NULL,
  tipo        ENUM('cerrado','horario_especial') NOT NULL DEFAULT 'cerrado',
  hora_inicio TIME          NULL,
  hora_fin    TIME          NULL,
  motivo      VARCHAR(255)  NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dia_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EMPLEADOS_HORARIOS_SEMANA
-- Horario semanal de cada empleado. semana_inicio es siempre el lunes (DATE).
-- La clave única (empleado_id, semana_inicio, dia_semana) permite UPSERT con
-- ON DUPLICATE KEY UPDATE para reasignar el horario de una semana concreta.
-- Para saber si un estilista trabaja un día se busca el MAX(semana_inicio) <= fecha.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empleados_horarios_semana (
  id            INT          NOT NULL AUTO_INCREMENT,
  empleado_id   INT          NOT NULL,
  semana_inicio DATE         NOT NULL,
  dia_semana    VARCHAR(20)  NOT NULL COMMENT 'Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo',
  hora_inicio   TIME         NULL,
  hora_fin      TIME         NULL,
  es_descanso   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_emp_semana_dia (empleado_id, semana_inicio, dia_semana),
  INDEX idx_emp_semana (empleado_id, semana_inicio),
  INDEX idx_semana_dia (semana_inicio, dia_semana),
  CONSTRAINT fk_ehs_empleado FOREIGN KEY (empleado_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. CATALOGO_RECOMPENSAS
-- Premio que el cliente puede canjear por sus puntos acumulados.
-- activo = 0 desactiva la recompensa sin borrarla del historial de canjes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogo_recompensas (
  id                INT           NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(200)  NOT NULL,
  descripcion       TEXT          NULL,
  puntos_requeridos INT           NOT NULL,
  activo            TINYINT(1)    NOT NULL DEFAULT 1,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. PUNTOS_USUARIO
-- Una fila por cliente con su saldo actual de puntos (no historial).
-- Se suma 1 punto por cada Q1 de precio_total al completar una cita.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS puntos_usuario (
  id          INT NOT NULL AUTO_INCREMENT,
  usuario_id  INT NOT NULL,
  puntos      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_puntos_usuario (usuario_id),
  CONSTRAINT fk_pu_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. HISTORIAL_PUNTOS
-- Registro de cada movimiento de puntos (ganados o canjeados).
-- Permite al cliente ver de qué cita provienen sus puntos.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS historial_puntos (
  id          INT          NOT NULL AUTO_INCREMENT,
  usuario_id  INT          NOT NULL,
  puntos      INT          NOT NULL,
  tipo        ENUM('ganados','canjeados') NOT NULL,
  descripcion VARCHAR(255) NULL,
  cita_id     INT          NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_hp_usuario (usuario_id),
  CONSTRAINT fk_hp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_hp_cita    FOREIGN KEY (cita_id)    REFERENCES citas(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. CANJES_RECOMPENSAS
-- Registro de cada vez que un cliente canjea una recompensa del catálogo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canjes_recompensas (
  id             INT       NOT NULL AUTO_INCREMENT,
  usuario_id     INT       NOT NULL,
  recompensa_id  INT       NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_canjes_usuario    (usuario_id),
  INDEX idx_canjes_recompensa (recompensa_id),
  CONSTRAINT fk_cr_usuario    FOREIGN KEY (usuario_id)    REFERENCES usuarios(id)           ON DELETE CASCADE,
  CONSTRAINT fk_cr_recompensa FOREIGN KEY (recompensa_id) REFERENCES catalogo_recompensas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. NOTIFICACIONES  (sistema — correos masivos del admin)
-- Historial de campañas de correo enviadas desde el panel de administración.
-- usuario_id = el admin que envió. destinatarios y enviados son strings/int
-- de resumen para mostrar en el historial.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones (
  id           INT          NOT NULL AUTO_INCREMENT,
  usuario_id   INT          NULL,
  titulo       VARCHAR(255) NOT NULL,
  mensaje      TEXT         NOT NULL,
  tipo         ENUM('sistema','recordatorio','confirmacion') NOT NULL DEFAULT 'sistema',
  imagen_url   VARCHAR(500) NULL,
  destinatarios VARCHAR(200) NULL,
  enviados     INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. NOTIFICACIONES_ESTILISTA  (notificaciones internas del panel del estilista)
-- Se crea una fila cada vez que se agenda, confirma o cancela una cita.
-- leida = 0 muestra el badge de notificación en el navbar del estilista.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificaciones_estilista (
  id           INT          NOT NULL AUTO_INCREMENT,
  estilista_id INT          NOT NULL,
  tipo         ENUM('nueva-cita','cancelada','confirmada','recordatorio','resena') NOT NULL,
  titulo       VARCHAR(255) NOT NULL,
  mensaje      TEXT         NOT NULL,
  leida        TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ne_estilista (estilista_id),
  CONSTRAINT fk_ne_estilista FOREIGN KEY (estilista_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. RESENAS
-- Una cita = máximo una reseña (UNIQUE en cita_id).
-- La ventana de 5 días se controla con resena_disponible_hasta en citas.
-- puntuacion va de 1 a 5.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resenas (
  id            INT       NOT NULL AUTO_INCREMENT,
  cita_id       INT       NOT NULL,
  cliente_id    INT       NOT NULL,
  estilista_id  INT       NOT NULL,
  puntuacion    TINYINT   NOT NULL COMMENT '1-5',
  comentario    TEXT      NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resena_cita (cita_id),
  INDEX idx_resena_estilista (estilista_id),
  CONSTRAINT fk_res_cita      FOREIGN KEY (cita_id)      REFERENCES citas(id)    ON DELETE CASCADE,
  CONSTRAINT fk_res_cliente   FOREIGN KEY (cliente_id)   REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_res_estilista FOREIGN KEY (estilista_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- FIN DEL ESQUEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- Tablas creadas (16):
--   usuarios, especialidades, empleado_especialidades,
--   servicios, promociones,
--   citas, citas_servicios,
--   dias_bloqueados, empleados_horarios_semana,
--   catalogo_recompensas, puntos_usuario, historial_puntos, canjes_recompensas,
--   notificaciones, notificaciones_estilista,
--   resenas
-- ══════════════════════════════════════════════════════════════════════════════
