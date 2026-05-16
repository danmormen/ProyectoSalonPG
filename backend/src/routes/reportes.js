const express = require('express');
const router  = express.Router();
const db      = require('../config/DBconfig');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Todas las rutas de reportes requieren admin
router.use(protect, adminOnly);

// ── Helper: convierte db.query a Promise ────────────────────────────
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// ── Helper: calcula las fechas de inicio del período actual y anterior ─
function calcularPeriodo(periodo) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  let inicioActual, inicioAnterior, finAnterior;

  if (periodo === 'semana') {
    // Lunes de esta semana
    const dia = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1;
    inicioActual   = new Date(hoy); inicioActual.setDate(hoy.getDate() - dia);
    inicioAnterior = new Date(inicioActual); inicioAnterior.setDate(inicioActual.getDate() - 7);
    finAnterior    = new Date(inicioActual); finAnterior.setDate(inicioActual.getDate() - 1);

  } else if (periodo === 'mes') {
    inicioActual   = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    inicioAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    finAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0);

  } else if (periodo === 'trimestre') {
    inicioActual   = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
    inicioAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
    finAnterior    = new Date(inicioActual); finAnterior.setDate(finAnterior.getDate() - 1);

  } else { // año
    inicioActual   = new Date(hoy.getFullYear(), 0, 1);
    inicioAnterior = new Date(hoy.getFullYear() - 1, 0, 1);
    finAnterior    = new Date(hoy.getFullYear() - 1, 11, 31);
  }

  const fmt = d => d.toISOString().split('T')[0];
  return {
    inicioActual:   fmt(inicioActual),
    finActual:      fmt(hoy),
    inicioAnterior: fmt(inicioAnterior),
    finAnterior:    fmt(finAnterior)
  };
}

// ════════════════════════════════════════════════════════════════
// GET /api/reportes?periodo=semana|mes|trimestre|año
// Devuelve en un solo request todos los datos del dashboard:
//   · KPIs (ingresos, citas, satisfacción) del período actual y anterior
//   · Citas por día de la semana (distribución)
//   · Top 5 servicios más agendados
//   · Top 5 estilistas (citas, ingresos, calificación promedio)
// ════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const periodo = ['semana', 'mes', 'trimestre', 'año'].includes(req.query.periodo)
    ? req.query.periodo
    : 'mes';

  const { inicioActual, finActual, inicioAnterior, finAnterior } = calcularPeriodo(periodo);

  try {
    // ── 1. KPIs período actual ──────────────────────────────────
    const [kpiActual] = await query(`
      SELECT
        COALESCE(SUM(c.precio_total), 0)  AS ingresos,
        COUNT(*)                           AS citas,
        ROUND(AVG(r.puntuacion), 1)        AS satisfaccion
      FROM citas c
      LEFT JOIN resenas r ON r.cita_id = c.id
      WHERE c.estado = 'completada'
        AND c.fecha BETWEEN ? AND ?
    `, [inicioActual, finActual]);

    // ── 2. KPIs período anterior ────────────────────────────────
    const [kpiAnterior] = await query(`
      SELECT
        COALESCE(SUM(c.precio_total), 0)  AS ingresos,
        COUNT(*)                           AS citas,
        ROUND(AVG(r.puntuacion), 1)        AS satisfaccion
      FROM citas c
      LEFT JOIN resenas r ON r.cita_id = c.id
      WHERE c.estado = 'completada'
        AND c.fecha BETWEEN ? AND ?
    `, [inicioAnterior, finAnterior]);

    // ── 3. Citas por día de la semana (completadas + confirmadas) ─
    // DAYOFWEEK: 1=Dom 2=Lun 3=Mar 4=Mié 5=Jue 6=Vie 7=Sáb
    const citasDow = await query(`
      SELECT DAYOFWEEK(fecha) AS dow, COUNT(*) AS total
      FROM citas
      WHERE estado IN ('completada', 'confirmada', 'pendiente')
        AND fecha BETWEEN ? AND ?
      GROUP BY dow
      ORDER BY dow
    `, [inicioActual, finActual]);

    // Construir array completo de 7 días con 0 donde no haya datos
    const DIAS = [null, 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dowMap = {};
    citasDow.forEach(r => { dowMap[r.dow] = r.total; });
    // Mostrar Lun→Dom (dow 2→1)
    const citasPorDia = [2,3,4,5,6,7,1].map(dow => ({
      dia:   DIAS[dow],
      total: dowMap[dow] || 0
    }));

    // ── 4. Top 5 servicios ──────────────────────────────────────
    const serviciosTop = await query(`
      SELECT s.nombre, COUNT(*) AS total
      FROM citas_servicios cs
      JOIN servicios s ON s.id = cs.servicio_id
      JOIN citas     c ON c.id = cs.cita_id
      WHERE c.estado = 'completada'
        AND c.fecha BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY total DESC
      LIMIT 5
    `, [inicioActual, finActual]);

    // ── 5. Top 5 estilistas ─────────────────────────────────────
    const estilistas = await query(`
      SELECT
        u.nombre,
        COUNT(*)                          AS citas,
        COALESCE(SUM(c.precio_total), 0)  AS ingresos,
        ROUND(AVG(r.puntuacion), 1)       AS satisfaccion
      FROM citas c
      JOIN usuarios  u ON u.id = c.estilista_id
      LEFT JOIN resenas r ON r.cita_id = c.id
      WHERE c.estado = 'completada'
        AND c.fecha BETWEEN ? AND ?
      GROUP BY u.id
      ORDER BY citas DESC
      LIMIT 5
    `, [inicioActual, finActual]);

    // ── 6. Totales generales (para tarjetas del home admin si se necesitan) ─
    const [totales] = await query(`
      SELECT
        COUNT(*)                                                     AS totalCitas,
        SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END)      AS completadas,
        SUM(CASE WHEN estado = 'cancelada'  THEN 1 ELSE 0 END)      AS canceladas,
        SUM(CASE WHEN estado = 'pendiente'  THEN 1 ELSE 0 END)      AS pendientes,
        SUM(CASE WHEN estado = 'confirmada' THEN 1 ELSE 0 END)      AS confirmadas
      FROM citas
      WHERE fecha BETWEEN ? AND ?
    `, [inicioActual, finActual]);

    res.json({
      periodo,
      rango: { inicio: inicioActual, fin: finActual },
      kpis: {
        ingresos:            parseFloat(kpiActual.ingresos)    || 0,
        ingresosAnterior:    parseFloat(kpiAnterior.ingresos)  || 0,
        citas:               kpiActual.citas                   || 0,
        citasAnterior:       kpiAnterior.citas                 || 0,
        satisfaccion:        kpiActual.satisfaccion            || 0,
        satisfaccionAnterior:kpiAnterior.satisfaccion          || 0,
      },
      citasPorDia,
      serviciosTop,
      estilistas: estilistas.map(e => ({
        nombre:      e.nombre,
        citas:       e.citas,
        ingresos:    parseFloat(e.ingresos) || 0,
        satisfaccion:e.satisfaccion || 0
      })),
      totales: {
        total:       totales.totalCitas    || 0,
        completadas: totales.completadas   || 0,
        canceladas:  totales.canceladas    || 0,
        pendientes:  totales.pendientes    || 0,
        confirmadas: totales.confirmadas   || 0,
      }
    });

  } catch (err) {
    console.error('Error en /api/reportes:', err);
    res.status(500).json({ error: 'Error al generar el reporte.' });
  }
});

module.exports = router;
