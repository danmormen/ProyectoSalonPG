import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ClientNavbarComponent } from '../../cliente/client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientNavbarComponent],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css'
})
export class PerfilComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/usuarios`;

  cargando        = true;
  guardando       = false;
  mensaje         = '';
  tipoMensaje:    'exito' | 'error' = 'exito';
  telefonoNumeros = ''; // Solo los 8 dígitos sin el +502

  usuario = {
    id:               0,
    nombre:           '',
    apellido:         '',
    email:            '',
    telefono:         '',
    fecha_nacimiento: '',
    iniciales:        ''
  };

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarPerfil();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // ── Carga los datos del usuario desde el backend ──────────────────
  cargarPerfil() {
    const userStr = localStorage.getItem('usuario');
    if (!userStr) {
      this.cargando = false;
      return;
    }

    const user    = JSON.parse(userStr);
    const headers = this.getAuthHeaders();

    this.http.get<any>(`${this.apiUrl}/${user.id}`, { headers }).subscribe({
      next: (data) => {
        const partes              = (data.nombre || '').split(' ');
        this.usuario.id           = data.id;
        this.usuario.nombre       = partes[0] || '';
        this.usuario.apellido     = partes.slice(1).join(' ') || '';
        this.usuario.email        = data.email || '';
        this.usuario.telefono     = data.telefono || '';
        this.usuario.fecha_nacimiento = data.fecha_nacimiento
          ? data.fecha_nacimiento.split('T')[0]
          : '';

        // Extrae solo los 8 dígitos del teléfono
        this.extraerNumerosTelefono();
        this.actualizarIniciales();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar perfil:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Extrae los últimos 8 dígitos del teléfono guardado ────────────
  extraerNumerosTelefono() {
    const tel        = this.usuario.telefono || '';
    const soloNumeros = tel.replace(/\D/g, ''); // Quita todo lo que no sea número
    this.telefonoNumeros = soloNumeros.slice(-8); // Toma los últimos 8 dígitos
  }

  // ── Construye el teléfono completo con +502 ───────────────────────
  construirTelefono(): string {
    return this.telefonoNumeros ? `+502${this.telefonoNumeros}` : '';
  }

  // ── Solo permite números y máximo 8 dígitos ───────────────────────
  validarTelefono(event: KeyboardEvent) {
    const teclasSinRestriccion = [
      'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'
    ];

    // Bloquea cualquier tecla que no sea número ni tecla de control
    if (!/^\d$/.test(event.key) && !teclasSinRestriccion.includes(event.key)) {
      event.preventDefault();
      return;
    }

    // Bloquea si ya tiene 8 dígitos y no es una tecla de control
    const input = event.target as HTMLInputElement;
    if (
      input.value.length >= 8 &&
      !teclasSinRestriccion.includes(event.key)
    ) {
      event.preventDefault();
    }
  }

  // ── Actualiza las iniciales del avatar ────────────────────────────
  actualizarIniciales() {
    const n              = this.usuario.nombre?.charAt(0)?.toUpperCase() || '';
    const a              = this.usuario.apellido?.charAt(0)?.toUpperCase() || '';
    this.usuario.iniciales = n + a;
  }

  // ── Guarda los cambios del perfil ─────────────────────────────────
  guardarCambios() {
    if (this.guardando) return;

    if (!this.usuario.nombre.trim()) {
      return this.mostrarMensaje('El nombre es obligatorio.', 'error');
    }

    // Valida que el teléfono tenga exactamente 8 dígitos si se ingresó
    if (this.telefonoNumeros && this.telefonoNumeros.length !== 8) {
      return this.mostrarMensaje('El teléfono debe tener exactamente 8 dígitos.', 'error');
    }

    this.guardando    = true;
    const headers     = this.getAuthHeaders();
    const telefonoCompleto = this.construirTelefono();

    const payload = {
      nombre:           `${this.usuario.nombre.trim()} ${this.usuario.apellido.trim()}`.trim(),
      telefono:         telefonoCompleto || null,
      fecha_nacimiento: this.usuario.fecha_nacimiento || null
    };

    this.http.patch(`${this.apiUrl}/${this.usuario.id}/perfil`, payload, { headers }).subscribe({
      next: () => {
        this.guardando        = false;
        this.usuario.telefono = telefonoCompleto;
        this.actualizarIniciales();

        // Actualiza el nombre en localStorage
        const userStr = localStorage.getItem('usuario');
        if (userStr) {
          const user  = JSON.parse(userStr);
          user.nombre = payload.nombre;
          localStorage.setItem('usuario', JSON.stringify(user));
        }

        this.mostrarMensaje('¡Cambios guardados correctamente!', 'exito');
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.guardando = false;
        this.mostrarMensaje(err.error?.message || 'Error al guardar los cambios.', 'error');
      }
    });
  }

  // ── Muestra mensaje temporal de éxito o error ─────────────────────
  private mostrarMensaje(texto: string, tipo: 'exito' | 'error') {
    this.mensaje     = texto;
    this.tipoMensaje = tipo;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.mensaje = '';
      this.cdr.detectChanges();
    }, 3000);
  }

  private readonly MAPA: Record<string,string> = {
    inicio:'home', reservar:'reservar', ver:'ver-cita',
    servicios:'servicios', promociones:'promociones',
    recompensas:'recompensas', resenas:'resenas', perfil:'perfil'
  };

  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion()               { this.logout.emit(); }
}