// Módulo de correos transaccionales del sistema PonteGuapa.
// Cada función construye un HTML completo con el diseño del salón
// (fondo degradado rosa, tarjeta blanca, footer) y lo envía con nodemailer.
//
// El transporter se crea una sola vez al importar el módulo y se reutiliza
// para todos los envíos. Las credenciales vienen de variables de entorno
// (.env) para no exponer datos sensibles en el repositorio.
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ══════════════════════════════════════════════════════════════════
// convertirLinkImagen
// Los links de Google Drive que el usuario copia normalmente tienen
// el formato /file/d/ID/view, que no es una URL directa de imagen.
// Esta función extrae el ID del archivo y arma la URL con export=view
// que sí devuelve la imagen directamente como <img src="">.
// Si la URL no es de Drive (ya es directa o es null), se devuelve tal cual.
// ══════════════════════════════════════════════════════════════════
const convertirLinkImagen = (url) => {
  if (!url) return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }
  return url;
};

// ══════════════════════════════════════════════════════════════════
// generarBloqueImagen
// Devuelve el bloque HTML de la imagen centrada para insertarlo
// en la posición que elija el admin (arriba, medio o abajo del mensaje).
// Si no hay URL simplemente devuelve string vacío para no romper el template.
// ══════════════════════════════════════════════════════════════════
const generarBloqueImagen = (url) => {
  if (!url) return '';
  return `
    <div style="margin: 20px 0; text-align: center;">
      <img src="${url}" alt="Imagen PonteGuapa"
        style="width: 100%; max-width: 560px; border-radius: 10px; object-fit: cover;">
    </div>
  `;
};

// ══════════════════════════════════════════════════════════════════
// enviarBienvenida
// Se llama desde authController al momento de registrar un cliente nuevo.
// Le indica qué puede hacer en la app: reservar citas, acumular puntos
// y explorar servicios. No incluye imagen ni datos de cita porque
// en ese momento el cliente aún no tiene ninguna.
// ══════════════════════════════════════════════════════════════════
const enviarBienvenida = async (nombre, email) => {
  const mailOptions = {
    from: `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '¡Bienvenida a PonteGuapa!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #D8A7B1, #B76E79); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px;">PonteGuapa</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Salón de Belleza</p>
        </div>

        <!-- Body -->
        <div style="background: #fff; padding: 32px 28px; border: 1px solid #f0e0e4; border-top: none;">
          <h2 style="color: #2F2A2A; margin: 0 0 6px;">¡Hola, ${nombre}! </h2>
          <p style="color: #7A5A5F; margin: 0 0 24px;">Nos alegra tenerte con nosotras. Tu cuenta ha sido creada exitosamente.</p>

          <!-- Card de bienvenida -->
          <div style="background: #FDF5F6; border: 1px solid #F0D5DA; border-radius: 10px; padding: 20px 22px; margin-bottom: 24px; text-align: center;">
            <p style="margin: 0 0 10px; font-size: 15px; color: #B76E79; font-weight: 600;">¿Qué puedes hacer ahora?</p>
            <p style="margin: 0; color: #7A5A5F; font-size: 14px; line-height: 1.9;">
                    Reservar tu primera cita<br>
                    Acumular puntos y canjear recompensas<br>
                 Explorar todos nuestros servicios y promociones
            </p>
          </div>

          <p style="color: #9B6F75; font-size: 13px; margin: 0;">
            Ingresa a la app con tu correo y contraseña cuando quieras.<br><br>
            ¡Te esperamos pronto!
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #FDF0F2; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #f0e0e4; border-top: none;">
          <p style="margin: 0; color: #B76E79; font-size: 12px;">© 2026 PonteGuapa — Todos los derechos reservados</p>
        </div>

      </div>
    `
  };
  await transporter.sendMail(mailOptions);
};

