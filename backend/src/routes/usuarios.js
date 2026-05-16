const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const bcrypt  = require('bcryptjs');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Normaliza fechas que vienen del frontend con tiempo incluido ('2000-01-01T00:00:00Z')
// a solo la parte de fecha ('2000-01-01') que es lo que MySQL espera en DATE.
const formatearFecha = (fecha) => {
  if (!fecha) return null;
  if (typeof fecha === 'string' && fecha.includes('T')) {
    return fecha.split('T')[0];
  }
  return fecha;
};

// Helper: parsea los GROUP_CONCAT de especialidades en arrays tipados.
// Reutilizado en GET / y GET /:id para no repetir la lógica.
const parsarEspecialidades = (row) => ({
  ...row,
  especialidades_ids: row.especialidades_ids
    ? row.especialidades_ids.split(',').map(Number)
    : [],
  especialidades_nombres: row.especialidades_nombres
    ? row.especialidades_nombres.split(',')
    : []
});

// Todas las rutas de este módulo requieren token válido.
router.use(protect);

// ══════════════════════════════════════════════════════════════════
// PATCH /api/usuarios/:id/cambiar-password
// Permite cambiar la contraseña de una cuenta.
// Un usuario puede cambiar solo la suya; el admin puede cambiar
// la de cualquiera (útil para soporte o reseteos manuales).
// Al cambiar la contraseña se limpia el flag requiere_cambio,
// lo que le permite al usuario entrar normalmente en el siguiente login.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/cambiar-password', async (req, res) => {
  const { id }       = req.params;
  const { password } = req.body;

  if (req.user.rol !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: 'No tienes permiso para actualizar esta contraseña.' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      'UPDATE usuarios SET password = ?, requiere_cambio = 0 WHERE id = ?',
      [hashedPassword, id],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar la contraseña.' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json({ message: 'Contraseña actualizada correctamente.' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/usuarios/:id/perfil
// Actualiza los datos básicos del perfil: nombre, teléfono y fecha
// de nacimiento. El email queda excluido para evitar que alguien
// cambie su correo a uno ya registrado por otra persona.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/perfil', (req, res) => {
  const { id } = req.params;

  if (req.user.rol !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: 'No tienes permiso para editar este perfil.' });
  }

  const { nombre, telefono, fecha_nacimiento } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio.' });
  }

  const fechaSQL = formatearFecha(fecha_nacimiento);

  db.query(
    'UPDATE usuarios SET nombre = ?, telefono = ?, fecha_nacimiento = ? WHERE id = ?',
    [nombre.trim(), telefono || null, fechaSQL, id],
    (err, result) => {
      if (err) {
        console.error('Error al actualizar perfil:', err);
        return res.status(500).json({ error: 'Error al actualizar el perfil.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado.' });
      }
      res.json({ message: 'Perfil actualizado correctamente.' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// GET /api/usuarios/:id
// Devuelve el perfil de un usuario por su ID incluyendo sus
// especialidades (ids y nombres) obtenidas del pivot.
//
// Esta ruta debe ir ANTES de router.use(adminOnly) porque los
// clientes y estilistas también necesitan consultar su propio perfil.
// ══════════════════════════════════════════════════════════════════
router.get('/:id', (req, res) => {
  const { id } = req.params;

  if (req.user.rol !== 'admin' && req.user.id !== parseInt(id)) {
    return res.status(403).json({ error: 'No tienes permiso para ver este perfil.' });
  }

  const sql = `
    SELECT u.id, u.nombre, u.email, u.telefono, u.rol,
           u.direccion, u.fecha_nacimiento, u.avatar, u.activo, u.requiere_cambio,
           GROUP_CONCAT(ee.especialidad_id ORDER BY e.nombre SEPARATOR ',') AS especialidades_ids,
           GROUP_CONCAT(e.nombre           ORDER BY e.nombre SEPARATOR ',') AS especialidades_nombres
    FROM usuarios u
    LEFT JOIN empleado_especialidades ee ON ee.empleado_id     = u.id
    LEFT JOIN especialidades           e  ON e.id              = ee.especialidad_id
    WHERE u.id = ?
    GROUP BY u.id
  `;

  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener usuario.' });
    if (results.length === 0) return res.status(404).json({ message: 'Usuario no encontrado.' });
    res.json(parsarEspecialidades(results[0]));
  });
});

// Desde aquí todas las rutas son exclusivas del administrador.
router.use(adminOnly);

// ══════════════════════════════════════════════════════════════════
// GET /api/usuarios
// Lista todos los empleados (admin y estilistas) con sus especialidades.
// Las especialidades se obtienen del pivot empleado_especialidades
// y se devuelven como dos arrays paralelos: ids y nombres.
// ══════════════════════════════════════════════════════════════════
router.get('/', (req, res) => {
  const sql = `
    SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.direccion,
           u.fecha_nacimiento, u.avatar, u.activo, u.requiere_cambio, u.created_at,
           GROUP_CONCAT(ee.especialidad_id ORDER BY e.nombre SEPARATOR ',') AS especialidades_ids,
           GROUP_CONCAT(e.nombre           ORDER BY e.nombre SEPARATOR ',') AS especialidades_nombres
    FROM usuarios u
    LEFT JOIN empleado_especialidades ee ON ee.empleado_id  = u.id
    LEFT JOIN especialidades           e  ON e.id           = ee.especialidad_id
    WHERE LOWER(u.rol) IN ('admin', 'estilista')
    GROUP BY u.id
    ORDER BY u.nombre ASC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: 'Error al obtener la lista.' });
    res.json(results.map(parsarEspecialidades));
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/usuarios
// Crea un nuevo empleado desde el panel de administración.
// La contraseña se hashea antes de guardar y requiere_cambio=1
// obliga al empleado a establecer una contraseña propia en su
// primer inicio de sesión.
//
// Si el rol es 'estilista', especialidades es obligatorio (array de ids).
// Después de insertar el usuario, se insertan las filas en el pivot.
// ══════════════════════════════════════════════════════════════════
router.post('/', async (req, res) => {
  const {
    nombre, email, password, telefono,
    rol = 'estilista', especialidades = [],
    direccion, fecha_nacimiento, avatar, activo = 1
  } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  }

  // Los estilistas deben tener al menos una especialidad asignada.
  if (rol === 'estilista' && (!especialidades || especialidades.length === 0)) {
    return res.status(400).json({ error: 'Un estilista debe tener al menos una especialidad.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const fechaSQL       = formatearFecha(fecha_nacimiento);

    const sql = `
      INSERT INTO usuarios
        (nombre, email, password, telefono, rol, direccion, fecha_nacimiento, avatar, activo, requiere_cambio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `;

    db.query(sql, [
      nombre.trim(), email.trim(), hashedPassword,
      telefono || null, rol,
      direccion || null, fechaSQL, avatar || null, activo
    ], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'El correo ya está registrado.' });
        }
        return res.status(500).json({ error: 'Error al guardar el usuario.', detalle: err.message });
      }

      const empleadoId = result.insertId;

      // Si no hay especialidades que guardar, respondemos directamente.
      if (!especialidades || especialidades.length === 0) {
        return res.status(201).json({ message: 'Usuario creado con éxito.', id: empleadoId });
      }

      // Insertar en el pivot empleado_especialidades.
      // VALUES ? acepta un array de arrays: [[emp, esp1], [emp, esp2], ...]
      const pivotValues = especialidades.map(espId => [empleadoId, Number(espId)]);
      db.query(
        'INSERT INTO empleado_especialidades (empleado_id, especialidad_id) VALUES ?',
        [pivotValues],
        (pivotErr) => {
          if (pivotErr) {
            console.error('Error al guardar especialidades del pivot:', pivotErr.message);
            // El usuario quedó creado; avisamos pero no bloqueamos.
          }
          res.status(201).json({ message: 'Usuario creado con éxito.', id: empleadoId });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/usuarios/:id
// Actualización completa de un empleado.
// Actualiza los campos del usuario y luego reemplaza todas las
// especialidades del pivot (DELETE + INSERT) para reflejar la
// selección actual exacta del administrador.
//
// Protección contra quedarse sin administradores:
// Si el admin intenta cambiar el rol de alguien que es admin a otro
// rol, el servidor verifica cuántos admins activos quedan.
// ══════════════════════════════════════════════════════════════════
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const {
    nombre, email, telefono, rol,
    especialidades = [],
    direccion, fecha_nacimiento, avatar, activo
  } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son obligatorios.' });
  }

  // Los estilistas deben tener al menos una especialidad.
  if (rol === 'estilista' && (!especialidades || especialidades.length === 0)) {
    return res.status(400).json({ error: 'Un estilista debe tener al menos una especialidad.' });
  }

  const ROLES_VALIDOS = ['admin', 'estilista', 'cliente'];
  if (rol && !ROLES_VALIDOS.includes(rol.toLowerCase())) {
    return res.status(400).json({ error: `Rol inválido: "${rol}". Debe ser admin, estilista o cliente.` });
  }

  const fechaSQL = formatearFecha(fecha_nacimiento);

  // Actualiza el usuario y luego reemplaza el pivot.
  const ejecutarUpdate = () => {
    db.query(
      `UPDATE usuarios
         SET nombre=?, email=?, telefono=?, rol=?,
             direccion=?, fecha_nacimiento=?, avatar=?, activo=?
       WHERE id=?`,
      [
        nombre.trim(), email.trim(), telefono || null, rol,
        direccion || null, fechaSQL, avatar || null, activo, id
      ],
      (err, result) => {
        if (err) {
          console.error('Error al actualizar usuario id=' + id + ':', err);
          return res.status(500).json({
            error:   'No se pudo actualizar el usuario.',
            detalle: err.message,
            codigo:  err.code
          });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        // Reemplazar especialidades: borrar las actuales e insertar las nuevas.
        db.query(
          'DELETE FROM empleado_especialidades WHERE empleado_id = ?',
          [id],
          (delErr) => {
            if (delErr) {
              console.error('Error al borrar especialidades del pivot:', delErr.message);
              return res.json({ message: 'Usuario actualizado (especialidades sin cambios).' });
            }

            if (!especialidades || especialidades.length === 0) {
              return res.json({ message: 'Usuario actualizado correctamente.' });
            }

            const pivotValues = especialidades.map(espId => [parseInt(id), Number(espId)]);
            db.query(
              'INSERT INTO empleado_especialidades (empleado_id, especialidad_id) VALUES ?',
              [pivotValues],
              (insErr) => {
                if (insErr) {
                  console.error('Error al insertar nuevas especialidades:', insErr.message);
                }
                res.json({ message: 'Usuario actualizado correctamente.' });
              }
            );
          }
        );
      }
    );
  };

  // Solo se necesita la verificación si se está cambiando el rol a algo distinto de admin.
  if (rol && rol.toLowerCase() !== 'admin') {
    db.query(
      `SELECT id FROM usuarios WHERE LOWER(rol) = 'admin' AND activo = 1 AND id != ?`,
      [id],
      (err, admins) => {
        if (err) return res.status(500).json({ error: 'Error al verificar permisos.' });
        if (admins.length === 0) {
          return res.status(400).json({
            error: 'No puedes cambiar el rol de este usuario: es el único administrador activo.'
          });
        }
        ejecutarUpdate();
      }
    );
  } else {
    ejecutarUpdate();
  }
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/usuarios/:id/reactivar
// Reactiva un usuario desactivado.
// Solo admins pueden reactivar usuarios.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/reactivar', (req, res) => {
  const { id } = req.params;
  db.query(
    'UPDATE usuarios SET activo = 1 WHERE id = ?',
    [id],
    (err, result) => {
      if (err) return res.status(500).json({ error: 'No se pudo reactivar el usuario.' });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
      res.json({ message: 'reactivado' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/usuarios/:id
// Soft delete si el usuario tiene citas (como cliente o estilista).
// Hard delete si nunca fue usado.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Verificar si el usuario tiene citas como cliente o como estilista
  db.query(
    'SELECT COUNT(*) AS total FROM citas WHERE cliente_id = ? OR estilista_id = ?',
    [id, id],
    (err, results) => {
      if (err) return res.status(500).json({ error: 'No se pudo eliminar el usuario.' });

      const tieneHistorial = results[0].total > 0;

      if (tieneHistorial) {
        // Soft delete: desactivar
        db.query(
          'UPDATE usuarios SET activo = 0 WHERE id = ?',
          [id],
          (err2) => {
            if (err2) return res.status(500).json({ error: 'No se pudo desactivar el usuario.' });
            res.json({ message: 'desactivado' });
          }
        );
      } else {
        // Hard delete: eliminar permanentemente
        db.query(
          'DELETE FROM usuarios WHERE id = ?',
          [id],
          (err2) => {
            if (err2) return res.status(500).json({ error: 'No se pudo eliminar el usuario.' });
            res.json({ message: 'eliminado' });
          }
        );
      }
    }
  );
});

module.exports = router;
