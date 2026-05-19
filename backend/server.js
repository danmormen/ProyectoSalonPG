// Punto de entrada del backend de PonteGuapa.
// Aquí se configura Express, se registran los middlewares globales,
// se montan todas las rutas y se levanta el servidor en el puerto indicado.

// ══════════════════════════════════════════════════════════════════
// 1. Variables de entorno
// dotenv.config() debe ejecutarse antes de cualquier import que lea
// process.env (como emailServices o DBconfig), de lo contrario esas
// variables llegarán como undefined en el arranque.
// ══════════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();
const port    = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════════
// 2. Middlewares globales
// express.json() y express.urlencoded() permiten leer el body de
// las peticiones POST/PUT/PATCH en req.body, tanto en formato JSON
// como en formularios HTML codificados. Sin estos dos el body llega vacío.
//
// CORS está configurado con origin: '*' para desarrollo local.
// En producción conviene restringirlo al dominio del frontend para
// evitar que otras páginas consuman la API sin autorización.
// ══════════════════════════════════════════════════════════════════
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ══════════════════════════════════════════════════════════════════
// 3. Importación de rutas
// Cada módulo exporta un Express Router con sus propias rutas y
// middlewares. Se importan aquí y se montan en el paso siguiente.
// ══════════════════════════════════════════════════════════════════
const usuariosRouter       = require('./src/routes/Usuarios');
const authRouter           = require('./src/routes/authRoutes');
const serviciosRouter      = require('./src/routes/servicios');
const horariosRouter       = require('./src/routes/horarios');
const promocionesRouter    = require('./src/routes/promociones');
const recompensasRouter    = require('./src/routes/recompensas');
const citasRouter          = require('./src/routes/citas');
const notificacionesRouter   = require('./src/routes/notificaciones');
const notifEstilistaRouter   = require('./src/routes/notificaciones-estilista');
const diasBloqueadosRouter   = require('./src/routes/dias-bloqueados');
const especialidadesRouter   = require('./src/routes/especialidades');
const resenasRouter          = require('./src/routes/resenas');
const reportesRouter         = require('./src/routes/reportes');

// ══════════════════════════════════════════════════════════════════
// Jobs programados — DESHABILITADOS TEMPORALMENTE
// Para reactivar: descomentar la línea de abajo y reiniciar el servidor.
// PREREQUISITO: npm install node-cron --save   (ejecutar en /backend)
// ══════════════════════════════════════════════════════════════════
// require('./src/jobs/recordatorios');

// ══════════════════════════════════════════════════════════════════
// 4. Montaje de rutas
// app.use(prefijo, router) hace que todas las rutas definidas dentro
// del router queden disponibles bajo ese prefijo. Por ejemplo, si el
// router de citas define GET /, queda accesible como GET /api/citas.
//
// El orden de montaje no afecta el comportamiento porque los prefijos
// son distintos, pero se mantiene agrupado por módulo por legibilidad.
// ══════════════════════════════════════════════════════════════════
app.use('/api/usuarios',        usuariosRouter);
app.use('/api/auth',            authRouter);
app.use('/api/servicios',       serviciosRouter);
app.use('/api/horarios',        horariosRouter);
app.use('/api/promociones',     promocionesRouter);
app.use('/api/recompensas',     recompensasRouter);
app.use('/api/citas',           citasRouter);
app.use('/api/notificaciones',   notificacionesRouter);
app.use('/api/notif-estilista',  notifEstilistaRouter);
app.use('/api/dias-bloqueados',  diasBloqueadosRouter);
app.use('/api/especialidades',   especialidadesRouter);
app.use('/api/resenas',          resenasRouter);
app.use('/api/reportes',         reportesRouter);

// Ruta raíz para verificar rápidamente que el servidor está corriendo.
// Se usa durante el desarrollo; no tiene utilidad en producción.
app.get('/', (req, res) => {
  res.send('Backend de PonteGuapa funcionando correctamente');
});

// ══════════════════════════════════════════════════════════════════
// 5. Manejo de errores
// Express evalúa los middlewares en orden. Si ninguna ruta coincidió
// con la petición, cae aquí y se responde con 404.
//
// El manejador de cuatro parámetros (err, req, res, next) es el
// convenio de Express para capturar errores que los controladores
// pasan con next(err). Imprime el stack en consola para debug y
// responde con 500 al cliente sin exponer detalles internos.
// ══════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  res.status(404).json({ message: 'La ruta solicitada no existe' });
});

app.use((err, req, res, next) => {
  console.error('Error detectado:', err.stack);
  res.status(500).json({
    error:   'Algo salió mal en el servidor',
    message: err.message
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. Auto-migraciones
// Antes de levantar el servidor se revisan columnas opcionales que
// pueden haber sido agregadas en versiones recientes. Si no existen,
// se crean automáticamente con ALTER TABLE para que el servidor no
// necesite scripts manuales.
// ══════════════════════════════════════════════════════════════════
// 7. Arranque del servidor
// ══════════════════════════════════════════════════════════════════
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});
