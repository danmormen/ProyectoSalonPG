const db = require('../config/DBconfig');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { enviarBienvenida, enviarPasswordTemporal } = require('../config/emailServices');

const secretKey = process.env.JWT_SECRET || 'fallback_secreto_por_si_acaso_123';

// ══════════════════════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════════════════════

// Dominios de correo permitidos — evita correos falsos como @test.com
const DOMINIOS_PERMITIDOS = [
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com',
  'icloud.com', 'live.com', 'msn.com', 'protonmail.com', 'Galileo.edu'
];

const validarDominioEmail = (email) => {
  const dominio = email.split('@')[1]?.toLowerCase();
  return DOMINIOS_PERMITIDOS.includes(dominio);
};

// Genera un token JWT con el id y rol del usuario, válido por 7 días
const generarToken = (id, rol) => {
  return jwt.sign({ id, rol }, secretKey, { expiresIn: '7d' });
};

// Genera una contraseña temporal legible — ej. PonteGuapa#4821
const generarPasswordTemporal = () => {
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `PonteGuapa#${numero}`;
};

// ══════════════════════════════════════════════════════════════════
// REGISTRO
// Crea un nuevo usuario cliente en la base de datos
// ══════════════════════════════════════════════════════════════════
const registrar = async (req, res) => {
  console.log('Body recibido:', req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errores: errors.array() });
  }

  const { nombre, apellido, email, password, fechaNacimiento, telefono } = req.body;

  // Rechaza dominios no permitidos como @test.com, @fake.com, etc.
  if (!validarDominioEmail(email)) {
    return res.status(400).json({
      message: 'Por favor usa un correo válido (Gmail, Outlook, Yahoo, etc.).'
    });
  }

  const nombreCompleto = `${nombre} ${apellido}`;
  const [dia, mes, anio] = fechaNacimiento.split('/');
  const fechaSQL = `${anio}-${mes}-${dia}`;

  // Verifica que el email no esté ya registrado
  db.query('SELECT id FROM usuarios WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }
    if (results.length > 0) {
      return res.status(400).json({ message: 'El email ya está registrado.' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql = 'INSERT INTO usuarios (nombre, email, password, fecha_nacimiento, telefono, rol, activo, requiere_cambio) VALUES (?, ?, ?, ?, ?, ?, ?, 0)';

      db.query(sql, [nombreCompleto, email, hashedPassword, fechaSQL, telefono || null, 'cliente', 1], async (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Error al crear usuario' });
        }

        const token = generarToken(result.insertId, 'cliente');

        // Envía correo de bienvenida de forma no bloqueante
        enviarBienvenida(nombre, email).catch(err =>
          console.error('Error al enviar correo de bienvenida:', err)
        );

        res.status(201).json({
          id: result.insertId,
          nombre: nombreCompleto,
          email,
          rol: 'cliente',
          token,
          requiere_cambio: 0
        });
      });
    } catch (error) {
      console.error('Error al hashear la contraseña:', error);
      res.status(500).json({ message: 'Error interno al procesar el registro' });
    }
  });
};

// ══════════════════════════════════════════════════════════════════
// LOGIN
// Autentica al usuario y devuelve un token JWT
// Si requiere_cambio = 1, el frontend redirige a cambiar contraseña
// ══════════════════════════════════════════════════════════════════
const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email y contraseña son requeridos' });
  }

  db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error en el servidor' });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const usuario = results[0];

    if (!usuario.activo) {
      return res.status(401).json({ message: 'Cuenta desactivada, contacte al administrador' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password);
    if (!passwordValido) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = generarToken(usuario.id, usuario.rol);
    res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      token,
      requiere_cambio: usuario.requiere_cambio // ← El frontend usa esto para redirigir
    });
  });
};

// ══════════════════════════════════════════════════════════════════
// RECUPERAR PASSWORD
// Genera una contraseña temporal, la guarda en BD con requiere_cambio = 1
// y la envía al correo del usuario
// Al hacer login con esa contraseña, el sistema lo redirige a cambiar contraseña
// ══════════════════════════════════════════════════════════════════
const recuperarPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'El email es obligatorio.' });
  }

  // Verifica que el email exista en la base de datos
  db.query('SELECT id, nombre FROM usuarios WHERE email = ? AND activo = 1', [email], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error en el servidor.' });
    }

    // Por seguridad respondemos igual aunque el email no exista
    // Esto evita que alguien detecte qué emails están registrados
    if (results.length === 0) {
      return res.json({ message: 'Si el correo existe, recibirás tu contraseña temporal en breve.' });
    }

    const usuario = results[0];
    const passwordTemporal = generarPasswordTemporal(); // ej. PonteGuapa#4821

    try {
      // Encripta la contraseña temporal antes de guardarla
      const hashedPassword = await bcrypt.hash(passwordTemporal, 10);

      // Guarda la contraseña temporal y marca requiere_cambio = 1
      // Cuando el usuario haga login, el frontend lo redirigirá a cambiar contraseña
      const sql = 'UPDATE usuarios SET password = ?, requiere_cambio = 1 WHERE id = ?';
      db.query(sql, [hashedPassword, usuario.id], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ message: 'Error al generar contraseña temporal.' });
        }

        // Envía la contraseña temporal por correo de forma no bloqueante
        enviarPasswordTemporal(usuario.nombre, email, passwordTemporal).catch(err =>
          console.error('Error al enviar contraseña temporal:', err)
        );

        res.json({ message: 'Si el correo existe, recibirás tu contraseña temporal en breve.' });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error interno.' });
    }
  });
};

// ══════════════════════════════════════════════════════════════════
// PERFIL
// Devuelve los datos del usuario autenticado
// ══════════════════════════════════════════════════════════════════
const perfil = (req, res) => {
  res.json(req.usuario);
};

module.exports = { registrar, login, perfil, recuperarPassword };