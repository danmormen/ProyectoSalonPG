// Módulo de conexión a la base de datos MySQL.
// Usa createPool en lugar de createConnection para manejar reconexiones
// automáticas cuando Railway (o cualquier servidor) cierra la conexión
// por inactividad. El pool crea nuevas conexiones según se necesiten.

require('dotenv').config();
const sql = require("mysql2");

// Configuración desde variables de entorno.
// En desarrollo local usa .env, en producción (Azure) App Service settings.
const pool = sql.createPool({
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  host:              process.env.DB_HOST,
  port:              parseInt(process.env.DB_PORT) || 3306,
  database:          process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:   10,
  queueLimit:        0
});

// Verificar que el pool puede conectarse al arrancar
pool.getConnection((err, connection) => {
  if (err) {
    console.error("Error conectando a MySQL:", err);
    return;
  }
  console.log("Connection Successful!");
  connection.release();
});

// Se exporta el pool directamente.
// Todos los archivos de rutas lo usan igual que antes: db.query(sql, params, callback)
module.exports = pool;
