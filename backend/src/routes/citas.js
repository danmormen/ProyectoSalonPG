const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly, estilistaOnly } = require('../middleware/authMiddleware');
const { enviarConfirmacionCita } = require('../config/emailServices');

// JavaScript devuelve el día de la semana como un número (0 = domingo, 6 = sábado).
// Este array lo convierte al nombre en español que usamos en la tabla empleados_horarios,
// donde los días están guardados como texto ('Lunes', 'Martes', etc.).
// Sin esto tendríamos que hacer conversiones en SQL o en el cliente, que es más frágil.
const DIAS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// Devuelve el lunes (semana_inicio) de la semana que contiene fechaStr 'YYYY-MM-DD'.
// Necesario para filtrar empleados_horarios_semana por la semana correcta y no por
// cualquier semana histórica donde el estilista trabajaba ese día.
function getLunes(fechaStr) {
  const d   = new Date(fechaStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Dom … 6=Sáb
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().substring(0, 10);
}

// ══════════════════════════════════════════════════════════════════
// notificarEstilista
// Inserta una notificación interna para el estilista afectado.
// Se llama en tres momentos: cuando se agenda una cita nueva, cuando
// la cancela el cliente o el admin, y cuando se confirma.
//
// El patrón fire-and-forget (sin await ni callback que afecte la respuesta)
// es intencional: si la notificación falla no queremos que el cliente
// vea un error. Lo que importa es que la cita quedó guardada. El
// error se imprime en la consola del servidor para debug.
// ══════════════════════════════════════════════════════════════════
function notificarEstilista(estilistaId, tipo, titulo, mensaje) {
  const sql = `
    INSERT INTO notificaciones_estilista (estilista_id, tipo, titulo, mensaje)
    VALUES (?, ?, ?, ?)
  `;
  db.query(sql, [estilistaId, tipo, titulo, mensaje], err => {
    if (err) console.error('Error al insertar notificacion estilista:', err.message);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS PÚBLICAS
// No requieren token. Son las que el cliente ve antes de iniciar sesión
// para saber qué estilistas hay disponibles.
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/estilistas
// Lista de todos los estilistas activos sin filtrar por fecha.
// Es el fallback que se usa cuando el usuario todavía no ha elegido
// una fecha, o cuando se necesita mostrar el catálogo completo de
// personal. El filtro por disponibilidad real está en la ruta de abajo.
// ══════════════════════════════════════════════════════════════════
router.get('/estilistas', (req, res) => {
  const sql = `
    SELECT u.id, u.nombre,
           GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ') AS especialidades
    FROM usuarios u
    LEFT JOIN empleado_especialidades ee ON ee.empleado_id  = u.id
    LEFT JOIN especialidades           e  ON e.id           = ee.especialidad_id
    WHERE LOWER(u.rol) = 'estilista' AND u.activo = 1
    GROUP BY u.id
    ORDER BY u.nombre ASC
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener estilistas.' });
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/estilistas-walk-in?fecha=YYYY-MM-DD&servicios=1,2,3
//
// Devuelve los estilistas que:
//   1. Trabajan ese día de la semana (empleados_horarios_semana)
//   2. Tienen TODAS las especialidades requeridas por los servicios indicados
//
// Si un servicio no tiene especialidad_id asignada se ignora ese requisito.
// Si ningún servicio tiene especialidad, se devuelven todos los que trabajan ese día.
// Requiere token válido (estilista o admin).
// ══════════════════════════════════════════════════════════════════
router.get('/estilistas-walk-in', protect, (req, res) => {
  const { fecha, servicios } = req.query;
  if (!fecha || !servicios) {
    return res.status(400).json({ error: 'Se requieren fecha y servicios.' });
  }

  const servicioIds = String(servicios).split(',').map(Number).filter(n => n > 0);
  if (servicioIds.length === 0) {
    return res.status(400).json({ error: 'servicios debe ser una lista de IDs válidos.' });
  }

  const [y, m, d] = fecha.split('-').map(Number);
  const diaSemana    = DIAS_ES[new Date(y, m - 1, d).getDay()];
  const semanaInicio = getLunes(fecha);   // lunes de la semana solicitada

  // ── Paso 1: obtener especialidades únicas requeridas por los servicios ──
  const placeholders = servicioIds.map(() => '?').join(',');
  db.query(
    `SELECT DISTINCT especialidad_id FROM servicios
     WHERE id IN (${placeholders}) AND especialidad_id IS NOT NULL`,
    servicioIds,
    (err, espRows) => {
      if (err) return res.status(500).json({ error: 'Error al obtener especialidades de los servicios.' });

      const especialidadIds   = espRows.map(r => r.especialidad_id);
      const totalEsp          = especialidadIds.length;

      // ── Paso 2: estilistas que trabajan ese día (de esa semana exacta) ─
      // Usamos el MAX(semana_inicio) <= semanaInicio para obtener el horario
      // más reciente asignado. Si ese horario tiene es_descanso = 1 el
      // estilista NO aparece, aunque en semanas pasadas haya trabajado ese día.
      const condEsp = totalEsp > 0
        ? `AND (
              SELECT COUNT(DISTINCT ee2.especialidad_id)
              FROM empleado_especialidades ee2
              WHERE ee2.empleado_id = u.id
                AND ee2.especialidad_id IN (${especialidadIds.map(() => '?').join(',')})
            ) = ?`
        : '';

      const sql = `
        SELECT u.id, u.nombre,
               GROUP_CONCAT(DISTINCT e.nombre ORDER BY e.nombre SEPARATOR ', ') AS especialidades
        FROM usuarios u
        LEFT JOIN empleado_especialidades ee ON ee.empleado_id = u.id
        LEFT JOIN especialidades           e  ON e.id          = ee.especialidad_id
        WHERE LOWER(u.rol) = 'estilista'
          AND u.activo = 1
          AND EXISTS (
            SELECT 1 FROM empleados_horarios_semana h
            WHERE h.empleado_id   = u.id
              AND h.dia_semana    = ?
              AND h.semana_inicio = (
                SELECT MAX(h2.semana_inicio)
                FROM empleados_horarios_semana h2
                WHERE h2.empleado_id   = u.id
                  AND h2.dia_semana    = ?
                  AND h2.semana_inicio <= ?
              )
              AND h.es_descanso = 0
          )
          ${condEsp}
        GROUP BY u.id
        ORDER BY u.nombre ASC
      `;

      const params = totalEsp > 0
        ? [diaSemana, diaSemana, semanaInicio, ...especialidadIds, totalEsp]
        : [diaSemana, diaSemana, semanaInicio];

      db.query(sql, params, (err2, rows) => {
        if (err2) return res.status(500).json({ error: 'Error al obtener estilistas.', debug: err2.message });
        res.json(rows);
      });
    }
  );
});

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/slots-disponibles?fecha=YYYY-MM-DD&estilista_id=X&servicio_id=Y
// Devuelve los slots de 30 minutos que siguen libres para la combinación
// fecha + estilista + servicio. El frontend lo llama cada vez que cambia
// cualquiera de esos tres valores para actualizar el select de hora.
//
// La lógica de intervalos:
//   bloque = CEIL(duracion / 30) * 30   ← redondea al siguiente slot de 30 min
//   Ej: 45 min → bloque = 60   |   30 min → bloque = 30   |   90 min → bloque = 90
//
// Dos citas se solapan si: A.inicio < B.fin  Y  B.inicio < A.fin
// (cualquier superposición parcial es conflicto)
// ══════════════════════════════════════════════════════════════════
router.get('/slots-disponibles', (req, res) => {
  // duracion_total: opcional — si viene, omite la consulta al servicio y usa ese valor directamente.
  // Útil cuando se seleccionan múltiples servicios y el frontend suma las duraciones.
  const { fecha, estilista_id, servicio_id, duracion_total } = req.query;
  if (!fecha || !estilista_id || (!servicio_id && !duracion_total)) {
    return res.status(400).json({ error: 'Se requieren fecha, estilista_id y servicio_id (o duracion_total).' });
  }

  const TODOS_SLOTS = [
    9*60, 9*60+30, 10*60, 10*60+30, 11*60, 11*60+30,
    12*60, 12*60+30, 13*60, 13*60+30, 14*60, 14*60+30,
    15*60, 15*60+30, 16*60, 16*60+30, 17*60, 17*60+30,
    18*60, 18*60+30, 19*60, 19*60+30
  ];
  function horaAMin(h) { const p = String(h).split(':').map(Number); return p[0]*60+p[1]; }
  function bloque(dur) { return Math.ceil(dur / 30) * 30; }

  // Calcula y devuelve los slots disponibles dado un tamaño de bloque ya conocido
  function responderSlots(bloqueNueva) {
    const sql = `
      SELECT c.hora, s.duracion
      FROM citas c
      JOIN citas_servicios cs ON cs.cita_id = c.id
      JOIN servicios        s  ON s.id = cs.servicio_id
      WHERE c.estilista_id = ?
        AND c.fecha = ?
        AND c.estado NOT IN ('cancelada')
    `;
    db.query(sql, [estilista_id, fecha], (err, citas) => {
      if (err) return res.status(500).json({ error: 'Error al consultar disponibilidad.' });

      const bloques = citas.map(c => {
        const ini = horaAMin(c.hora);
        return { inicio: ini, fin: ini + bloque(c.duracion) };
      });

      let disponibles = TODOS_SLOTS.filter(slotMin => {
        const slotFin = slotMin + bloqueNueva;
        return !bloques.some(b => slotMin < b.fin && b.inicio < slotFin);
      });

      const ahora    = new Date();
      const fechaHoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
      if (fecha === fechaHoy) {
        const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
        disponibles = disponibles.filter(slotMin => slotMin > minutosAhora);
      }

      res.json(disponibles.map(min => {
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }));
    });
  }

  // Si viene duracion_total, usarla directamente sin consultar la BD
  if (duracion_total && Number(duracion_total) > 0) {
    return responderSlots(bloque(Number(duracion_total)));
  }

  // Caso normal: obtener duración desde el servicio
  db.query('SELECT duracion FROM servicios WHERE id = ? AND activo = 1', [servicio_id], (err, servicios) => {
    if (err)                    return res.status(500).json({ error: 'Error al consultar el servicio.' });
    if (servicios.length === 0) return res.status(404).json({ error: 'Servicio no encontrado o inactivo.' });
    responderSlots(bloque(servicios[0].duracion));
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/estilistas-disponibles?fecha=YYYY-MM-DD
// Devuelve solo los estilistas que tienen horario asignado ese día
// y cuyo día no está marcado como descanso.
//
// La fecha viene como string, así que se separa en year/month/day
// antes de construir el objeto Date para evitar el desfase de zona
// horaria que ocurre con 'new Date("2025-06-15")' directamente
// (que lo interpreta como UTC y puede retroceder un día en zonas negativas).
//
// El JOIN con empleados_horarios filtra estilistas que tienen
// ese día de la semana como laborable, garantizando que el cliente
// no pueda elegir un estilista que descansa ese día.
// ══════════════════════════════════════════════════════════════════
router.get('/estilistas-disponibles', (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'Se requiere el parámetro fecha.' });

  // Se construye el Date con year, month, day por separado para que
  // JavaScript lo trate como hora local y no como UTC.
  const [y, m, d]  = fecha.split('-').map(Number);
  const diaSemana  = DIAS_ES[new Date(y, m - 1, d).getDay()];

  const sql = `
    SELECT DISTINCT u.id, u.nombre,
           GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ') AS especialidades
    FROM usuarios u
    JOIN empleados_horarios h ON h.empleado_id = u.id
    LEFT JOIN empleado_especialidades ee ON ee.empleado_id = u.id
    LEFT JOIN especialidades           e  ON e.id          = ee.especialidad_id
    WHERE LOWER(u.rol) = 'estilista'
      AND u.activo    = 1
      AND h.dia_semana = ?
      AND h.es_descanso = 0
    GROUP BY u.id
    ORDER BY u.nombre ASC
  `;
  db.query(sql, [diaSemana], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener estilistas disponibles.' });
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/disponibilidad-completa?fecha=YYYY-MM-DD&servicio_id=X
//
// Endpoint principal del nuevo flujo de reserva cinema-style.
// Devuelve TODOS los estilistas disponibles ese día junto con la lista
// de slots libres para el servicio indicado, ya filtrando:
//   1. Días bloqueados (cerrado → [] vacío; horario_especial → slots recortados)
//   2. Si el estilista trabaja ese día de la semana (empleados_horarios)
//   3. Traslapes con citas existentes del estilista
//   4. Slots pasados si la fecha es hoy
//
// Respuesta: [ { id, nombre, especialidad, foto, slots: ['09:00', '09:30', …] } ]
// Solo se incluyen estilistas con al menos 1 slot disponible.
// ══════════════════════════════════════════════════════════════════
router.get('/disponibilidad-completa', (req, res) => {
  const { fecha, servicio_id } = req.query;
  if (!fecha || !servicio_id) {
    return res.status(400).json({ error: 'Se requieren fecha y servicio_id.' });
  }

  // ── Helpers ──────────────────────────────────────────────────────
  // Genera todos los slots de 30 min entre dos horas (en minutos)
  // p.ej. slotsEnRango(540, 1080) → [540,570,600,...,1050]
  function slotsEnRango(inicioMin, finMin) {
    const slots = [];
    for (let s = inicioMin; s < finMin; s += 30) slots.push(s);
    return slots;
  }
  function horaAMin(h) {
    const p = String(h).split(':').map(Number);
    return p[0] * 60 + p[1];
  }
  function minAHora(min) {
    return `${String(Math.floor(min / 60)).padStart(2,'0')}:${String(min % 60).padStart(2,'0')}`;
  }
  function bloque(dur) {
    return Math.ceil(dur / 30) * 30;
  }
  function slotsLibres(citasEstilista, bloqueServicio, slotsTotales) {
    const bloques = citasEstilista.map(c => {
      const ini = horaAMin(c.hora);
      return { inicio: ini, fin: ini + bloque(c.duracion) };
    });
    return slotsTotales.filter(slotMin => {
      const slotFin = slotMin + bloqueServicio;
      return !bloques.some(b => slotMin < b.fin && b.inicio < slotFin);
    });
  }

  // ── Paso 1: verificar si la fecha está bloqueada ─────────────────
  db.query('SELECT * FROM dias_bloqueados WHERE fecha = ?', [fecha], (err, bloqueados) => {
    if (err) {
      console.error('disponibilidad-completa [paso1]:', err.message);
      return res.status(500).json({ error: 'Error paso1 (dias_bloqueados)', debug: err.message });
    }

    const diaBloqueado = bloqueados[0] || null;
    if (diaBloqueado && diaBloqueado.tipo === 'cerrado') return res.json([]);

    // Rango global del salón (puede ser restringido por día especial)
    let salonIniMin = 9 * 60;   // 09:00
    let salonFinMin = 20 * 60;  // 20:00 — límite máximo absoluto
    if (diaBloqueado && diaBloqueado.tipo === 'horario_especial') {
      salonIniMin = horaAMin(diaBloqueado.hora_inicio);
      salonFinMin = horaAMin(diaBloqueado.hora_fin);
    }

    // ── Paso 2: filtrar slots pasados si es hoy (hora Guatemala) ────
    // Se usa offset fijo UTC-6 para no depender del TZ del servidor.
    const ahoraUTC   = Date.now();
    const ahoraGT    = new Date(ahoraUTC - 6 * 60 * 60 * 1000); // UTC-6
    const fechaHoyGT = [
      ahoraGT.getUTCFullYear(),
      String(ahoraGT.getUTCMonth() + 1).padStart(2,'0'),
      String(ahoraGT.getUTCDate()).padStart(2,'0')
    ].join('-');
    const minutosAhoraGT = fecha === fechaHoyGT
      ? ahoraGT.getUTCHours() * 60 + ahoraGT.getUTCMinutes()
      : -1;

    // ── Paso 3: duracion + especialidad del servicio ─────────────────
    db.query(
      'SELECT duracion, especialidad_id FROM servicios WHERE id = ? AND activo = 1',
      [servicio_id],
      (err, srvRows) => {
        if (err) {
          console.error('disponibilidad-completa [paso3]:', err.message);
          return res.status(500).json({ error: 'Error paso3 (servicios)', debug: err.message });
        }
        if (!srvRows || srvRows.length === 0) {
          return res.status(404).json({ error: 'Servicio no encontrado o inactivo.' });
        }
        const bloqueServicio  = bloque(srvRows[0].duracion);
        const especialidad_id = srvRows[0].especialidad_id ?? null;

        // ── Paso 4: estilistas con horario ese día ───────────────────
        // JOIN directo con empleados_horarios_semana para obtener
        // hora_inicio y hora_fin de cada estilista en ese día concreto.
        const [y, m, d]    = fecha.split('-').map(Number);
        const diaSemana    = DIAS_ES[new Date(y, m - 1, d).getDay()];
        const semanaInicio = getLunes(fecha);

        const joinHorario = `
          JOIN empleados_horarios_semana h_act ON h_act.empleado_id = u.id
            AND h_act.dia_semana    = ?
            AND h_act.semana_inicio = (
              SELECT MAX(h2.semana_inicio)
              FROM empleados_horarios_semana h2
              WHERE h2.empleado_id   = u.id
                AND h2.dia_semana    = ?
                AND h2.semana_inicio <= ?
            )
            AND h_act.es_descanso = 0
        `;

        const sqlEstilistas = especialidad_id
          ? `
            SELECT u.id, u.nombre,
                   GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ') AS especialidades,
                   h_act.hora_inicio, h_act.hora_fin
            FROM usuarios u
            ${joinHorario}
            LEFT JOIN empleado_especialidades ee ON ee.empleado_id = u.id
            LEFT JOIN especialidades          e  ON e.id = ee.especialidad_id
            WHERE LOWER(u.rol) = 'estilista'
              AND u.activo = 1
              AND EXISTS (
                SELECT 1 FROM empleado_especialidades ee2
                WHERE ee2.empleado_id = u.id AND ee2.especialidad_id = ?
              )
            GROUP BY u.id, h_act.hora_inicio, h_act.hora_fin
            ORDER BY u.nombre ASC
          `
          : `
            SELECT u.id, u.nombre,
                   GROUP_CONCAT(e.nombre ORDER BY e.nombre SEPARATOR ', ') AS especialidades,
                   h_act.hora_inicio, h_act.hora_fin
            FROM usuarios u
            ${joinHorario}
            LEFT JOIN empleado_especialidades ee ON ee.empleado_id = u.id
            LEFT JOIN especialidades          e  ON e.id = ee.especialidad_id
            WHERE LOWER(u.rol) = 'estilista'
              AND u.activo = 1
            GROUP BY u.id, h_act.hora_inicio, h_act.hora_fin
            ORDER BY u.nombre ASC
          `;

        const paramsEstilistas = especialidad_id
          ? [diaSemana, diaSemana, semanaInicio, especialidad_id]
          : [diaSemana, diaSemana, semanaInicio];

        console.log('[disponibilidad-completa] paso4 → diaSemana:', diaSemana, '| especialidad_id:', especialidad_id);
        db.query(sqlEstilistas, paramsEstilistas, (err3, estilistas) => {
          if (err3) {
            console.error('disponibilidad-completa [paso4]:', err3.message);
            return res.status(500).json({ error: 'Error paso4 (estilistas)', debug: err3.message });
          }
          console.log('[disponibilidad-completa] estilistas:', estilistas.length, estilistas.map(e => e.nombre));
          if (estilistas.length === 0) return res.json([]);

          // ── Paso 5: citas del día ────────────────────────────────
          const ids = estilistas.map(e => e.id);
          const sqlCitas = `
            SELECT c.estilista_id, c.hora, s.duracion
            FROM citas c
            JOIN citas_servicios cs ON cs.cita_id = c.id
            JOIN servicios        s  ON s.id = cs.servicio_id
            WHERE c.estilista_id IN (?)
              AND c.fecha = ?
              AND c.estado NOT IN ('cancelada')
          `;
          db.query(sqlCitas, [ids, fecha], (err4, citasDia) => {
            if (err4) {
              console.error('disponibilidad-completa [paso5]:', err4.message);
              return res.status(500).json({ error: 'Error paso5 (citas)', debug: err4.message });
            }

            const citasPorEstilista = {};
            for (const cita of citasDia) {
              if (!citasPorEstilista[cita.estilista_id]) citasPorEstilista[cita.estilista_id] = [];
              citasPorEstilista[cita.estilista_id].push(cita);
            }

            // ── Paso 6: armar slots por estilista ───────────────────
            // Cada estilista tiene su propio rango hora_inicio–hora_fin.
            // Solo se exponen slots donde slot + bloqueServicio <= hora_fin.
            const resultado = [];
            for (const est of estilistas) {
              const estIniMin = Math.max(horaAMin(est.hora_inicio), salonIniMin);
              const estFinMin = Math.min(horaAMin(est.hora_fin),    salonFinMin);

              // Slots posibles: cualquier slot que EMPIECE dentro del turno.
              // Si el servicio termina después de hora_fin no importa —
              // lo que no se permite es AGENDAR después de hora_fin.
              let slotsEst = slotsEnRango(estIniMin, estFinMin);

              // Quitar slots pasados si es hoy
              if (minutosAhoraGT >= 0) {
                slotsEst = slotsEst.filter(s => s > minutosAhoraGT);
              }

              const citasEst = citasPorEstilista[est.id] || [];
              const libres   = slotsLibres(citasEst, bloqueServicio, slotsEst);

              if (libres.length > 0) {
                resultado.push({
                  id:             est.id,
                  nombre:         est.nombre,
                  especialidades: est.especialidades || null,
                  foto:           null,
                  slots:          libres.map(minAHora)
                });
              }
            }
            res.json(resultado);
          }); // fin paso5
        }); // fin paso4
      }
    ); // fin paso3
  }); // fin paso1
}); // fin router.get

// ─────────────────────────────────────────────────────────────────────────────
// A PARTIR DE AQUÍ REQUIERE AUTENTICACIÓN
// protect valida el JWT y carga req.user con id, nombre, email y rol.
// ─────────────────────────────────────────────────────────────────────────────
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS DE CLIENTE
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/mis-citas
// Historial completo de citas del cliente autenticado.
//
// GROUP_CONCAT agrupa los nombres de los servicios en un solo campo
// separado por coma. Esto permite manejar el caso (futuro) donde
// una cita tenga más de un servicio sin cambiar la estructura de respuesta.
// El ORDER BY dentro del GROUP_CONCAT garantiza que los servicios
// siempre salgan en el mismo orden, lo que importa cuando también
// se concatenan las duraciones en paralelo (ambos usan el mismo criterio).
// ══════════════════════════════════════════════════════════════════
router.get('/mis-citas', (req, res) => {
  const clienteId = req.user.id;
  const sql = `
    SELECT
      c.id,
      c.fecha,
      c.hora,
      c.estado,
      c.notas,
      c.precio_total,
      c.created_at,
      e.nombre      AS estilista_nombre,
      GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios,
      GROUP_CONCAT(s.duracion ORDER BY s.nombre SEPARATOR ', ') AS duraciones
    FROM citas c
    JOIN usuarios  e  ON c.estilista_id = e.id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios s  ON cs.servicio_id  = s.id
    WHERE c.cliente_id = ?
    GROUP BY c.id
    ORDER BY c.fecha DESC, c.hora DESC
  `;
  db.query(sql, [clienteId], (err, rows) => {
    if (err) {
      console.error('Error mis-citas:', err);
      return res.status(500).json({ error: 'Error al obtener citas.' });
    }
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/citas
// Agenda una nueva cita para el cliente autenticado.
//
// El flujo tiene 7 pasos encadenados como callbacks porque la conexión
// usa mysql2 en modo callback (no promesas). El orden importa:
//
//   1. Verificar que el servicio existe y está activo (para tener el precio).
//   2. Comprobar que el estilista no tenga otra cita en ese mismo slot.
//   3. Insertar la cita con estado 'pendiente' y precio fijo (precio_momento).
//   4. Insertar el detalle en citas_servicios (tabla intermedia).
//   5. Responder al cliente con 201 — todo lo que viene después no bloquea.
//   6. Enviar el correo de confirmación de forma asíncrona (.catch para no romper).
//   7. Registrar la notificación interna para el estilista.
//
// El precio se guarda en el momento del agendado (precio_momento) para que
// si luego cambia el precio del servicio, las citas antiguas reflejen
// lo que el cliente realmente pagó o acordó pagar.
// ══════════════════════════════════════════════════════════════════
router.post('/', (req, res) => {
  const clienteId = req.user.id;
  const { estilista_id, fecha, hora, servicio_id, notas, promo_id } = req.body;

  if (!estilista_id || !fecha || !hora || !servicio_id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: estilista, fecha, hora y servicio.' });
  }

  // Paso 1 — Leer el servicio de la BD para obtener precio y duración.
  // No confiamos en lo que venga del frontend para ninguno de los dos valores.
  db.query('SELECT id, nombre, precio, duracion FROM servicios WHERE id = ? AND activo = 1', [servicio_id], (err, servicios) => {
    if (err || servicios.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado o inactivo.' });
    }
    const servicio      = servicios[0];
    let   precioTotal   = parseFloat(servicio.precio);
    const duracionNueva = servicio.duracion;

    // Paso 1b — Si viene promo_id, validar que la promo sea aplicable y
    // usar su precio especial en lugar del precio regular del servicio.
    // Se valida: activo, dentro del rango de fechas, usos_actuales < limite_usos.
    // El precio especial siempre viene de la BD, nunca del frontend.
    const aplicarPromo = (callback) => {
      if (!promo_id) return callback(null);
      const hoy = new Date().toISOString().split('T')[0];
      db.query(
        `SELECT id, precio_especial, limite_usos, usos_actuales
         FROM promociones
         WHERE id = ? AND activo = 1 AND fecha_inicio <= ? AND fecha_fin >= ?`,
        [promo_id, hoy, hoy],
        (err, promos) => {
          if (err)              return callback('Error al verificar la promoción.');
          if (promos.length === 0) return callback('La promoción no está disponible o ha vencido.');
          const promo = promos[0];
          if (promo.limite_usos !== null && promo.usos_actuales >= promo.limite_usos) {
            return callback('Esta promoción ha alcanzado su límite de usos.');
          }
          precioTotal = parseFloat(promo.precio_especial);
          callback(null);
        }
      );
    };

    aplicarPromo((promoError) => {
      if (promoError) return res.status(400).json({ error: promoError });

    // Paso 2 — Detección de conflicto por solapamiento de intervalos, no por hora exacta.
    //
    // bloque = CEIL(duracion / 30) * 30   → redondea al siguiente múltiplo de 30 min
    // Ej: 45 min → bloque 60   |   30 min → bloque 30   |   90 min → bloque 90
    //
    // Dos citas se solapan si: nueva.inicio < existente.fin  Y  existente.inicio < nueva.fin
    // (basta con superposición parcial para ser conflicto)
    //
    // TIME_TO_SEC(hora) / 60 convierte la hora guardada en la BD a minutos desde medianoche
    // para poder comparar numéricamente sin manipulación de strings.
    const sqlConflicto = `
      SELECT c.id FROM citas c
      JOIN citas_servicios cs ON cs.cita_id = c.id
      JOIN servicios        s  ON s.id = cs.servicio_id
      WHERE c.estilista_id = ?
        AND c.fecha = ?
        AND c.estado NOT IN ('cancelada')
        AND (TIME_TO_SEC(?) / 60) < (TIME_TO_SEC(c.hora) / 60 + CEIL(s.duracion / 30.0) * 30)
        AND (TIME_TO_SEC(c.hora) / 60) < (TIME_TO_SEC(?) / 60 + CEIL(? / 30.0) * 30)
    `;
    db.query(sqlConflicto, [estilista_id, fecha, hora, hora, duracionNueva], (err, conflictos) => {
      if (err) return res.status(500).json({ error: 'Error al verificar disponibilidad.' });
      if (conflictos.length > 0) {
        return res.status(409).json({ error: 'El estilista no está disponible en ese horario. Elige otra hora.' });
      }

      // Paso 3 — Se inserta como 'pendiente'. La confirmación la puede hacer
      // el estilista desde su panel, o el cliente si la app lo permite.
      const sqlCita = `
        INSERT INTO citas (cliente_id, estilista_id, fecha, hora, estado, notas, precio_total)
        VALUES (?, ?, ?, ?, 'pendiente', ?, ?)
      `;
      db.query(sqlCita, [clienteId, estilista_id, fecha, hora, notas || null, precioTotal], (err, result) => {
        if (err) {
          console.error('Error al insertar cita:', err);
          return res.status(500).json({ error: 'Error al crear la cita.' });
        }
        const citaId = result.insertId;

        // Paso 4 — citas_servicios es la tabla intermedia que relaciona una cita
        // con uno o más servicios. precio_momento guarda el valor en este instante
        // para no perder la referencia histórica si el servicio sube de precio después.
        const sqlServicio = `
          INSERT INTO citas_servicios (cita_id, servicio_id, precio_momento)
          VALUES (?, ?, ?)
        `;
        db.query(sqlServicio, [citaId, servicio_id, precioTotal], (err) => {
          if (err) {
            console.error('Error al insertar citas_servicios:', err);
            return res.status(500).json({ error: 'Cita creada pero hubo un error al registrar el servicio.' });
          }

          // Paso 5 — La respuesta sale aquí. Todo lo que sigue es trabajo
          // en segundo plano que no debe hacerle esperar al cliente.
          res.status(201).json({
            message:      'Cita agendada con éxito.',
            cita_id:      citaId,
            servicio:     servicio.nombre,
            precio_total: precioTotal
          });

          // Paso 5b — Si la cita usó una promo, incrementar el contador de usos.
          // Fire-and-forget: si falla, la cita ya se creó y ya respondimos 201.
          if (promo_id) {
            db.query(
              'UPDATE promociones SET usos_actuales = usos_actuales + 1 WHERE id = ?',
              [promo_id],
              err => { if (err) console.error('Error al incrementar usos de promo:', err.message); }
            );
          }

          // Pasos 6 y 7 — Se consultan los datos del cliente y estilista para
          // redactar los mensajes. Si esta consulta falla (por ejemplo, el usuario
          // se borró en ese instante), simplemente se ignora. Ya respondimos 201.
          db.query(
            'SELECT u.nombre, u.email, e.nombre AS estilista_nombre FROM usuarios u JOIN usuarios e ON e.id = ? WHERE u.id = ?',
            [estilista_id, clienteId],
            (err, rows) => {
              if (err || rows.length === 0) return;
              const { nombre, email, estilista_nombre } = rows[0];

              // Paso 6 — El .catch evita que un fallo de SMTP (servidor caído,
              // límite de envíos alcanzado) rompa el proceso de Node.
              enviarConfirmacionCita(nombre, email, {
                servicio:  servicio.nombre,
                fecha,
                hora,
                estilista: estilista_nombre,
                precio:    precioTotal
              }).catch(e => console.error('Error al enviar email de confirmación:', e.message));

              // Paso 7 — Notificación interna para el estilista. Se construye
              // el mensaje con el nombre del cliente, servicio, fecha y hora
              // para que el estilista tenga todo en un vistazo desde su panel.
              notificarEstilista(
                estilista_id,
                'nueva-cita',
                'Nueva cita agendada',
                `${nombre} reservó "${servicio.nombre}" para el ${fecha} a las ${hora}.`
              );
            }
          );
        });
      });
    });
  });
  });  // cierra db.query servicios
});    // cierra router.post

// ══════════════════════════════════════════════════════════════════
// DELETE /api/citas/:id
// Cancela una cita (soft delete: cambia estado a 'cancelada').
// No se borra el registro para conservar el historial completo.
//
// El SQL que se ejecuta depende del rol:
//   - Cliente: solo puede cancelar sus propias citas (AND c.cliente_id = ?).
//   - Admin / Estilista: puede cancelar cualquier cita por id.
//
// Se construye la query antes de ejecutar, en lugar de usar un IF
// dentro del WHERE, para mantener el índice de cliente_id eficiente
// y evitar que un cliente cambie el id en el token y afecte citas ajenas.
//
// Las citas 'completada' no se pueden cancelar — ya pasaron.
// ══════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res) => {
  const { id }   = req.params;
  const userId   = req.user.id;
  const userRol  = req.user.rol;

  // El JOIN con usuarios y servicios es necesario aquí para obtener el nombre
  // del cliente y el nombre del servicio que se usarán en la notificación al estilista.
  const sqlBuscar = userRol === 'cliente'
    ? `SELECT c.id, c.estado, c.estilista_id, c.fecha, c.hora,
              u.nombre AS cliente_nombre,
              GROUP_CONCAT(s.nombre SEPARATOR ', ') AS servicios
       FROM citas c
       JOIN usuarios u ON u.id = c.cliente_id
       JOIN citas_servicios cs ON cs.cita_id = c.id
       JOIN servicios s ON s.id = cs.servicio_id
       WHERE c.id = ? AND c.cliente_id = ?
       GROUP BY c.id`
    : `SELECT c.id, c.estado, c.estilista_id, c.fecha, c.hora,
              u.nombre AS cliente_nombre,
              GROUP_CONCAT(s.nombre SEPARATOR ', ') AS servicios
       FROM citas c
       JOIN usuarios u ON u.id = c.cliente_id
       JOIN citas_servicios cs ON cs.cita_id = c.id
       JOIN servicios s ON s.id = cs.servicio_id
       WHERE c.id = ?
       GROUP BY c.id`;

  // Si es cliente, el segundo parámetro es su propio id (filtro de seguridad).
  // Si es admin o estilista, solo se filtra por el id de la cita.
  const params = userRol === 'cliente' ? [id, userId] : [id];

  db.query(sqlBuscar, params, (err, rows) => {
    if (err)               return res.status(500).json({ error: 'Error al buscar la cita.' });
    if (rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
    if (rows[0].estado === 'completada') {
      return res.status(400).json({ error: 'No se puede cancelar una cita ya completada.' });
    }

    const cita = rows[0];

    db.query(
      "UPDATE citas SET estado = 'cancelada' WHERE id = ?",
      [id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Error al cancelar.' });
        res.json({ message: 'Cita cancelada correctamente.' });

        // Se avisa al estilista después de responder para no hacerle esperar al cliente.
        notificarEstilista(
          cita.estilista_id,
          'cancelada',
          'Cita cancelada',
          `${cita.cliente_nombre} canceló su cita de "${cita.servicios}" del ${cita.fecha} a las ${cita.hora}.`
        );
      }
    );
  });
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/citas/:id/confirmar
// Permite al cliente autenticado confirmar su propia cita pendiente.
//
// Solo se permite cuando:
//   • La cita pertenece al cliente autenticado (seguridad).
//   • El estado actual es 'pendiente' (no tiene sentido confirmar
//     una cita ya confirmada, completada o cancelada).
//
// Nota: admin y estilista siguen usando PATCH /:id/estado para
// cualquier cambio de estado desde sus paneles respectivos.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/confirmar', (req, res) => {
  const clienteId = req.user.id;
  const { id }    = req.params;

  db.query(
    'SELECT id, estado, cliente_id FROM citas WHERE id = ?',
    [id],
    (err, rows) => {
      if (err)               return res.status(500).json({ error: 'Error al buscar la cita.' });
      if (rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });

      const cita = rows[0];

      // Verificar que la cita le pertenece a quien llama.
      if (cita.cliente_id !== clienteId) {
        return res.status(403).json({ error: 'No tienes permiso para confirmar esta cita.' });
      }
      if (cita.estado !== 'pendiente') {
        return res.status(400).json({
          error: `La cita ya está en estado "${cita.estado}". Solo puedes confirmar citas pendientes.`
        });
      }

      db.query(
        "UPDATE citas SET estado = 'confirmada' WHERE id = ?",
        [id],
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Error al confirmar la cita.' });
          res.json({ message: 'Cita confirmada exitosamente.' });
        }
      );
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS DE ESTILISTA
// Requieren rol 'estilista' o 'admin'. El admin puede usarlas para revisar
// la agenda de cualquier estilista o hacer pruebas de soporte.
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/mis-citas-semana?lunes=YYYY-MM-DD
// Devuelve todas las citas del estilista para la semana completa
// (lunes a domingo) indicada por el parámetro lunes.
// Si no se pasa lunes, se usa el lunes de la semana actual.
// Las citas vienen ordenadas por fecha y hora, y el frontend
// las agrupa por día para construir la vista semanal.
// ══════════════════════════════════════════════════════════════════
router.get('/mis-citas-semana', protect, estilistaOnly, (req, res) => {
  const estilistaId = req.user.id;

  // Calcular el lunes de la semana actual si no se proporciona
  let lunes = req.query.lunes;
  if (!lunes) {
    const hoy  = new Date();
    const diff = hoy.getDay() === 0 ? -6 : 1 - hoy.getDay();
    hoy.setDate(hoy.getDate() + diff);
    lunes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  }

  // Query principal: soporta walk-in (columnas cliente_externo_*)
  // Si esas columnas aún no existen (migración pendiente), errno 1054
  // dispara el fallback con la query original para no romper la agenda.
  const sql = `
    SELECT
      c.id,
      DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
      c.hora,
      c.estado,
      c.notas,
      c.precio_total,
      COALESCE(cl.nombre,   c.cliente_externo_nombre)   AS cliente_nombre,
      COALESCE(cl.telefono, c.cliente_externo_telefono) AS cliente_telefono,
      IF(c.cliente_id IS NULL, 1, 0)                    AS es_walk_in,
      GROUP_CONCAT(s.nombre   ORDER BY s.nombre SEPARATOR ', ') AS servicios,
      GROUP_CONCAT(s.duracion ORDER BY s.nombre SEPARATOR ', ') AS duraciones
    FROM citas c
    LEFT JOIN usuarios      cl ON c.cliente_id   = cl.id
    JOIN  citas_servicios   cs ON cs.cita_id     = c.id
    JOIN  servicios          s ON cs.servicio_id  = s.id
    WHERE c.estilista_id = ?
      AND c.fecha BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
    GROUP BY c.id
    ORDER BY c.fecha ASC, c.hora ASC
  `;

  const sqlFallback = `
    SELECT
      c.id,
      DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha,
      c.hora,
      c.estado,
      c.notas,
      c.precio_total,
      cl.nombre   AS cliente_nombre,
      cl.telefono AS cliente_telefono,
      0           AS es_walk_in,
      GROUP_CONCAT(s.nombre   ORDER BY s.nombre SEPARATOR ', ') AS servicios,
      GROUP_CONCAT(s.duracion ORDER BY s.nombre SEPARATOR ', ') AS duraciones
    FROM citas c
    JOIN usuarios       cl ON c.cliente_id  = cl.id
    JOIN citas_servicios cs ON cs.cita_id   = c.id
    JOIN servicios       s  ON cs.servicio_id = s.id
    WHERE c.estilista_id = ?
      AND c.fecha BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
    GROUP BY c.id
    ORDER BY c.fecha ASC, c.hora ASC
  `;

  db.query(sql, [estilistaId, lunes, lunes], (err, rows) => {
    if (err) {
      // errno 1054 = columna desconocida → migración walk-in no aplicada todavía
      if (err.errno === 1054) {
        db.query(sqlFallback, [estilistaId, lunes, lunes], (err2, rows2) => {
          if (err2) return res.status(500).json({ error: 'Error al obtener citas de la semana.' });
          return res.json({ lunes, citas: rows2 });
        });
        return;
      }
      return res.status(500).json({ error: 'Error al obtener citas de la semana.' });
    }
    res.json({ lunes, citas: rows });
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/citas/walk-in
// Crea una cita para un cliente presencial (sin cuenta en el sistema).
// Accesible para estilistas (usan su propio ID o el del body) y admins
// (deben enviar estilista_id en el body).
//
// Body esperado:
//   { nombre, telefono, fecha, hora, servicios: [id, ...], notas?, estilista_id? }
//
// La cita se registra con cliente_id = NULL y los datos del cliente
// en cliente_externo_nombre / cliente_externo_telefono.
// El precio_total se calcula sumando los precios actuales de los servicios.
// ══════════════════════════════════════════════════════════════════
router.post('/walk-in', protect, (req, res) => {
  const rol = req.user.rol;
  if (rol !== 'estilista' && rol !== 'admin') {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const { nombre, telefono, fecha, hora, servicios: servicioIds, notas, estilista_id } = req.body;

  // Determinar el estilista: el body manda estilista_id (selector del frontend);
  // si no viene, se usa el usuario logueado (solo válido para rol estilista).
  const estilistaId = estilista_id ? Number(estilista_id) : (rol === 'estilista' ? req.user.id : null);
  if (!estilistaId) {
    return res.status(400).json({ error: 'Debes seleccionar un estilista.' });
  }

  if (!nombre || !fecha || !hora || !Array.isArray(servicioIds) || servicioIds.length === 0) {
    return res.status(400).json({ error: 'nombre, fecha, hora y al menos un servicio son requeridos.' });
  }

  // ── Validación server-side de disponibilidad ──────────────────────
  // Aunque el frontend ya filtra estilistas y slots, re-verificamos aquí
  // para evitar doble-booking en caso de condición de carrera.
  // 1) El estilista debe trabajar ese día.
  // 2) No debe tener citas activas que se solapen con el bloque solicitado.
  const [yy, mm, dd] = fecha.split('-').map(Number);
  const diaSemana    = DIAS_ES[new Date(yy, mm - 1, dd).getDay()];
  const semanaInicioWI = getLunes(fecha);   // lunes de la semana solicitada

  // Verifica el horario más reciente asignado al estilista para ese día.
  // Sin este filtro por semana_inicio un estilista de descanso seguiría
  // apareciendo disponible si alguna semana antigua lo marcaba como activo.
  const sqlVerificarDia = `
    SELECT COUNT(*) AS trabaja
    FROM empleados_horarios_semana h
    WHERE h.empleado_id   = ?
      AND h.dia_semana    = ?
      AND h.semana_inicio = (
        SELECT MAX(h2.semana_inicio)
        FROM empleados_horarios_semana h2
        WHERE h2.empleado_id   = ?
          AND h2.dia_semana    = ?
          AND h2.semana_inicio <= ?
      )
      AND h.es_descanso = 0
  `;

  const sqlConflicto = `
    SELECT c.hora, SUM(s.duracion) AS duracion_total
    FROM citas c
    JOIN citas_servicios cs ON cs.cita_id    = c.id
    JOIN servicios        s  ON s.id          = cs.servicio_id
    WHERE c.estilista_id = ?
      AND c.fecha        = ?
      AND c.estado NOT IN ('cancelada')
    GROUP BY c.id
  `;

  db.query(sqlVerificarDia, [estilistaId, diaSemana, estilistaId, diaSemana, semanaInicioWI], (errDia, resDia) => {
    if (errDia) {
      console.error('[walk-in] Error al verificar día de trabajo:', errDia.message);
      return res.status(500).json({ error: 'Error al verificar disponibilidad del estilista.' });
    }
    if (!resDia[0] || resDia[0].trabaja === 0) {
      return res.status(409).json({ error: 'El estilista no trabaja ese día.' });
    }

    // Primero necesitamos la duración de los servicios seleccionados para calcular el bloque
    db.query(
      `SELECT SUM(duracion) AS duracion_total FROM servicios WHERE id IN (${servicioIds.map(() => '?').join(',')}) AND activo = 1`,
      servicioIds,
      (errDur, resDur) => {
        if (errDur || !resDur[0]) {
          return res.status(500).json({ error: 'Error al calcular duración de servicios.' });
        }

        const durNueva      = resDur[0].duracion_total || 0;
        const bloqueNueva   = Math.ceil(durNueva / 30) * 30;
        function horaAMin(h) { const [hh, mi] = String(h).split(':').map(Number); return hh * 60 + mi; }
        const inicioNueva   = horaAMin(hora);
        const finNueva      = inicioNueva + bloqueNueva;

        db.query(sqlConflicto, [estilistaId, fecha], (errConf, citas) => {
          if (errConf) {
            console.error('[walk-in] Error al verificar conflictos:', errConf.message);
            return res.status(500).json({ error: 'Error al verificar disponibilidad horaria.' });
          }

          const conflicto = citas.some(c => {
            const ini = horaAMin(c.hora);
            const fin = ini + Math.ceil((c.duracion_total || 30) / 30) * 30;
            return inicioNueva < fin && ini < finNueva;
          });

          if (conflicto) {
            return res.status(409).json({ error: 'El estilista ya tiene una cita en ese horario. Selecciona otro horario.' });
          }

          // ── Sin conflictos: continuar con el flujo normal ─────────
          crearCitaWalkIn();
        });
      }
    );
  });

  // Obtener datos de los servicios seleccionados (precio y nombre)
  function crearCitaWalkIn() {
  const placeholders = servicioIds.map(() => '?').join(',');
  db.query(
    `SELECT id, nombre, precio FROM servicios WHERE id IN (${placeholders}) AND activo = 1`,
    servicioIds,
    (err, serviciosData) => {
      if (err) {
        console.error('[walk-in] Error al verificar servicios:', err.message);
        return res.status(500).json({ error: 'Error al verificar servicios.', debug: err.message });
      }
      if (serviciosData.length === 0) return res.status(400).json({ error: 'Ningún servicio válido encontrado.' });

      const precioTotal = serviciosData.reduce((sum, s) => sum + parseFloat(s.precio), 0);

      // ── Intento principal: INSERT con columnas walk-in ────────────
      // Si las columnas aún no existen (migración pendiente) MySQL
      // devuelve errno 1054. En ese caso se hace el INSERT sin ellas
      // para no bloquear la operación, y se avisa al log.
      // ── Detectar si la migración walk-in ya fue aplicada ─────────────
      // Consultamos INFORMATION_SCHEMA antes del INSERT para saber si las
      // columnas existen. Así podemos dar un mensaje claro sin depender del
      // errno del INSERT, que varía según si hay FK, si cliente_id tiene
      // default, etc.
      db.query(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = 'citas'
           AND COLUMN_NAME  = 'cliente_externo_nombre'`,
        [],
        (errInfo, infoRows) => {
          if (errInfo) {
            console.error('[walk-in] Error INFORMATION_SCHEMA:', errInfo.message);
          }

          const migracionAplicada = !errInfo && infoRows[0]?.cnt > 0;

          if (!migracionAplicada) {
            // ── Sin migración: INSERT básico usando cliente_id=-1 ────────
            // Si cliente_id es NOT NULL, usamos -1 como centinela para citas
            // walk-in hasta que la migración se aplique.
            // Si hay FK que lo impide, retornamos un mensaje muy claro.
            console.warn('[walk-in] Migración no aplicada. Intentando INSERT básico con centinela cliente_id=-1.');
            db.query(
              `INSERT INTO citas (cliente_id, estilista_id, fecha, hora, estado, notas, precio_total)
               VALUES (-1, ?, ?, ?, 'confirmada', ?, ?)`,
              [estilistaId, fecha, hora, notas?.trim() || null, precioTotal],
              (errBasico, resBasico) => {
                if (errBasico) {
                  console.error('[walk-in] Error INSERT básico:', errBasico.message);
                  return res.status(500).json({
                    error: 'La base de datos no está preparada para citas walk-in. Ejecuta la migración.',
                    debug: 'Corre este comando en tu terminal: mysql -u root -p ponte_guapagt < backend/migracion_walk_in.sql  — Luego reinicia el servidor.',
                    sql_error: errBasico.message
                  });
                }
                finalizarCita(resBasico.insertId);
              }
            );
            return;
          }

          // ── Con migración: INSERT completo con datos del cliente ──────
          db.query(
            `INSERT INTO citas
              (cliente_id, cliente_externo_nombre, cliente_externo_telefono,
               estilista_id, fecha, hora, estado, notas, precio_total)
             VALUES (NULL, ?, ?, ?, ?, ?, 'confirmada', ?, ?)`,
            [nombre.trim(), telefono?.trim() || null, estilistaId, fecha, hora, notas?.trim() || null, precioTotal],
            (errFull, resFull) => {
              if (errFull) {
                console.error('[walk-in] Error INSERT completo:', errFull.message);
                return res.status(500).json({ error: 'Error al crear la cita.', debug: errFull.message });
              }
              finalizarCita(resFull.insertId);
            }
          );
        }
      );

      const finalizarCita = (citaId) => {
        const citaServicios = serviciosData.map(s => [citaId, s.id, s.precio]);
        db.query(
          'INSERT INTO citas_servicios (cita_id, servicio_id, precio_momento) VALUES ?',
          [citaServicios],
          (err2) => {
            if (err2) {
              console.error('[walk-in] Error al guardar servicios:', err2.message);
              return res.status(500).json({ error: 'Cita creada pero falló al guardar servicios.', debug: err2.message });
            }
            notificarEstilista(
              estilistaId, 'nueva-cita', 'Cita walk-in registrada',
              `Cita presencial con ${nombre.trim()} para el ${fecha} a las ${hora}.`
            );
            res.status(201).json({ message: 'Cita walk-in creada correctamente.', cita_id: citaId });
          }
        );
      };
    }
  );
  } // fin crearCitaWalkIn
});

