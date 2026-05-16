const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// dias-bloqueados.js
//
// Gestiona los días especiales / feriados del salón.
// El administrador puede bloquear una fecha completa (tipo = 'cerrado')
// o indicar que ese día trabajan con un horario distinto al habitual
// (tipo = 'horario_especial', con hora_inicio y hora_fin).
//
// El frontend de reservas consulta este endpoint para:
//   1. Pintar en gris los días cerrados en el calendario.
//   2. Reducir los slots disponibles si es horario especial.
//
// Estructura de la tabla:
//   CREATE TABLE dias_bloqueados (
//     id          INT AUTO_INCREMENT PRIMARY KEY,
//     fecha       DATE NOT NULL UNIQUE,
//     tipo        ENUM('cerrado','horario_especial') NOT NULL DEFAULT 'cerrado',
//     hora_inicio TIME NULL,
//     hora_fin    TIME NULL,
//     motivo      VARCHAR(255) NULL,
//     created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//   );
// ══════════════════════════════════════════════════════════════════

// ── GET /api/dias-bloqueados ─────────────────────────────────────
// Devuelve todos los días bloqueados.
// Query param opcional: ?mes=YYYY-MM  → filtra solo ese mes.
// Sin autenticación para que el cliente pueda consultar antes de loguearse.
router.get('/', (req, res) => {
  const { mes } = req.query;
  // DATE_FORMAT asegura que la fecha llegue como string 'YYYY-MM-DD'
  // sin problemas de zona horaria (mysql2 puede devolverla como objeto Date).
  let sql    = `SELECT id, DATE_FORMAT(fecha,'%Y-%m-%d') AS fecha, tipo,
                  hora_inicio, hora_fin, motivo, created_at
                FROM dias_bloqueados`;
  const params = [];

  if (mes) {
    // mes viene como 'YYYY-MM'; LIKE 'YYYY-MM-%' cubre todos los días del mes.
    sql += ' WHERE fecha LIKE ?';
    params.push(`${mes}-%`);
  }

  sql += ' ORDER BY fecha ASC';

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Error GET /api/dias-bloqueados:', err.message);
      return res.status(500).json({ error: 'Error al obtener días bloqueados.' });
    }
    res.json(rows);
  });
});

// ── Rutas de administrador ───────────────────────────────────────
// A partir de aquí se requiere token de administrador.
router.use(protect, adminOnly);

// ── POST /api/dias-bloqueados ────────────────────────────────────
// Crea un nuevo día bloqueado.
// Body: { fecha, tipo, hora_inicio?, hora_fin?, motivo? }
router.post('/', (req, res) => {
  const { fecha, tipo, hora_inicio, hora_fin, motivo } = req.body;

  if (!fecha || !tipo) {
    return res.status(400).json({ error: 'Los campos fecha y tipo son obligatorios.' });
  }
  if (!['cerrado', 'horario_especial'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido. Usa "cerrado" o "horario_especial".' });
  }
  if (tipo === 'horario_especial' && (!hora_inicio || !hora_fin)) {
    return res.status(400).json({ error: 'Para horario especial debes indicar hora_inicio y hora_fin.' });
  }

  const sql = `
    INSERT INTO dias_bloqueados (fecha, tipo, hora_inicio, hora_fin, motivo)
    VALUES (?, ?, ?, ?, ?)
  `;
  const params = [fecha, tipo, hora_inicio || null, hora_fin || null, motivo || null];

  db.query(sql, params, (err, result) => {
    if (err) {
      // Código 1062 = UNIQUE constraint: la fecha ya existe.
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ya existe un registro para esa fecha. Usa PUT para editarlo.' });
      }
      console.error('Error POST /api/dias-bloqueados:', err.message);
      return res.status(500).json({ error: 'Error al guardar el día bloqueado.' });
    }
    res.status(201).json({ message: 'Día bloqueado creado.', id: result.insertId });
  });
});

// ── PUT /api/dias-bloqueados/:id ─────────────────────────────────
// Actualiza un día bloqueado existente.
// Body: { fecha?, tipo?, hora_inicio?, hora_fin?, motivo? }
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { fecha, tipo, hora_inicio, hora_fin, motivo } = req.body;

  if (tipo && !['cerrado', 'horario_especial'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido. Usa "cerrado" o "horario_especial".' });
  }

  const sql = `
    UPDATE dias_bloqueados
    SET fecha       = COALESCE(?, fecha),
        tipo        = COALESCE(?, tipo),
        hora_inicio = ?,
        hora_fin    = ?,
        motivo      = COALESCE(?, motivo)
    WHERE id = ?
  `;
  // hora_inicio y hora_fin pueden ser null intencional (si cambian a 'cerrado')
  const params = [
    fecha  || null,
    tipo   || null,
    hora_inicio !== undefined ? hora_inicio : null,
    hora_fin    !== undefined ? hora_fin    : null,
    motivo || null,
    id
  ];

  db.query(sql, params, (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ya existe un registro para esa fecha.' });
      }
      console.error('Error PUT /api/dias-bloqueados/:id:', err.message);
      return res.status(500).json({ error: 'Error al actualizar el día bloqueado.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }
    res.json({ message: 'Día bloqueado actualizado.' });
  });
});

// ── DELETE /api/dias-bloqueados/:id ─────────────────────────────
// Elimina un día bloqueado (desbloquea la fecha).
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM dias_bloqueados WHERE id = ?', [id], (err, result) => {
    if (err) {
      console.error('Error DELETE /api/dias-bloqueados/:id:', err.message);
      return res.status(500).json({ error: 'Error al eliminar el día bloqueado.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro no encontrado.' });
    }
    res.json({ message: 'Día desbloqueado correctamente.' });
  });
});

module.exports = router;
