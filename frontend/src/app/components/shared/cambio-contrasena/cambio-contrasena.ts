import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-cambio-contrasena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cambio-contrasena.html',
  styleUrls: ['./cambio-contrasena.css']
})
export class CambioContrasenaComponent implements OnInit {

  // onPasswordChanged avisa a app.ts que el cambio fue exitoso.
  // app.ts lee el rol del localStorage para saber a dónde navegar.
  // onCancel lleva de vuelta al login si el usuario no quiere continuar.
  @Output() onPasswordChanged = new EventEmitter<void>();
  @Output() onCancel          = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/usuarios`;

  nuevaPassword     = '';
  confirmarPassword = '';
  errorMsg          = '';
  usuarioId: number | null = null;
  rol: string = '';

  mostrarNueva     = false;
  mostrarConfirmar = false;
  guardando        = false;
  exito            = false;

  constructor(private http: HttpClient) {}

  // ══════════════════════════════════════════════════════════════════
  // ngOnInit — lee el id y el rol del usuario desde localStorage.
  // Necesitamos el id para construir la URL del PATCH, y el rol
  // para mostrar el mensaje de instrucción correcto según quién es.
  //
  // Si por alguna razón no hay datos en localStorage (sesión corrupta,
  // alguien llegó aquí sin pasar por el login), se muestra un error
  // en lugar de llamar al backend con un id null.
  // ══════════════════════════════════════════════════════════════════
  ngOnInit() {
    const userStr = localStorage.getItem('usuario');
    if (userStr) {
      try {
        const user     = JSON.parse(userStr);
        this.usuarioId = user.id;
        this.rol       = user.rol || '';
      } catch (error) {
        this.errorMsg = 'Error al recuperar los datos del usuario. Intenta iniciar sesión nuevamente.';
      }
    }

    if (!this.usuarioId) {
      this.errorMsg = 'Error de sesión. No se encontró tu ID. Intenta loguearte de nuevo.';
    }
  }

  // El mensaje de instrucción cambia según el rol porque el contexto es distinto:
  // un estilista nuevo recibió una contraseña temporal del admin,
  // un cliente llegó aquí desde el flujo de recuperación de contraseña.
  getMensajeInstruccion(): string {
    if (this.rol === 'estilista') {
      return 'Es tu primer ingreso. Por seguridad debes cambiar la contraseña provisional que te asignó el administrador.';
    }
    return 'Ingresaste con una contraseña temporal. Establece una nueva contraseña para proteger tu cuenta.';
  }

  // ── Indicador visual de fortaleza ────────────────────────────────
  // Solo evalúa longitud porque el objetivo es orientar al usuario,
  // no aplicar una política estricta (eso lo valida el backend con mínimo 6).
  get fortalezaClass(): string {
    const len = this.nuevaPassword.length;
    if (len < 6)  return 'debil';
    if (len < 10) return 'media';
    return 'fuerte';
  }
  get fortalezaAncho(): string {
    const len = this.nuevaPassword.length;
    if (len === 0) return '0%';
    if (len < 6)   return '33%';
    if (len < 10)  return '66%';
    return '100%';
  }
  get fortalezaTexto(): string {
    const c = this.fortalezaClass;
    if (c === 'debil') return 'Débil';
    if (c === 'media') return 'Media';
    return 'Fuerte';
  }

  // Construye los headers con el JWT. Si no hay token devuelve null
  // y el método que lo llama corta la ejecución antes de hacer el PATCH.
  private getHeaders(): HttpHeaders | null {
    const token = localStorage.getItem('token');
    if (!token) {
      this.errorMsg = 'Error de autenticación. Intenta iniciar sesión nuevamente.';
      return null;
    }
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  // ══════════════════════════════════════════════════════════════════
  // guardarPassword — valida localmente y hace el PATCH al backend.
  //
  // Al recibir respuesta exitosa se actualiza requiere_cambio en
  // localStorage para que si el usuario navega hacia atrás o recarga
  // no vuelva a caer en este flujo en la misma sesión.
  //
  // El setTimeout de 1200ms da tiempo a que el usuario vea el mensaje
  // de éxito antes de que la pantalla cambie, evitando el flash abrupto.
  // ══════════════════════════════════════════════════════════════════
  guardarPassword() {
    this.errorMsg = '';

    if (!this.usuarioId) {
      this.errorMsg = 'Error de sesión. Intenta iniciar sesión nuevamente.';
      return;
    }
    if (this.nuevaPassword.trim().length < 6) {
      this.errorMsg = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (this.nuevaPassword !== this.confirmarPassword) {
      this.errorMsg = 'Las contraseñas no coinciden. Verifícalas e intenta de nuevo.';
      return;
    }

    const headers = this.getHeaders();
    if (!headers) return;

    this.guardando = true;

    this.http.patch(
      `${this.apiUrl}/${this.usuarioId}/cambiar-password`,
      { password: this.nuevaPassword },
      { headers }
    ).subscribe({
      next: () => {
        this.guardando = false;
        this.exito     = true;

        // Sincronizar localStorage para que requiere_cambio refleje el nuevo estado.
        // Esto importa porque completarCambioPassword() en app.ts lee el rol de aquí.
        const userStr = localStorage.getItem('usuario');
        if (userStr) {
          const user       = JSON.parse(userStr);
          user.requiere_cambio = 0;
          localStorage.setItem('usuario', JSON.stringify(user));
        }

        setTimeout(() => this.onPasswordChanged.emit(), 1200);
      },
      error: (err) => {
        this.guardando = false;
        if (err.status === 401) {
          this.errorMsg = 'No autorizado. Verifica tus credenciales.';
        } else if (err.status === 404) {
          this.errorMsg = 'Usuario no encontrado. Intenta iniciar sesión nuevamente.';
        } else {
          this.errorMsg = err.error?.error || 'Error al conectar con el servidor.';
        }
      }
    });
  }

  cancelar() {
    this.onCancel.emit();
  }
}