// ══════════════════════════════════════════════════════════════════
// enviarPasswordTemporal
// Se llama desde el endpoint de recuperación de contraseña cuando
// el admin o el sistema genera una clave provisional para el usuario.
// La clave se muestra en grande para que sea fácil de leer y copiar.
// El aviso amarillo recuerda que debe cambiarla al ingresar
// (el flag requiere_cambio=1 fuerza ese comportamiento en el login).
// ══════════════════════════════════════════════════════════════════
const enviarPasswordTemporal = async (nombre, email, passwordTemporal) => {
  const mailOptions = {
    from: `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Recuperación de contraseña — PonteGuapa',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #D8A7B1, #B76E79); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px;">PonteGuapa</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Salón de Belleza</p>
        </div>

        <!-- Body -->
        <div style="background: #fff; padding: 32px 28px; border: 1px solid #f0e0e4; border-top: none;">
          <h2 style="color: #2F2A2A; margin: 0 0 6px;">¡Hola, ${nombre}!</h2>
          <p style="color: #7A5A5F; margin: 0 0 24px;">Recibimos una solicitud para restablecer tu contraseña. Usa la siguiente clave temporal para ingresar:</p>

          <!-- Clave temporal destacada -->
          <div style="background: #FDF5F6; border: 2px dashed #D8A7B1; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #9B6F75; text-transform: uppercase; letter-spacing: 1px;">Contraseña temporal</p>
            <span style="font-size: 30px; font-weight: 700; color: #B76E79; letter-spacing: 6px;">${passwordTemporal}</span>
          </div>

          <!-- Aviso -->
          <div style="background: #FFF8E7; border-left: 4px solid #D4A84B; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #7A6000; font-size: 14px; line-height: 1.6;">
              <strong>⚠️ Al ingresar deberás establecer una nueva contraseña.</strong><br>
              Si no solicitaste este cambio, puedes ignorar este correo.
            </p>
          </div>

          <p style="color: #9B6F75; font-size: 13px; margin: 0;">¡Nos vemos pronto! </p>
        </div>

        <!-- Footer -->
        <div style="background: #FDF0F2; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #f0e0e4; border-top: none;">
          <p style="margin: 0; color: #B76E79; font-size: 12px;">© 2026 PonteGuapa — Todos los derechos reservados</p>
        </div>

      </div>
    `
  };
  await transporter.sendMail(mailOptions);
};

