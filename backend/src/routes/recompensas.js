const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// GET /api/recompensas
// Pública — no requiere token.
// Devuelve el catálogo ordenado por puntos_requeridos ascendente
// para que la recompensa más accesible aparezca primero en la app.
// ══════════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const sql = 'SELECT * FROM catalogo_recompensas ORDER BY puntos_requeridos ASC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error al obtener recompensas:', err);
      return res.status(500).json({ error: 'Error al obtener las recompensas.' });
    }
    res.json(results);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/recompensas/mis-puntos
// Solo requiere estar autenticada — no hace falta ser admin.
// Busca el saldo de puntos del usuario en la tabla puntos_usuario.
// Si el usuario nunca ha acumulado puntos, esa tabla no tendrá
// un registro suyo, así que se devuelve 0 en lugar de un error.
// ══════════════════════════════════════════════════════════════════
router.get('/mis-puntos', protect, (req, res) => {
  const usuarioId = req.user.id;

  db.query(
    'SELECT puntos FROM puntos_usuario WHERE usuario_id = ?',
    [usuarioId],
    (err, results) => {
      if (err) {
        console.error('Error al obtener puntos:', err);
        return res.status(500).json({ error: 'Error al obtener los puntos.' });
      }
      const puntos = results.length > 0 ? results[0].puntos : 0;
      res.json({ puntos });
    }
  );
});

// A partir de aquí solo administradores autenticados.
router.use(protect, adminOnly);

// ══════════════════════════════════════════════════════════════════
// POST /api/recompensas
// Crea una nueva recompensa en el catálogo.
// puntos_requeridos debe ser mayor a 0 para que tenga sentido
// como sistema de fidelización. Se valida en el servidor para no
// depender de que el frontend envíe valores correctos.
// ══════════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const { nombre, descripcion, puntos_requeridos } = req.body;

  if (!nombre || !puntos_requeridos) {
    return res.status(400).json({ error: 'El nombre y los puntos requeridos son obligatorios.' });
  }
  if (puntos_requeridos <= 0) {
    return res.status(400).json({ error: 'Los puntos requeridos deben ser mayor a 0.' });
  }

  const sql = 'INSERT INTO catalogo_recompensas (nombre, descripcion, puntos_requeridos) VALUES (?, ?, ?)';
  db.query(sql, [nombre, descripcion, puntos_requeridos], (err, result) => {
    if (err) {
      console.error('Error al crear recompensa:', err);
      return res.status(500).json({ error: 'Error al crear la recompensa.' });
    }
    res.status(201).json({ message: 'Recompensa creada', id: result.insertId });
  });
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/recompensas/admin/puntos
// Permite al admin agregar o quitar puntos a un cliente.
// El parámetro puntos puede ser positivo (sumar) o negativo (restar).
// Math.max(0, ...) garantiza que el saldo nunca quede en negativo,
// independientemente de cuántos puntos se intenten descontar.
// Si el usuario no tiene registro en puntos_usuario todavía,
// se crea uno nuevo con el valor indicado (mínimo 0).
// ══════════════════════════════════════════════════════════════════
router.put('/admin/puntos', (req, res) => {
  const { usuario_id, puntos } = req.body;

  if (!usuario_id || puntos === undefined) {
    return res.status(400).json({ error: 'usuario_id y puntos son obligatorios.' });
  }

  db.query(
    'SELECT id, puntos FROM puntos_usuario WHERE usuario_id = ?',
    [usuario_id],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error en el servidor.' });
      }

      if (results.length > 0) {
        // El cliente ya tiene un saldo registrado — se suma el delta
        const nuevosPuntos = Math.max(0, results[0].puntos + puntos);
        db.query(
          'UPDATE puntos_usuario SET puntos = ? WHERE usuario_id = ?',
          [nuevosPuntos, usuario_id],
          (err) => {
            if (err) return res.status(500).json({ error: 'Error al actualizar puntos.' });
            res.json({ message: 'Puntos actualizados', puntos: nuevosPuntos });
          }
        );
      } else {
        // Primera vez que este cliente acumula puntos — se crea su registro
        const puntosIniciales = Math.max(0, puntos);
        db.query(
          'INSERT INTO puntos_usuario (usuario_id, puntos) VALUES (?, ?)',
          [usuario_id, puntosIniciales],
          (err) => {
            if (err) return res.status(500).json({ error: 'Error al crear puntos.' });
            res.json({ message: 'Puntos creados', puntos: puntosIniciales });
          }
        );
      }
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/recompensas/:id
// Actualiza una recompensa existente.
// El campo activo permite desactivarla sin eliminarla del catálogo.
// Una recompensa inactiva puede seguir mostrándose en el historial
// de canjes pasados aunque ya no esté disponible para canjear.
// ══════════════════════════════════════════════════════════════════
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, puntos_requeridos, activo } = req.body;

  const sql = `UPDATE catalogo_recompensas
               SET nombre = ?, descripcion = ?, puntos_requeridos = ?, activo = ?
               WHERE id = ?`;

  db.query(sql, [nombre, descripcion, puntos_requeridos, activo, id], (err, result) => {
    if (err) {
      console.error('Error al actualizar recompensa:', err);
      return res.status(500).json({ error: 'Error al actualizar la recompensa.' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recompensa no encontrada.' });
    }
    res.json({ message: 'Actualizado' });
  });
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/recompensas/:id
// Si fue canjeada, no se puede eliminar pero se puede desactivar desde edición.
// Si nunca fue canjeada, se elimina permanentemente.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Verificar si fue canjeada
  db.query(
    'SELECT COUNT(*) AS total FROM canjes_recompensas WHERE recompensa_id = ?',
    [id],
    (err, results) => {
      if (err) {
        console.error('Error al verificar canjes:', err);
        return res.status(500).json({ error: 'Error al eliminar la recompensa.' });
      }

      const tieneCanjes = results[0].total > 0;

      if (tieneCanjes) {
        // Tiene canjes: no se puede eliminar
        return res.status(409).json({
          error: 'Esta recompensa tiene canjes registrados y no puede eliminarse. Puedes desactivarla desde el formulario de edición.'
        });
      } else {
        // Sin canjes: eliminar permanentemente
        db.query(
          'DELETE FROM catalogo_recompensas WHERE id = ?',
          [id],
          (err2, result) => {
            if (err2) {
              console.error('Error al eliminar recompensa:', err2);
              return res.status(500).json({ error: 'Error al eliminar la recompensa.' });
            }
            if (result.affectedRows === 0) {
              return res.status(404).json({ error: 'Recompensa no encontrada.' });
            }
            res.json({ message: 'eliminado' });
          }
        );
      }
    }
  );
});

module.exports = router;