// ══════════════════════════════════════════════════════════════════
// GET /api/citas/mis-citas-estilista?fecha=YYYY-MM-DD
// Devuelve las citas del estilista autenticado para una fecha dada.
// Si no se pasa fecha, se usa el día de hoy (útil para el panel de inicio).
//
// Se ordena por hora ASC para que el estilista vea su agenda
// cronológicamente de arriba a abajo, como una lista de turnos.
// ══════════════════════════════════════════════════════════════════
router.get('/mis-citas-estilista', protect, estilistaOnly, (req, res) => {
  const estilistaId = req.user.id;

  // toISOString() devuelve formato UTC. En zonas con offset negativo podría
  // mostrar el día anterior. Para este proyecto es aceptable, pero si se
  // necesitara precisión por zona horaria habría que recibirla del frontend.
  const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

  const sql = `
    SELECT
      c.id,
      c.fecha,
      c.hora,
      c.estado,
      c.notas,
      c.precio_total,
      IF(c.cliente_id IS NULL, 1, 0)                              AS es_walk_in,
      COALESCE(cl.nombre,   c.cliente_externo_nombre)             AS cliente_nombre,
      COALESCE(cl.telefono, c.cliente_externo_telefono)           AS cliente_telefono,
      GROUP_CONCAT(s.nombre    ORDER BY s.nombre SEPARATOR ', ') AS servicios,
      GROUP_CONCAT(s.duracion  ORDER BY s.nombre SEPARATOR ', ') AS duraciones
    FROM citas c
    LEFT JOIN usuarios  cl ON c.cliente_id = cl.id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios s  ON cs.servicio_id  = s.id
    WHERE c.estilista_id = ? AND c.fecha = ?
    GROUP BY c.id
    ORDER BY c.hora ASC
  `;
  db.query(sql, [estilistaId, fecha], (err, rows) => {
    if (err) {
      console.error('Error mis-citas-estilista:', err);
      return res.status(500).json({ error: 'Error al obtener citas.' });
    }
    res.json(rows);
  });
});

