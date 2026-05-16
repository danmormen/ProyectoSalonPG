const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Todas las rutas requieren token válido.
router.use(protect);

// ══════════════════════════════════════════════════════════════════
// GET /api/especialidades
// Lista todas las especialidades activas.
// Accesible por cualquier usuario autenticado (admin, estilista, cliente)
// porque el frontend la necesita para mostrar checkboxes al crear
// empleados y para filtrar servicios en la vista del cliente.
// ══════════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  db.query(
    'SELECT * FROM especialidades ORDER BY nombre ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener especialidades.' });
      res.json(rows);
    }
  );
});

// A partir de aquí solo el administrador puede escribir.
router.use(adminOnly);

// ══════════════════════════════════════════════════════════════════
// POST /api/especialidades
// Crea una nueva especialidad en el catálogo.
// El nombre debe ser único (UNIQUE en la tabla).
// ══════════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const { nombre } = req.body;
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  db.query(
    'INSERT INTO especialidades (nombre) VALUES (?)',
    [nombre.trim()],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Ya existe una especialidad con ese nombre.' });
        }
        return res.status(500).json({ error: 'Error al crear la especialidad.' });
      }
      res.status(201).json({ message: 'Especialidad creada.', id: result.insertId });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/especialidades/:id
// Actualiza el nombre y/o el estado activo de una especialidad.
// Desactivar (activa=0) es el equivalente a un borrado lógico:
// la especialidad deja de aparecer en los formularios pero sigue
// existiendo en el historial de estilistas que ya la tenían asignada.
// ══════════════════════════════════════════════════════════════════
router.put('/:id', (req, res) => {
  const { nombre, activa } = req.body;
  if (!nombre?.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  db.query(
    'UPDATE especialidades SET nombre = ?, activa = ? WHERE id = ?',
    [nombre.trim(), activa !== undefined ? (activa ? 1 : 0) : 1, req.params.id],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Ya existe una especialidad con ese nombre.' });
        }
        return res.status(500).json({ error: 'Error al actualizar la especialidad.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Especialidad no encontrada.' });
      }
      res.json({ message: 'Especialidad actualizada.' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/especialidades/:id
// Desactiva la especialidad (borrado lógico, activa = 0).
// No se elimina físicamente para preservar la integridad referencial
// con empleado_especialidades y para que el historial no pierda sentido.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  db.query(
    'UPDATE especialidades SET activa = 0 WHERE id = ?',
    [req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'Error al desactivar la especialidad.' });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Especialidad no encontrada.' });
      }
      res.json({ message: 'Especialidad desactivada.' });
    }
  );
});

module.exports = router;