// ══════════════════════════════════════════════════════════════════
// enviarNotificacion
// Correo de campaña masiva que el admin envía desde el panel de notificaciones.
// Soporta una imagen opcional que puede colocarse en tres posiciones:
//   'arriba'  — antes del texto del mensaje
//   'medio'   — entre el mensaje y el cierre (default)
//   'abajo'   — al final de todo el contenido
//
// El mensaje de cierre (mensajeCierre) es opcional y sirve para
// agregar una despedida o llamada a la acción después de la imagen.
//
// Los saltos de línea del mensaje se convierten a <br> para que
// el admin pueda escribir en el panel con Enter y se vea bien en el correo.
// ══════════════════════════════════════════════════════════════════
const enviarNotificacion = async (nombre, email, asunto, mensaje, imagenUrl = null, posicionImagen = 'medio', mensajeCierre = null) => {
  const urlImagen    = convertirLinkImagen(imagenUrl);
  const bloqueImagen = generarBloqueImagen(urlImagen);

  // Se arma el cuerpo una vez con los tres posibles bloques de imagen.
  // Solo uno de los tres tendrá contenido real según posicionImagen;
  // los demás devolverán string vacío desde generarBloqueImagen.
  const cuerpo = `
    ${posicionImagen === 'arriba' ? bloqueImagen : ''}

    <div style="background: #FDF5F6; border-left: 4px solid #B76E79; padding: 16px; border-radius: 6px; margin: 16px 0;">
      <p style="margin: 0; color: #2F2A2A; line-height: 1.8;">
        ${mensaje.replace(/\n/g, '<br>')}
      </p>
    </div>

    ${posicionImagen === 'medio' ? bloqueImagen : ''}

    ${mensajeCierre ? `
      <p style="color: #555; font-style: italic; margin-top: 16px;">
        ${mensajeCierre}
      </p>
    ` : ''}

    ${posicionImagen === 'abajo' ? bloqueImagen : ''}
  `;

  const mailOptions = {
    from: `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: asunto,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #D8A7B1, #B76E79); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px;">PonteGuapa</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Salón de Belleza</p>
        </div>

        <!-- Body -->
        <div style="background: #fff; padding: 32px 28px; border: 1px solid #f0e0e4; border-top: none;">
          <h2 style="color: #2F2A2A; margin: 0 0 6px;">¡Hola, ${nombre}!</h2>
          ${cuerpo}
          <p style="color: #9B6F75; font-size: 13px; margin-top: 20px;">
            Este mensaje fue enviado por el equipo de PonteGuapa.<br>
            Si tienes dudas, visítanos directamente en el salón.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #FDF0F2; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #f0e0e4; border-top: none;">
          <p style="margin: 0; color: #B76E79; font-size: 12px;">© 2026 PonteGuapa — Todos los derechos reservados</p>
        </div>

      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// ══════════════════════════════════════════════════════════════════
// enviarConfirmacionCita
// Se llama desde citas.js justo después de insertar la cita en la BD,
// de forma asíncrona para no hacer esperar al cliente.
//
// La fecha viene en formato ISO ('2025-06-15'). Se separa en year/month/day
// antes de construir el Date para evitar el desfase UTC que causaría
// 'new Date("2025-06-15")' en zonas horarias con offset negativo.
// Con new Date(y, m-1, d) siempre se usa hora local del servidor.
//
// La hora viene en formato 24h ('14:30'). Se convierte a AM/PM porque
// es el formato que los clientes esperan ver en un correo de confirmación.
// El módulo 12 con || 12 convierte 0:xx (medianoche) a 12:xx AM correctamente.
// ══════════════════════════════════════════════════════════════════
const enviarConfirmacionCita = async (nombre, email, cita) => {
  const [y, m, d] = cita.fecha.split('-').map(Number);
  const fechaObj  = new Date(y, m - 1, d);
  const fechaLegible = fechaObj.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).replace(/^\w/, c => c.toUpperCase());  // Capitaliza el día de la semana

  const [hh, mm] = cita.hora.split(':').map(Number);
  const ampm     = hh >= 12 ? 'PM' : 'AM';
  const h12      = hh % 12 || 12;
  const horaLegible = `${h12}:${String(mm).padStart(2,'0')} ${ampm}`;

  const mailOptions = {
    from: `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '¡Tu cita ha sido agendada! — PonteGuapa',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #D8A7B1, #B76E79); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px;">PonteGuapa</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Salón de Belleza</p>
        </div>

        <!-- Body -->
        <div style="background: #fff; padding: 32px 28px; border: 1px solid #f0e0e4; border-top: none;">
          <h2 style="color: #2F2A2A; margin: 0 0 6px;">¡Hola, ${nombre}!</h2>
          <p style="color: #7A5A5F; margin: 0 0 24px;">Tu cita ha sido agendada exitosamente. Aquí tienes el resumen:</p>

          <!-- Tarjeta con el detalle de la cita -->
          <div style="background: #FDF5F6; border: 1px solid #F0D5DA; border-radius: 10px; padding: 20px 22px; margin-bottom: 24px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 7px 0; color: #9B6F75; font-size: 13px; width: 120px;">Servicio</td>
                <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${cita.servicio}</td>
              </tr>
              <tr>
                <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Fecha</td>
                <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${fechaLegible}</td>
              </tr>
              <tr>
                <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Hora</td>
                <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${horaLegible}</td>
              </tr>
              <tr>
                <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Estilista</td>
                <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${cita.estilista}</td>
              </tr>
              <tr>
                <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Total</td>
                <td style="padding: 7px 0; color: #B76E79; font-weight: 700; font-size: 16px;">Q${parseFloat(cita.precio).toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <!-- Aviso: la cita inicia como 'pendiente', el cliente debe confirmarla -->
          <div style="background: #FFF8E7; border-left: 4px solid #D4A84B; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #7A6000; font-size: 14px; line-height: 1.6;">
              <strong>⚠️ Recuerda confirmar tu cita</strong><br>
              Tu cita está en estado <strong>Pendiente</strong>. Para que quede confirmada, ingresa a la app y confírmala desde <strong>"Mis Citas"</strong> antes de tu visita.
            </p>
          </div>

          <!-- Botón para ir a Mis Citas -->
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}"
               style="display: inline-block; background: linear-gradient(135deg, #D8A7B1, #B76E79);
                      color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 30px;
                      font-weight: 600; font-size: 15px; letter-spacing: 0.5px;">
              Ver mis citas
            </a>
          </div>

          <p style="color: #9B6F75; font-size: 13px; margin: 0;">
            Si necesitas cancelar tu cita, puedes hacerlo desde <strong>Mis Citas</strong> con al menos <strong>24 horas de anticipación</strong>.<br><br>
            ¡Nos vemos pronto!
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #FDF0F2; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #f0e0e4; border-top: none;">
          <p style="margin: 0; color: #B76E79; font-size: 12px;">© 2026 PonteGuapa — Todos los derechos reservados</p>
        </div>

      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// ══════════════════════════════════════════════════════════════════
// _buildRecordatorioHtml  (helper interno)
// Construye el HTML compartido de los correos de recordatorio.
// Recibe el título del aviso y el subtítulo para no duplicar el
// template completo entre enviarRecordatorio12h y enviarRecordatorio2h.
// ══════════════════════════════════════════════════════════════════
function _buildRecordatorioHtml(nombre, cita, tituloAviso, subtituloAviso, colorAviso, colorBorde) {
  const [y, m, d]   = cita.fecha.split('-').map(Number);
  const fechaLegible = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).replace(/^\w/, c => c.toUpperCase());

  const [hh, mm] = cita.hora.split(':').map(Number);
  const ampm      = hh >= 12 ? 'PM' : 'AM';
  const h12       = hh % 12 || 12;
  const horaLegible = `${h12}:${String(mm).padStart(2,'0')} ${ampm}`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">

      <!-- Header -->
      <div style="background: linear-gradient(135deg, #D8A7B1, #B76E79); padding: 28px 24px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 26px; letter-spacing: 1px;">PonteGuapa</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">Salón de Belleza</p>
      </div>

      <!-- Body -->
      <div style="background: #fff; padding: 32px 28px; border: 1px solid #f0e0e4; border-top: none;">
        <h2 style="color: #2F2A2A; margin: 0 0 6px;">¡Hola, ${nombre}!</h2>

        <!-- Banner recordatorio -->
        <div style="background: ${colorAviso}; border-left: 4px solid ${colorBorde}; border-radius: 6px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 15px; font-weight: 700; color: #2F2A2A;">${tituloAviso}</p>
          <p style="margin: 6px 0 0; font-size: 13px; color: #555;">${subtituloAviso}</p>
        </div>

        <!-- Tarjeta resumen cita -->
        <div style="background: #FDF5F6; border: 1px solid #F0D5DA; border-radius: 10px; padding: 20px 22px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 7px 0; color: #9B6F75; font-size: 13px; width: 120px;">Servicio</td>
              <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${cita.servicios}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Fecha</td>
              <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${fechaLegible}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Hora</td>
              <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${horaLegible}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #9B6F75; font-size: 13px;">Estilista</td>
              <td style="padding: 7px 0; color: #2F2A2A; font-weight: 600;">${cita.estilista}</td>
            </tr>
          </table>
        </div>

        <!-- Botón -->
        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}"
             style="display: inline-block; background: linear-gradient(135deg, #D8A7B1, #B76E79);
                    color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 30px;
                    font-weight: 600; font-size: 15px; letter-spacing: 0.5px;">
            Ver mis citas
          </a>
        </div>

        <p style="color: #9B6F75; font-size: 13px; margin: 0;">¡Te esperamos!</p>
      </div>

      <!-- Footer -->
      <div style="background: #FDF0F2; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; border: 1px solid #f0e0e4; border-top: none;">
        <p style="margin: 0; color: #B76E79; font-size: 12px;">© 2026 PonteGuapa — Todos los derechos reservados</p>
      </div>

    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════
// enviarRecordatorio12h
// Recordatorio automático enviado ~12 horas antes de la cita.
// cita: { fecha, hora, servicios, estilista }
// ══════════════════════════════════════════════════════════════════
const enviarRecordatorio12h = async (nombre, email, cita) => {
  await transporter.sendMail({
    from:    `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: '⏰ Tu cita es mañana — PonteGuapa',
    html:    _buildRecordatorioHtml(
      nombre, cita,
      '⏰ Tu cita es mañana',
      'Recuerda que tienes una cita agendada. ¡Te esperamos lista y puntual!',
      '#EEF7FF', '#5BA3D9'
    )
  });
};

// ══════════════════════════════════════════════════════════════════
// enviarRecordatorio2h
// Recordatorio automático enviado ~2 horas antes de la cita.
// cita: { fecha, hora, servicios, estilista }
// ══════════════════════════════════════════════════════════════════
const enviarRecordatorio2h = async (nombre, email, cita) => {
  await transporter.sendMail({
    from:    `"PonteGuapa" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: '🌸 Tu cita es en 2 horas — PonteGuapa',
    html:    _buildRecordatorioHtml(
      nombre, cita,
      '🌸 ¡Tu cita es en 2 horas!',
      'Ya casi es tu momento. ¡Nos vemos muy pronto!',
      '#FDF5F6', '#D8A7B1'
    )
  });
};

module.exports = {
  enviarBienvenida,
  enviarPasswordTemporal,
  enviarNotificacion,
  enviarConfirmacionCita,
  enviarRecordatorio12h,
  enviarRecordatorio2h
};
