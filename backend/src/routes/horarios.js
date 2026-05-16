const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/** Devuelve el lunes de la semana que contiene la fecha dada (ISO YYYY-MM-DD) */
function getLunes(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00');
  const dia = d.getDay(); // 0=Dom, 1=Lun … 6=Sáb
  const offset = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + offset);
  return d.toISOString().substring(0, 10);
}

/** Fuerza que una fecha (Date o string) se devuelva como 'YYYY-MM-DD' */
function isoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  return String(v).substring(0, 10);
}

const ORDEN_DIAS = [
  'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'
];

// ══════════════════════════════════════════════════════════════════
// GET /api/horarios/mi-horario
// Devuelve TODAS las semanas programadas del empleado autenticado,
// ordenadas de más reciente a más antigua.
// Cada semana incluye sus 7 días (o los que estén guardados).
// ══════════════════════════════════════════════════════════════════
router.get('/mi-horario', protect, (req, res) => {
  const empleadoId = req.user.id;

  const sql = `
    SELECT
      DATE_FORMAT(semana_inicio, '%Y-%m-%d') AS semana_inicio,
      dia_semana, hora_inicio, hora_fin, es_descanso
    FROM empleados_horarios_semana
    WHERE empleado_id = ?
    ORDER BY semana_inicio DESC,
      FIELD(dia_semana, 'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')
  `;

  db.query(sql, [empleadoId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Aún no tienes semanas programadas.' });
    }

    // Agrupar por semana_inicio
    const semanaMap = {};
    rows.forEach(row => {
      const s = row.semana_inicio;
      if (!semanaMap[s]) semanaMap[s] = [];
      semanaMap[s].push({
        dia:      row.dia_semana,
        inicio:   row.hora_inicio ? String(row.hora_inicio).substring(0,5) : null,
        fin:      row.hora_fin    ? String(row.hora_fin).substring(0,5)    : null,
        descanso: row.es_descanso === 1 || row.es_descanso === true
      });
    });

    // Ordenar semanas de más reciente a más antigua, calcular stats
    const semanas = Object.keys(semanaMap)
      .sort((a, b) => b.localeCompare(a))
      .map(s => {
        const horarios = semanaMap[s];
        const labs = horarios.filter(h => !h.descanso);
        let totalH = 0;
        labs.forEach(h => {
          if (h.inicio && h.fin) {
            const [h1, m1] = h.inicio.split(':').map(Number);
            const [h2, m2] = h.fin.split(':').map(Number);
            const diff = (h2 - h1) + (m2 - m1) / 60;
            if (diff > 0) totalH += diff;
          }
        });
        return {
          semana_inicio:   s,
          diasLaborables:  labs.length,
          diasDescanso:    horarios.length - labs.length,
          horasTotal:      Math.round(totalH * 10) / 10,
          horarios
        };
      });

    res.json(semanas);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/horarios
// Devuelve todos los empleados activos con sus semanas programadas.
// Usado por el admin para pintar el calendario bimensual.
// ══════════════════════════════════════════════════════════════════
router.get('/', protect, (req, res) => {
  // Primero traemos usuarios (estilistas y admins)
  const sqlUsuarios = `
    SELECT id, nombre, email, rol
    FROM usuarios
    WHERE rol IN ('estilista','admin') AND activo = 1
    ORDER BY nombre
  `;

  db.query(sqlUsuarios, (err, usuarios) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!usuarios.length) return res.json([]);

    const ids = usuarios.map(u => u.id);

    // Traemos todas las semanas de esos empleados
    const sqlHorarios = `
      SELECT
        empleado_id,
        DATE_FORMAT(semana_inicio, '%Y-%m-%d') AS semana_inicio,
        dia_semana, hora_inicio, hora_fin, es_descanso
      FROM empleados_horarios_semana
      WHERE empleado_id IN (?)
      ORDER BY semana_inicio ASC,
        FIELD(dia_semana, 'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado')
    `;

    db.query(sqlHorarios, [ids], (err2, horarios) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Indexar: empleado_id → semana_inicio → [horarios]
      const empMap = {};
      horarios.forEach(row => {
        const eid = row.empleado_id;
        const s   = row.semana_inicio;
        if (!empMap[eid]) empMap[eid] = {};
        if (!empMap[eid][s]) empMap[eid][s] = [];
        empMap[eid][s].push({
          dia:      row.dia_semana,
          inicio:   row.hora_inicio ? String(row.hora_inicio).substring(0,5) : null,
          fin:      row.hora_fin    ? String(row.hora_fin).substring(0,5)    : null,
          descanso: row.es_descanso === 1 || row.es_descanso === true
        });
      });

      const respuesta = usuarios.map(u => {
        const semanasMap = empMap[u.id] || {};
        const semanas = Object.keys(semanasMap)
          .sort()
          .map(s => ({ semana_inicio: s, horarios: semanasMap[s] }));
        return {
          id:              u.id,
          nombre:          u.nombre,
          email:           u.email,
          rol:             u.rol,
          semanas,
          totalSemanas:    semanas.length
        };
      });

      res.json(respuesta);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/horarios/save
// Guarda o actualiza el horario de UNA semana para un empleado.
// Body: { empleado_id, semana_inicio: 'YYYY-MM-DD', horarios: [...] }
// semana_inicio se normaliza al lunes de esa semana.
// ══════════════════════════════════════════════════════════════════
router.post('/save', protect, adminOnly, (req, res) => {
  const { empleado_id, semana_inicio, horarios } = req.body;

  if (!empleado_id || !semana_inicio || !Array.isArray(horarios)) {
    return res.status(400).json({ error: 'Se requieren empleado_id, semana_inicio y horarios[].' });
  }

  // Siempre guardar normalizado al lunes
  const lunes = getLunes(semana_inicio);

  // Construir filas para un único INSERT masivo con ON DUPLICATE KEY UPDATE
  const upsertSql = `
    INSERT INTO empleados_horarios_semana
      (empleado_id, semana_inicio, dia_semana, hora_inicio, hora_fin, es_descanso)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      hora_inicio = VALUES(hora_inicio),
      hora_fin    = VALUES(hora_fin),
      es_descanso = VALUES(es_descanso)
  `;

  const valores = horarios.map(h => {
    const esDescanso = h.descanso ? 1 : 0;
    const inicio     = (h.descanso || !h.inicio) ? null : h.inicio;
    const fin        = (h.descanso || !h.fin)    ? null : h.fin;
    return [Number(empleado_id), lunes, h.dia, inicio, fin, esDescanso];
  });

  db.query(upsertSql, [valores], (err, result) => {
    if (err) {
      console.error('Error guardando horario semanal:', err);
      return res.status(500).json({ error: 'Error al guardar', details: err.sqlMessage || err.message });
    }
    res.json({ message: 'Horario semanal guardado.', semana_inicio: lunes, filas: result.affectedRows });
  });
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/horarios/:empleadoId/:semanaInicio
// Elimina el horario de una semana específica.
// ══════════════════════════════════════════════════════════════════
router.delete('/:empleadoId/:semanaInicio', protect, adminOnly, (req, res) => {
  const { empleadoId, semanaInicio } = req.params;
  const lunes = getLunes(semanaInicio);

  db.query(
    'DELETE FROM empleados_horarios_semana WHERE empleado_id = ? AND semana_inicio = ?',
    [empleadoId, lunes],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Semana no encontrada.' });
      res.json({ message: 'Semana eliminada.' });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// DELETE /api/horarios/:empleadoId
// Elimina TODAS las semanas de un empleado.
// ══════════════════════════════════════════════════════════════════
router.delete('/:empleadoId', protect, adminOnly, (req, res) => {
  const { empleadoId } = req.params;

  db.query(
    'DELETE FROM empleados_horarios_semana WHERE empleado_id = ?',
    [empleadoId],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Todos los horarios del empleado eliminados.', filas: result.affectedRows });
    }
  );
});

module.exports = router;
