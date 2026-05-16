const jwt = require('jsonwebtoken');
const db  = require('../config/DBconfig');

const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_super_secreta_123';

// ══════════════════════════════════════════════════════════════════
// protect
// Middleware que verifica la identidad del usuario en cada petición
// a una ruta protegida. Se ejecuta antes del controlador.
//
// Espera el token en el header Authorization con formato:
//   Authorization: Bearer <token>
//
// Si el token es válido, consulta la BD para confirmar que el usuario
// todavía existe (por ejemplo, no fue eliminado después de que se
// generó el token). Luego asigna el objeto usuario a req.user para
// que los controladores puedan leerlo sin hacer otra consulta.
// ══════════════════════════════════════════════════════════════════
const protect = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'No autorizado, token no proporcionado' });
  }

  try {
    // jwt.verify lanza un error si el token expiró o si la firma no coincide
    // con JWT_SECRET. En ese caso se captura abajo en el catch.
    const decoded = jwt.verify(token, JWT_SECRET);

    db.query(
      'SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?',
      [decoded.id],
      (err, results) => {
        if (err) {
          console.error("Error en DB durante validación de token:", err);
          return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (results.length === 0) {
          // El token era válido pero el usuario ya no existe en la BD
          return res.status(401).json({ message: 'Usuario no encontrado o sesión expirada' });
        }

        const usuario = results[0];

        // Se normaliza el rol a minúsculas para evitar problemas de comparación
        // si en algún momento se guardó con mayúscula ('Admin' vs 'admin')
        usuario.rol = usuario.rol ? usuario.rol.toLowerCase() : '';

        req.user = usuario;
        next();
      }
    );
  } catch (error) {
    console.error("Error al verificar token JWT:", error.message);
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

// ══════════════════════════════════════════════════════════════════
// adminOnly
// Se aplica después de protect. Verifica que el usuario autenticado
// tenga el rol 'admin'. Si no, responde 403 Forbidden.
// Se usa en todos los módulos de gestión: usuarios, servicios,
// horarios, promociones, recompensas y notificaciones.
// ══════════════════════════════════════════════════════════════════
const adminOnly = (req, res, next) => {
  if (req.user && req.user.rol === 'admin') {
    next();
  } else {
    const userRol = req.user ? req.user.rol : 'desconocido';
    return res.status(403).json({
      message: `Acceso denegado. Se requiere rol de administrador. Tu rol actual: ${userRol}`
    });
  }
};

// ══════════════════════════════════════════════════════════════════
// estilistaOnly
// Permite acceso si el rol es 'estilista' o 'admin'.
// Se usa en rutas que el estilista necesita para operar en su día
// a día: ver sus citas, cambiar estados, leer notificaciones.
// El admin también puede acceder para hacer pruebas o soporte.
// ══════════════════════════════════════════════════════════════════
const estilistaOnly = (req, res, next) => {
  if (req.user && (req.user.rol === 'estilista' || req.user.rol === 'admin')) {
    next();
  } else {
    return res.status(403).json({ message: 'Acceso denegado. Debes ser estilista o administrador.' });
  }
};

module.exports = { protect, adminOnly, estilistaOnly };
