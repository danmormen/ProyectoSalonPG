// ══════════════════════════════════════════════════════════════════
// jobs/recordatorios.js
// Cron job para enviar recordatorios de citas por correo electrónico.
//
// Se ejecuta cada 15 minutos y busca citas que estén:
//   • Entre 11h 45m y 12h 15m en el futuro → recordatorio de 12 h
//   • Entre  1h 45m y  2h 15m en el futuro → recordatorio de  2 h
//
// Las columnas recordatorio_12h / recordatorio_2h en la tabla citas
// funcionan como bandera "ya enviado" para evitar duplicados. Una vez
// que se marca en 1, el cron no vuelve a seleccionar esa cita.
//
// PREREQUISITO: npm install node-cron --save   (en /backend)
// ══════════════════════════════════════════════════════════════════
const cron = require('node-cron');
const db   = require('../config/DBconfig');
const {
  enviarRecordatorio12h,
  enviarRecordatorio2h
} = require('../config/emailServices');

// ─── helpers ────────────────────────────────────────────────────
// Consulta las citas que necesitan un recordatorio de acuerdo al
// margen de minutos indicado y la columna de bandera.
//   minutosMin / minutosMax: rango de "minutos hasta la cita"
//   columnaFlag:             'recordatorio_12h' | 'recordatorio_2h'
// Devuelve una Promise con el array de filas.
function buscarCitasParaRecordar(minutosMin, minutosMax, columnaFlag) {
  return new Promise((resolve, reject) => {
    // TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(fecha, ' ', hora))
    // calcula los minutos que faltan para la cita desde ahora.
    // Solo se consideran citas no canceladas / completadas
    // cuyo recordatorio todavía no fue enviado (columnaFlag = 0).
    const sql = `
      SELECT
        c.id,
        c.fecha,
        c.hora,
        u.nombre  AS nombre,
        u.email   AS email,
        e.nombre  AS estilista,
        GROUP_CONCAT(s.nombre ORDER BY s.nombre SEPARATOR ', ') AS servicios
      FROM citas c
      JOIN usuarios        u  ON u.id = c.cliente_id
      JOIN usuarios        e  ON e.id = c.estilista_id
      JOIN citas_servicios cs ON cs.cita_id = c.id
      JOIN servicios       s  ON s.id = cs.servicio_id
      WHERE c.estado NOT IN ('cancelada', 'completada')
        AND c.${columnaFlag} = 0
        AND TIMESTAMPDIFF(MINUTE, NOW(), CONCAT(c.fecha, ' ', c.hora))
            BETWEEN ? AND ?
      GROUP BY c.id
    `;
    db.query(sql, [minutosMin, minutosMax], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// Marca la columna de bandera a 1 para que no se reenvíe.
function marcarEnviado(citaId, columnaFlag) {
  db.query(
    `UPDATE citas SET ${columnaFlag} = 1 WHERE id = ?`,
    [citaId],
    err => { if (err) console.error(`[recordatorios] Error marcando ${columnaFlag} para cita ${citaId}:`, err.message); }
  );
}

// ─── job principal ───────────────────────────────────────────────
// Se ejecuta cada 15 minutos. El patrón '*/15 * * * *' es estándar
// de node-cron y compatible con crontab de Unix.
cron.schedule('*/15 * * * *', async () => {
  const timestamp = new Date().toLocaleString('es-GT');
  console.log(`[recordatorios] Verificando recordatorios — ${timestamp}`);

  // ── Recordatorio de 12 horas ──────────────────────────────────
  // Ventana: entre 11h 45m (705 min) y 12h 15m (735 min).
  // La ventana de 30 min asegura que aunque el cron se ejecute con
  // leve retraso, la cita siempre queda dentro del rango.
  try {
    const citas12h = await buscarCitasParaRecordar(705, 735, 'recordatorio_12h');
    if (citas12h.length > 0) {
      console.log(`[recordatorios] Recordatorio 12h — ${citas12h.length} cita(s) encontradas`);
    }
    for (const cita of citas12h) {
      try {
        await enviarRecordatorio12h(cita.nombre, cita.email, {
          fecha:    cita.fecha,
          hora:     cita.hora,
          servicios: cita.servicios,
          estilista: cita.estilista
        });
        marcarEnviado(cita.id, 'recordatorio_12h');
        console.log(`[recordatorios] ✓ Recordatorio 12h enviado → ${cita.email} (cita #${cita.id})`);
      } catch (emailErr) {
        console.error(`[recordatorios] ✗ Error enviando recordatorio 12h a ${cita.email}:`, emailErr.message);
      }
    }
  } catch (dbErr) {
    console.error('[recordatorios] Error consultando citas para recordatorio 12h:', dbErr.message);
  }

  // ── Recordatorio de 2 horas ───────────────────────────────────
  // Ventana: entre 1h 45m (105 min) y 2h 15m (135 min).
  try {
    const citas2h = await buscarCitasParaRecordar(105, 135, 'recordatorio_2h');
    if (citas2h.length > 0) {
      console.log(`[recordatorios] Recordatorio 2h — ${citas2h.length} cita(s) encontradas`);
    }
    for (const cita of citas2h) {
      try {
        await enviarRecordatorio2h(cita.nombre, cita.email, {
          fecha:    cita.fecha,
          hora:     cita.hora,
          servicios: cita.servicios,
          estilista: cita.estilista
        });
        marcarEnviado(cita.id, 'recordatorio_2h');
        console.log(`[recordatorios] ✓ Recordatorio 2h enviado → ${cita.email} (cita #${cita.id})`);
      } catch (emailErr) {
        console.error(`[recordatorios] ✗ Error enviando recordatorio 2h a ${cita.email}:`, emailErr.message);
      }
    }
  } catch (dbErr) {
    console.error('[recordatorios] Error consultando citas para recordatorio 2h:', dbErr.message);
  }
});

console.log('[recordatorios] Cron de recordatorios iniciado (cada 15 minutos)');
