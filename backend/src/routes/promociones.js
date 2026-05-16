const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// GET /api/promociones
// Pública — no requiere token.
// Solo devuelve promociones activas, dentro del rango de fechas y
// que aún no hayan agotado su límite de usos.
// Se hace JOIN con servicios para que el cliente vea el nombre del
// servicio incluido en la promo sin necesidad de una segunda petición.
// ══════════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const sql = `
    SELECT
      p.*,
      s.nombre  AS servicio_nombre,
      s.duracion AS servicio_duracion
    FROM promociones p
    LEFT JOIN servicios s ON s.id = p.servicio_id
    ORDER BY p.created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener promociones:', err);
      return res.status(500).json({ error: 'Error al obtener la lista de promociones.' });
    }
    res.json(results);
  });
});

// A partir de aquí requiere autenticación de administrador.
router.use(protect, adminOnly);

// ══════════════════════════════════════════════════════════════════
// POST /api/promociones
// Crea una nueva promoción de tipo "combo" o "precio especial".
// El admin elige el servicio al que aplica y establece el precio
// especial directamente (no un porcentaje). El campo limite_usos
// controla cuántas veces puede usarse esta promo en total;
// null = sin límite. usos_actuales arranca en 0 y se incrementa
// en citas.js cada vez que se agenda con esta promo.
// ══════════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const { titulo, descripcion, servicio_id, precio_especial,
          fecha_inicio, fecha_fin, limite_usos } = req.body;

  if (!titulo || !servicio_id || precio_especial == null || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({
      error: 'Faltan campos obligatorios: título, servicio, precio especial y fechas.'
    });
  }
  if (parseFloat(precio_especial) < 0) {
    return res.status(400).json({ error: 'El precio especial no puede ser negativo.' });
  }

  const sql = `
    INSERT INTO promociones
      (titulo, descripcion, servicio_id, precio_especial, fecha_inicio, fecha_fin, limite_usos, usos_actuales, activo)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
  `;
  db.query(sql,
    [titulo, descripcion || null, servicio_id, precio_especial,
     fecha_inicio, fecha_fin, limite_usos || null],
    (err, result) => {
      if (err) {
        console.error('Error al insertar promoción:', err);
        return res.status(500).json({ error: 'Error al crear la promoción.' });
      }
      res.status(201).json({ message: 'Creado', id: result.insertId });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/promociones/:id
// Actualiza una promoción existente. El campo activo permite
// desactivarla sin borrarla. No se puede bajar usos_actuales
// desde aquí para evitar manipulación del contador.
// ══════════════════════════════════════════════════════════════════
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { titulo, descripcion, servicio_id, precio_especial,
          fecha_inicio, fecha_fin, limite_usos, activo } = req.body;

  if (!titulo || !servicio_id || precio_especial == null || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }

  const sql = `
    UPDATE promociones SET
      titulo=?, descripcion=?, servicio_id=?, precio_especial=?,
      fecha_inicio=?, fecha_fin=?, limite_usos=?, activo=?
    WHERE id=?
  `;
  db.query(sql,
    [titulo, descripcion || null, servicio_id, precio_especial,
     fecha_inicio, fecha_fin, limite_usos || null, activo ?? 1, id],
    (err, result) => {
      if (err) {
        console.error('Error al actualizar promoción:', err);
        return res.status(500).json({ error: 'Error al actualizar la promoción.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Promoción no encontrada.' });
      }
      res.json({ message: 'Actualizado' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/promociones/:id
// Soft delete si fue usada, hard delete si nunca fue usada.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Verificar si la promo fue usada
  db.query(
    'SELECT COUNT(*) AS total FROM citas WHERE promo_id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al verificar promo:', err);
        return res.status(500).json({ error: 'Error al eliminar la promoción.' });
      }

      const fusoUsada = results[0].total > 0;

      if (fusoUsada) {
        // Soft delete: desactivar
        db.query(
          'UPDATE promociones SET activo = 0 WHERE id = ?',
          [id],
          (err2) => {
            if (err2) {
              console.error('Error al desactivar promoción:', err2);
              return res.status(500).json({ error: 'Error al desactivar la promoción.' });
            }
            res.json({ message: 'desactivado' });
          }
        );
      } else {
        // Hard delete: eliminar
        db.query(
          'DELETE FROM promociones WHERE id = ?',
          [id],
          (err2, result) => {
            if (err2) {
              console.error('Error al eliminar promoción:', err2);
              return res.status(500).json({ error: 'Error al eliminar la promoción.' });
            }
            if (result.affectedRows === 0) {
              return res.status(404).json({ error: 'La promoción no existe.' });
            }
            res.json({ message: 'eliminado' });
          }
        );
      }
    }
  );
});

module.exports = router;
