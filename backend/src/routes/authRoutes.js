const express = require('express');
const { body } = require('express-validator');
const { registrar, login, perfil, recuperarPassword } = require('../controllers/authController'); // ← Quitamos resetearPassword
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ══════════════════════════════════════════════════════════════════
// VALIDACIONES DE REGISTRO
// ══════════════════════════════════════════════════════════════════
const validarRegistro = [
  body('nombre').notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('telefono').optional().isLength({ min: 8 }).withMessage('Teléfono inválido')
];

// ══════════════════════════════════════════════════════════════════
// RUTAS PÚBLICAS — No requieren token
// ══════════════════════════════════════════════════════════════════

// Registro de nuevo cliente
router.post('/registro', validarRegistro, registrar);

// Login — devuelve token JWT
router.post('/login', login);

// Recuperar contraseña — genera contraseña temporal y la envía por correo
router.post('/recuperar-password', recuperarPassword);

// ══════════════════════════════════════════════════════════════════
// RUTAS PROTEGIDAS — Requieren token JWT válido
// ══════════════════════════════════════════════════════════════════

// Obtener datos del usuario autenticado
router.get('/perfil', protect, perfil);

module.exports = router;