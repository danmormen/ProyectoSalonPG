const express  = require('express');
const router   = express.Router();
const db       = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// GET /api/servicios
// Pública — no requiere token.
// Devuelve todos los servicios con el nombre de su especialidad
// (LEFT JOIN para no excluir servicios sin especialidad asignada aún).
// El admin ve activos e inactivos; el cliente filtra por activo en el frontend.
// ══════════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const sql = `
    SELECT s.*, e.nombre AS especialidad_nombre
    FROM servicios s
    LEFT JOIN especialidades e ON e.id = s.especialidad_id
    ORDER BY s.categoria, s.nombre ASC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener servicios:', err);
      return res.status(500).json({ error: 'Error al obtener la lista.' });
    }
    res.json(results);
  });
});

// A partir de aquí todas las operaciones de escritura requieren
// estar autenticado como administrador.
router.use(protect, adminOnly);

// ══════════════════════════════════════════════════════════════════
// POST /api/servicios
// Crea un nuevo servicio en el catálogo.
// nombre, duracion y precio son obligatorios. El resto es opcional.
// especialidad_id vincula el servicio a una especialidad para que el
// sistema pueda filtrar qué estilistas pueden realizarlo.
// ══════════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const { nombre, descripcion, duracion, precio, categoria, imagen, especialidad_id } = req.body;

  if (!nombre || !duracion || !precio) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  const sql = `
    INSERT INTO servicios (nombre, descripcion, duracion, precio, categoria, imagen, especialidad_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [nombre, descripcion || null, duracion, precio, categoria || null, imagen || null, especialidad_id || null],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Error al crear.', detalle: err.message });
      res.status(201).json({ message: 'Creado', id: result.insertId });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/servicios/:id
// Actualiza todos los campos de un servicio existente, incluyendo
// especialidad_id para mantener la vinculación con la especialidad.
// El campo activo permite activar o desactivar el servicio sin eliminarlo.
// ══════════════════════════════════════════════════════════════════
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, duracion, precio, categoria, imagen, activo, especialidad_id } = req.body;

  const sql = `
    UPDATE servicios
    SET nombre=?, descripcion=?, duracion=?, precio=?, categoria=?,
        imagen=?, activo=?, especialidad_id=?
    WHERE id=?
  `;

  db.query(
    sql,
    [nombre, descripcion || null, duracion, precio, categoria || null,
     imagen || null, activo, especialidad_id || null, id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar.', detalle: err.message });
      res.json({ message: 'Actualizado' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/servicios/:id
// Si el servicio nunca fue usado en citas → eliminación permanente.
// Si tiene citas asociadas → desactivación (activo = 0) para
// preservar el historial sin dejarlo disponible para nuevas reservas.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Verificar si el servicio tiene citas asociadas
  db.query('SELECT COUNT(*) AS total FROM citas_servicios WHERE servicio_id = ?', [id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al verificar el servicio.' });

    const enUso = (rows[0]?.total || 0) > 0;

    if (enUso) {
      // Tiene historial → solo desactivar
      db.query('UPDATE servicios SET activo = 0 WHERE id = ?', [id], (err2) => {
        if (err2) return res.status(500).json({ error: 'Error al desactivar el servicio.' });
        res.json({ message: 'desactivado', info: 'El servicio tiene citas asociadas y fue desactivado en lugar de eliminado.' });
      });
    } else {
      // Sin historial → eliminar permanentemente
      db.query('DELETE FROM servicios WHERE id = ?', [id], (err2) => {
        if (err2) return res.status(500).json({ error: 'Error al eliminar el servicio.' });
        res.json({ message: 'eliminado' });
      });
    }
  });
});

module.exports = router;
