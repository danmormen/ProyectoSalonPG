import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {

  // ══════════════════════════════════════════════════════════════════
  // Eventos de salida — cada rol tiene su propio @Output porque app.html
  // necesita reaccionar diferente según quién entró. Si hubiera un solo
  // evento genérico 'loginExitoso', app.ts tendría que leer sessionStorage
  // para saber a dónde navegar, lo cual es más frágil.
  //
  // onAdminLogin          → va directo al panel de administrador
  // onEstilistaLogin      → va al panel del estilista
  // onLogin               → va al home del cliente
  // onRequirePasswordChange → va a cambio obligatorio (cualquier rol)
  // ══════════════════════════════════════════════════════════════════
  @Output() onLogin                 = new EventEmitter<void>();
  @Output() onAdminLogin            = new EventEmitter<void>();
  @Output() onEstilistaLogin        = new EventEmitter<void>();
  @Output() onRequirePasswordChange = new EventEmitter<void>();
  @Output() onNavigate              = new EventEmitter<string>();
  @Output() onOlvidePassword        = new EventEmitter<void>();

  email       = '';
  pass        = '';
  cargando    = false;
  mostrarPass = false;

  constructor(private http: HttpClient) {}

  iniciarSesion() {
    if (!this.email || !this.pass) {
      alert('Por favor, ingresa tus credenciales');
      return;
    }

    this.cargando = true;

    this.http.post(`${environment.apiUrl}/api/auth/login`, {
      email:    this.email,
      password: this.pass
    }).subscribe({
      next: (respuesta: any) => {
        this.cargando = false;

        // El token se guarda en sessionStorage para adjuntarlo a todas
        // las peticiones protegidas que haga el usuario durante su sesión.
        sessionStorage.setItem('token', respuesta.token);

        // Se guarda el objeto usuario con los datos mínimos necesarios:
        // id (para rutas como /api/usuarios/:id), nombre (para el navbar),
        // rol (para redireccionar después del cambio de contraseña)
        // y requiere_cambio (para forzar el cambio si es necesario).
        sessionStorage.setItem('usuario', JSON.stringify({
          id:              respuesta.id,
          nombre:          respuesta.nombre,
          rol:             respuesta.rol,
          requiere_cambio: respuesta.requiere_cambio
        }));

        const rol            = respuesta.rol;
        const requiereCambio = respuesta.requiere_cambio === 1 || respuesta.requiere_cambio === true;

        // ── Lógica de roles y redirección ─────────────────────────
        // El orden importa: primero se revisa requiere_cambio porque
        // aplica a cualquier rol. Si el estilista nuevo o el cliente
        // con contraseña temporal entra, lo primero que tiene que
        // hacer es cambiar su clave, sin importar su rol.
        if (rol === 'admin') {
          // El admin no pasa por flujo de cambio de contraseña desde aquí.
          // Si un admin necesita cambiarla, el otro admin se la resetea manualmente.
          this.onAdminLogin.emit();

        } else if (rol === 'estilista') {
          if (requiereCambio) {
            // Estilista que entra por primera vez con la contraseña
            // provisional que le asignó el admin al crear su cuenta.
            this.onRequirePasswordChange.emit();
          } else {
            this.onEstilistaLogin.emit();
          }

        } else {
          // Cliente
          if (requiereCambio) {
            // Cliente que recuperó su contraseña y está usando la temporal.
            this.onRequirePasswordChange.emit();
          } else {
            this.onLogin.emit();
          }
        }
      },
      error: (errorRes) => {
        this.cargando = false;
        if (errorRes.status === 401) {
          // 401 significa que el backend encontró el email pero la contraseña no coincide,
          // o que la cuenta está desactivada. El mensaje viene del backend.
          alert(errorRes.error?.message || 'Correo o contraseña incorrectos.');
        } else {
          // Cualquier otro error (500, sin conexión, etc.) probablemente
          // significa que el servidor no está corriendo.
          alert('Error de conexión. Asegúrate de que el servidor esté encendido.');
        }
      }
    });
  }

  irARegistro() {
    this.onNavigate.emit('registro');
  }

  irAOlvide() {
    this.onOlvidePassword.emit();
  }
}
