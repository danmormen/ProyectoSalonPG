const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// GET /api/resenas/publicas
// Devuelve todas las reseñas publicadas, ordenadas de más reciente
// a más antigua. No requiere autenticación — cualquier visitante
// puede verlas (y el cliente las ve en su sección de Reseñas).
//
// Se muestra solo el primer nombre del cliente para mantener
// cierta privacidad sin perder el toque personal.
// ══════════════════════════════════════════════════════════════════
router.get('/publicas', (req, res) => {
  const sql = `
    SELECT
      r.id,
      r.puntuacion AS calificacion,
      r.comentario,
      DATE_FORMAT(r.created_at, '%Y-%m-%d') AS fecha,
      SUBSTRING_INDEX(cl.nombre, ' ', 1)    AS cliente,
      e.nombre                               AS estilista,
      GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios
    FROM resenas r
    JOIN usuarios       cl ON cl.id = r.cliente_id
    JOIN citas          c  ON c.id  = r.cita_id
    JOIN usuarios       e  ON e.id  = c.estilista_id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios      s  ON s.id  = cs.servicio_id
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener reseñas.' });
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/resenas/mis-pendientes
// Devuelve las citas del cliente autenticado que:
//   1. Están en estado 'completada'
//   2. Tienen la ventana de reseña abierta (resena_disponible_hasta > NOW())
//   3. Todavía no han sido reseñadas (no existe fila en resenas para esa cita)
//
// El cliente ve estas citas en su pantalla de Reseñas con el botón
// "Dejar Reseña" activo. Pasados los 5 días desaparecen solos.
// ══════════════════════════════════════════════════════════════════
router.get('/mis-pendientes', protect, (req, res) => {
  const clienteId = req.user.id;

  const sql = `
    SELECT
      c.id,
      c.fecha,
      c.hora,
      c.resena_disponible_hasta,
      e.nombre AS estilista,
      GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios
    FROM citas c
    JOIN usuarios        e  ON e.id  = c.estilista_id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios       s  ON s.id  = cs.servicio_id
    WHERE c.cliente_id = ?
      AND c.estado = 'completada'
      AND c.resena_disponible_hasta > NOW()
      AND NOT EXISTS (
        SELECT 1 FROM resenas r WHERE r.cita_id = c.id
      )
    GROUP BY c.id
    ORDER BY c.resena_disponible_hasta ASC
  `;

  db.query(sql, [clienteId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener citas pendientes de reseña.' });
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/resenas/mi-historial
// Reseñas que el cliente autenticado ya ha enviado.
// Se muestran en la misma pantalla para que el cliente sepa cuáles
// citas ya reseñó y pueda ver lo que escribió.
// ══════════════════════════════════════════════════════════════════
router.get('/mi-historial', protect, (req, res) => {
  const clienteId = req.user.id;

  const sql = `
    SELECT
      r.id,
      r.puntuacion AS calificacion,
      r.comentario,
      DATE_FORMAT(r.created_at, '%Y-%m-%d') AS fecha,
      e.nombre AS estilista,
      GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios
    FROM resenas r
    JOIN citas          c  ON c.id  = r.cita_id
    JOIN usuarios       e  ON e.id  = c.estilista_id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios      s  ON s.id  = cs.servicio_id
    WHERE r.cliente_id = ?
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [clienteId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener tu historial de reseñas.' });
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/resenas
// El cliente autenticado envía una reseña para una de sus citas.
//
// Validaciones:
//   1. La cita existe y pertenece al cliente.
//   2. La cita está en estado 'completada'.
//   3. La ventana de reseña sigue abierta (resena_disponible_hasta > NOW()).
//   4. Aún no existe una reseña para esa cita (UNIQUE en cita_id lo garantiza
//      en BD, pero verificamos antes para devolver un mensaje claro).
//   5. calificacion está entre 1 y 5.
//   6. comentario no está vacío.
// ══════════════════════════════════════════════════════════════════
router.post('/', protect, (req, res) => {
  const clienteId = req.user.id;
  const { cita_id, calificacion, comentario } = req.body;

  if (!cita_id || !calificacion || !comentario?.trim()) {
    return res.status(400).json({ error: 'Se requieren cita_id, calificacion y comentario.' });
  }
  if (calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: 'La calificación debe ser entre 1 y 5.' });
  }

  // Verificar que la cita le pertenece al cliente, está completada y la ventana está abierta.
  const sqlCita = `
    SELECT id, estilista_id, estado, resena_disponible_hasta
    FROM citas
    WHERE id = ? AND cliente_id = ?
  `;
  db.query(sqlCita, [cita_id, clienteId], (err, rows) => {
    if (err)               return res.status(500).json({ error: 'Error al verificar la cita.' });
    if (rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });

    const cita = rows[0];

    if (cita.estado !== 'completada') {
      return res.status(400).json({ error: 'Solo puedes reseñar citas completadas.' });
    }
    if (!cita.resena_disponible_hasta || new Date(cita.resena_disponible_hasta) < new Date()) {
      return res.status(400).json({ error: 'El plazo para dejar reseña en esta cita ha vencido.' });
    }

    // Verificar que no existe reseña previa.
    db.query('SELECT id FROM resenas WHERE cita_id = ?', [cita_id], (err2, previas) => {
      if (err2) return res.status(500).json({ error: 'Error al verificar reseña previa.' });
      if (previas.length > 0) {
        return res.status(409).json({ error: 'Ya enviaste una reseña para esta cita.' });
      }

      // Insertar la reseña.
      db.query(
        `INSERT INTO resenas (cita_id, cliente_id, puntuacion, comentario)
         VALUES (?, ?, ?, ?)`,
        [cita_id, clienteId, calificacion, comentario.trim()],
        (err3, result) => {
          if (err3) return res.status(500).json({ error: 'Error al guardar la reseña.' });
          res.status(201).json({ message: '¡Reseña enviada! Gracias por tu opinión.', id: result.insertId });
        }
      );
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/resenas/mi-perfil-estilista
// Para el estilista autenticado devuelve:
//   - promedio de puntuación (redondeado a 1 decimal)
//   - total de reseñas
//   - distribución por estrella (1-5)
//   - lista completa de reseñas con datos del cliente y servicio
// ══════════════════════════════════════════════════════════════════
router.get('/mi-perfil-estilista', protect, (req, res) => {
  const estilistaId = req.user.id;

  const sqlStats = `
    SELECT
      COUNT(*)                              AS total,
      ROUND(AVG(r.puntuacion), 1)           AS promedio,
      SUM(r.puntuacion = 5)                 AS cinco,
      SUM(r.puntuacion = 4)                 AS cuatro,
      SUM(r.puntuacion = 3)                 AS tres,
      SUM(r.puntuacion = 2)                 AS dos,
      SUM(r.puntuacion = 1)                 AS uno
    FROM resenas r
    JOIN citas c ON c.id = r.cita_id
    WHERE c.estilista_id = ?
  `;

  db.query(sqlStats, [estilistaId], (err, statsRows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener estadísticas.' });

    const stats  = statsRows[0];
    const total  = parseInt(stats.total) || 0;
    const pct    = (n) => total > 0 ? Math.round((parseInt(n) || 0) / total * 100) : 0;

    const distribucion = [
      { nivel: 5, cantidad: parseInt(stats.cinco)  || 0, porcentaje: pct(stats.cinco)  },
      { nivel: 4, cantidad: parseInt(stats.cuatro) || 0, porcentaje: pct(stats.cuatro) },
      { nivel: 3, cantidad: parseInt(stats.tres)   || 0, porcentaje: pct(stats.tres)   },
      { nivel: 2, cantidad: parseInt(stats.dos)    || 0, porcentaje: pct(stats.dos)    },
      { nivel: 1, cantidad: parseInt(stats.uno)    || 0, porcentaje: pct(stats.uno)    },
    ];

    const sqlResenas = `
      SELECT
        r.id,
        r.puntuacion AS calificacion,
        r.comentario,
        DATE_FORMAT(r.created_at, '%Y-%m-%d') AS fecha,
        SUBSTRING_INDEX(cl.nombre, ' ', 1)    AS cliente,
        GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios
      FROM resenas r
      JOIN usuarios        cl ON cl.id = r.cliente_id
      JOIN citas           c  ON c.id  = r.cita_id
      JOIN citas_servicios cs ON cs.cita_id = c.id
      JOIN servicios       s  ON s.id = cs.servicio_id
      WHERE c.estilista_id = ?
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `;

    db.query(sqlResenas, [estilistaId], (err2, resenas) => {
      if (err2) return res.status(500).json({ error: 'Error al obtener reseñas.' });

      res.json({
        promedio:     parseFloat(stats.promedio) || 0,
        total,
        distribucion,
        resenas
      });
    });
  });
});

module.exports = router;
