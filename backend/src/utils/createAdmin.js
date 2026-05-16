const db = require('../config/DBconfig');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    const adminEmail = 'admin@ponteguapa.com';
    const adminPassword = 'admin123';
    const adminNombre = 'Administrador Principal';
    
    db.query('SELECT id FROM usuarios WHERE email = ?', [adminEmail], async (err, results) => {
        if (err) {
            console.error('Error:', err);
            return;
        }
        if (results.length > 0) {
            console.log(' El administrador ya existe.');
            process.exit(0);
        }
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const sql = 'INSERT INTO usuarios (nombre, email, password, rol, activo) VALUES (?, ?, ?, ?, ?)';
        db.query(sql, [adminNombre, adminEmail, hashedPassword, 'admin', 1], (err, result) => {
            if (err) {
                console.error('Error al crear admin:', err);
            } else {
                console.log(` Administrador creado:
    Email: ${adminEmail}
    Contraseña: ${adminPassword}
    Rol: admin`);
            }
            process.exit(0);
        });
    });
}

createAdmin();