// ══════════════════════════════════════════════════════════════════
// PATCH /api/citas/:id/estado
// Cambia el estado de una cita. Lo usa el estilista desde su panel
// para confirmar, completar o cancelar una cita que le pertenece.
//
// Casos especiales:
//   completada → suma precio_total como puntos al cliente
//                (1 punto por cada quetzal). Fire-and-forget para no
//                bloquear la respuesta si el INSERT de puntos falla.
//   cancelada  → acepta motivo_cancelacion (texto) del body y guarda
//                cancelado_por = 'estilista' para que el admin sepa
//                quién la canceló y por qué.
// ══════════════════════════════════════════════════════════════════
router.patch('/:id/estado', protect, estilistaOnly, (req, res) => {
  const { id }                = req.params;
  const { estado, motivo_cancelacion } = req.body;
  const ESTADOS = ['pendiente', 'confirmada', 'completada', 'cancelada'];

  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${ESTADOS.join(', ')}` });
  }
  if (estado === 'cancelada' && !motivo_cancelacion?.trim()) {
    return res.status(400).json({ error: 'Debes indicar el motivo de cancelación.' });
  }

  // Se consulta la cita antes del UPDATE para obtener cliente_id, precio_total
  // y datos para la notificación, sin necesidad de una segunda consulta después.
  const sqlCita = `
    SELECT c.estilista_id, c.cliente_id, c.fecha, c.hora, c.estado AS estado_actual,
           c.precio_total,
           COALESCE(cl.nombre, c.cliente_externo_nombre) AS cliente_nombre,
           GROUP_CONCAT(s.nombre SEPARATOR ', ') AS servicios
    FROM citas c
    LEFT JOIN usuarios cl ON cl.id = c.cliente_id
    JOIN citas_servicios cs ON cs.cita_id = c.id
    JOIN servicios s ON s.id = cs.servicio_id
    WHERE c.id = ?
    GROUP BY c.id
  `;
  db.query(sqlCita, [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
    const cita = rows[0];

    // No permitir marcar como completada si ya estaba cancelada (y viceversa).
    if (cita.estado_actual === 'completada' && estado !== 'completada') {
      return res.status(400).json({ error: 'La cita ya está completada y no puede cambiar de estado.' });
    }

    // Construir el UPDATE según el nuevo estado.
    // Para cancelaciones del estilista guardamos el motivo y el autor.
    // Para completadas, abrimos la ventana de 5 días para dejar reseña.
    let sqlUpdate, paramsUpdate;
    if (estado === 'cancelada') {
      sqlUpdate    = 'UPDATE citas SET estado = ?, motivo_cancelacion = ?, cancelado_por = ? WHERE id = ?';
      paramsUpdate = [estado, motivo_cancelacion.trim(), 'estilista', id];
    } else if (estado === 'completada') {
      // resena_disponible_hasta = ahora + 5 días.
      // El cliente tendrá 5 días para dejar su reseña desde que se completó.
      sqlUpdate    = 'UPDATE citas SET estado = ?, resena_disponible_hasta = DATE_ADD(NOW(), INTERVAL 5 DAY) WHERE id = ?';
      paramsUpdate = [estado, id];
    } else {
      sqlUpdate    = 'UPDATE citas SET estado = ? WHERE id = ?';
      paramsUpdate = [estado, id];
    }

    db.query(sqlUpdate, paramsUpdate, (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar estado.' });

      res.json({ message: `Estado actualizado a "${estado}".`, id: parseInt(id), estado });

      // ── Puntos por cita completada ────────────────────────────────
      // 1 punto por cada quetzal del precio_total (redondeado a entero).
      // Se usa un patrón SELECT → UPDATE/INSERT para no requerir una
      // restricción UNIQUE en puntos_usuario.
      // Todo es fire-and-forget: si algo falla aquí la cita ya fue marcada.
      // Walk-in citas don't have a registered client, so skip points
      if (estado === 'completada' && cita.estado_actual !== 'completada' && cita.cliente_id) {
        const puntos      = Math.round(parseFloat(cita.precio_total));
        const clienteId   = cita.cliente_id;
        const descripcion = `Cita del ${cita.fecha} — ${cita.servicios}`;

        db.query('SELECT id FROM puntos_usuario WHERE usuario_id = ?', [clienteId], (err, rows) => {
          if (err) { console.error('Error buscando puntos_usuario:', err.message); return; }

          if (rows.length > 0) {
            db.query(
              'UPDATE puntos_usuario SET puntos = puntos + ? WHERE usuario_id = ?',
              [puntos, clienteId],
              err => { if (err) console.error('Error sumando puntos:', err.message); }
            );
          } else {
            db.query(
              'INSERT INTO puntos_usuario (usuario_id, puntos) VALUES (?, ?)',
              [clienteId, puntos],
              err => { if (err) console.error('Error creando puntos_usuario:', err.message); }
            );
          }

          // Registrar el movimiento en el historial para que el cliente
          // pueda ver de qué cita vienen sus puntos.
          db.query(
            `INSERT INTO historial_puntos (usuario_id, puntos, tipo, descripcion, cita_id)
             VALUES (?, ?, 'ganados', ?, ?)`,
            [clienteId, puntos, descripcion, id],
            err => { if (err) console.error('Error insertando historial_puntos:', err.message); }
          );
        });
      }

      // Notificación interna al estilista solo cuando se confirma la cita
      // (él mismo hace el resto de cambios, ya lo sabe).
      if (estado === 'confirmada') {
        notificarEstilista(
          cita.estilista_id,
          'confirmada',
          'Cita confirmada',
          `${cita.cliente_nombre} confirmó su cita de "${cita.servicios}" para el ${cita.fecha} a las ${cita.hora}.`
        );
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS DE ADMINISTRADOR
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// GET /api/citas
// Panel de citas del administrador con filtros opcionales.
// Query params: ?fecha= ?estado= ?estilista_id= (todos opcionales)
//
// El truco de 'WHERE 1=1' permite concatenar condiciones con AND sin
// preocuparse por si hay un WHERE previo o no. Cada parámetro que
// llegue simplemente agrega un ' AND columna = ?' al final del string.
// Los valores se pasan aparte en el array params para que mysql2
// los sanitice y evite inyecciones SQL.
//
// La combinación GROUP_CONCAT + GROUP BY permite que si una cita tiene
// varios servicios todos aparezcan en la misma fila de resultado.
// ══════════════════════════════════════════════════════════════════
router.get('/', adminOnly, (req, res) => {
  const { fecha, estado, estilista_id } = req.query;

  let sql = `
    SELECT
      c.id,
      c.fecha,
      c.hora,
      c.estado,
      c.notas,
      c.precio_total,
      c.created_at,
      IF(c.cliente_id IS NULL, 1, 0)                                   AS es_walk_in,
      COALESCE(cl.nombre,   c.cliente_externo_nombre)                  AS cliente_nombre,
      COALESCE(cl.telefono, c.cliente_externo_telefono)                AS cliente_telefono,
      e.nombre       AS estilista_nombre,
      GROUP_CONCAT(s.nombre   ORDER BY s.nombre SEPARATOR ', ') AS servicios,
      GROUP_CONCAT(s.duracion ORDER BY s.nombre SEPARATOR ', ') AS duraciones
    FROM citas c
    LEFT JOIN usuarios  cl ON c.cliente_id   = cl.id
    JOIN usuarios  e  ON c.estilista_id = e.id
    JOIN citas_servicios cs ON cs.cita_id     = c.id
    JOIN servicios s  ON cs.servicio_id  = s.id
    WHERE 1=1
  `;
  const params = [];

  // Cada bloque agrega tanto el fragmento SQL como el valor al array params
  // para mantener la correspondencia de posición que mysql2 requiere con '?'.
  if (fecha)        { sql += ' AND c.fecha = ?';        params.push(fecha); }
  if (estado)       { sql += ' AND c.estado = ?';       params.push(estado); }
  if (estilista_id) { sql += ' AND c.estilista_id = ?'; params.push(estilista_id); }

  sql += ' GROUP BY c.id ORDER BY c.fecha DESC, c.hora ASC';

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Error GET /api/citas:', err);
      return res.status(500).json({ error: 'Error al obtener citas.' });
    }
    res.json(rows);
  });
});

module.exports = router;
