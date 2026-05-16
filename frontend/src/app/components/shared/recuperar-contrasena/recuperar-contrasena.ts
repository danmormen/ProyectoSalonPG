import { Component, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-recuperar-contrasena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recuperar-contrasena.html',
  styleUrls: ['./recuperar-contrasena.css']
})
export class RecuperarContrasenaComponent {
  @Output() onCancel  = new EventEmitter<void>();
  @Output() onSuccess = new EventEmitter<void>();

  email      = '';
  errorMsg   = '';
  successMsg = '';
  cargando   = false;
  contador   = 3; // ← Cuenta regresiva visible para el usuario

  private apiUrl = `${environment.apiUrl}/api/auth`;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  // ── Envía el email al backend ─────────────────────────────────────
  // El backend genera contraseña temporal, la guarda con requiere_cambio = 1
  // y la envía al correo del usuario
  enviarPasswordTemporal() {
    this.errorMsg   = '';
    this.successMsg = '';

    if (!this.email || !this.email.includes('@')) {
      this.errorMsg = 'Por favor ingresa un correo electrónico válido.';
      return;
    }

    this.cargando = true;

    this.http.post(`${this.apiUrl}/recuperar-password`, { email: this.email }).subscribe({
      next: (res: any) => {
        this.cargando   = false;
        this.successMsg = '¡Correo enviado! Revisa tu bandeja de entrada.';
        this.cdr.detectChanges();

        // Cuenta regresiva de 3 segundos antes de ir al login
        const intervalo = setInterval(() => {
          this.contador--;
          this.cdr.detectChanges();
          if (this.contador === 0) {
            clearInterval(intervalo);
            this.onSuccess.emit(); // ← Redirige al login
          }
        }, 1000);
      },
      error: (err) => {
        this.cargando = false;
        console.error('Error al recuperar contraseña:', err);
        this.errorMsg = 'Error al procesar la solicitud. Intenta más tarde.';
      }
    });
  }

  cancelar() {
    this.onCancel.emit();
  }
}