const express  = require('express');
const router   = express.Router();
const db       = require('../config/DBconfig');
const { protect, estilistaOnly } = require('../middleware/authMiddleware');

// La tabla se crea automáticamente la primera vez que el servidor arranca,
// si aún no existe. Esto evita tener que correr una migración manual cada
// vez que se despliega el proyecto en un entorno nuevo.
// ON DELETE CASCADE significa que si se elimina un usuario de la tabla
// usuarios, sus notificaciones también se borran automáticamente.
const sqlCrearTabla = `
  CREATE TABLE IF NOT EXISTS notificaciones_estilista (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    estilista_id INT NOT NULL,
    tipo         ENUM('nueva-cita','cancelada','confirmada','recordatorio','resena') NOT NULL,
    titulo       VARCHAR(255) NOT NULL,
    mensaje      TEXT NOT NULL,
    leida        TINYINT DEFAULT 0,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (estilista_id) REFERENCES usuarios(id) ON DELETE CASCADE
  )
`;
db.query(sqlCrearTabla, err => {
  if (err) console.error('Error creando tabla notificaciones_estilista:', err.message);
});

// Todas las rutas de este módulo requieren estar autenticado como
// estilista o admin. protect valida el token y estilistaOnly
// verifica que el rol sea el correcto.
router.use(protect, estilistaOnly);

// IMPORTANTE — orden de rutas:
// Las rutas con segmentos fijos (/marcar-todas, /borrar-todas) deben
// declararse ANTES de las rutas con parámetro (/:id). Si se declaran
// después, Express interpreta el string como el valor de :id y nunca
// llega a ejecutar la lógica correcta.

// ══════════════════════════════════════════════════════════════════
// GET /api/notif-estilista/mis-notificaciones
// Devuelve las últimas 50 notificaciones del estilista autenticado,
// ordenadas de más reciente a más antigua. El límite de 50 evita
// devolver un payload gigante si el estilista lleva mucho tiempo activo.
// ══════════════════════════════════════════════════════════════════
router.get('/mis-notificaciones', (req, res) => {
  db.query(
    `SELECT id, tipo, titulo, mensaje, leida, created_at
     FROM notificaciones_estilista
     WHERE estilista_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener notificaciones.' });
      res.json(rows);
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// GET /api/notif-estilista/sin-leer
// Devuelve solo el conteo de notificaciones no leídas.
// El navbar del estilista llama este endpoint al cargar para saber
// si debe mostrar el badge rojo sobre el icono de campana.
// Se devuelve un objeto { total } para que el frontend lo acceda directamente.
// ══════════════════════════════════════════════════════════════════
router.get('/sin-leer', (req, res) => {
  db.query(
    'SELECT COUNT(*) AS total FROM notificaciones_estilista WHERE estilista_id = ? AND leida = 0',
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al contar.' });
      res.json({ total: rows[0].total });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/notif-estilista/marcar-todas
// Marca todas las notificaciones del estilista como leídas en una
// sola consulta. Se usa cuando el estilista presiona el botón
// "Marcar todas como leídas" en la pantalla de notificaciones.
// ══════════════════════════════════════════════════════════════════
router.patch('/marcar-todas', (req, res) => {
  db.query(
    'UPDATE notificaciones_estilista SET leida = 1 WHERE estilista_id = ?',
    [req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar.' });
      res.json({ ok: true });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/notif-estilista/borrar-todas
// Elimina todas las notificaciones del estilista autenticado.
// El filtro por estilista_id garantiza que un estilista no pueda
// borrar las notificaciones de otro aunque manipule la petición.
// ══════════════════════════════════════════════════════════════════
router.delete('/borrar-todas', (req, res) => {
  db.query(
    'DELETE FROM notificaciones_estilista WHERE estilista_id = ?',
    [req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al eliminar.' });
      res.json({ ok: true });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/notif-estilista/:id/leer
// Marca una sola notificación como leída.
// La condición AND estilista_id = ? es necesaria para que el
// estilista no pueda marcar como leída una notificación de otro
// pasando un id arbitrario en la URL.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/leer', (req, res) => {
  db.query(
    'UPDATE notificaciones_estilista SET leida = 1 WHERE id = ? AND estilista_id = ?',
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar.' });
      res.json({ ok: true });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/notif-estilista/:id
// Elimina una notificación específica.
// Mismo principio que el PATCH anterior: se filtra también por
// estilista_id para que nadie pueda eliminar lo que no es suyo.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  db.query(
    'DELETE FROM notificaciones_estilista WHERE id = ? AND estilista_id = ?',
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al eliminar.' });
      res.json({ ok: true });
    }
  );
});

module.exports = router;
