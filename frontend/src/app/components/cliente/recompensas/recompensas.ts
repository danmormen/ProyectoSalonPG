import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ClientNavbarComponent } from '../client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-recompensas',
  standalone: true,
  imports: [CommonModule, ClientNavbarComponent],
  templateUrl: './recompensas.html',
  styleUrl: './recompensas.css'
})
export class RecompensasComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  recompensas:       any[] = [];
  historial:         any[] = [];
  puntosDisponibles: number = 0;
  cargando:          boolean = true;
  usuarioId:         number | null = null;

  private apiUrl = `${environment.apiUrl}/api/recompensas`;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Recupera el ID del usuario del sessionStorage
    const userStr = sessionStorage.getItem('usuario');
    if (userStr) {
      const user    = JSON.parse(userStr);
      this.usuarioId = user.id;
    }
    this.cargarRecompensas();
    this.cargarPuntos();
  }

  // ── Headers con token JWT ─────────────────────────────────────────
  private getAuthHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // ── Carga recompensas activas del catálogo ────────────────────────
  cargarRecompensas() {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (data) => {
        // Solo muestra recompensas activas al cliente
        this.recompensas = data.filter(r => r.activo === 1);
        this.cargando    = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar recompensas:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Carga los puntos del usuario autenticado ──────────────────────
  cargarPuntos() {
    const headers = this.getAuthHeaders();
    this.http.get<any>(`${this.apiUrl}/mis-puntos`, { headers }).subscribe({
      next: (data) => {
        this.puntosDisponibles = data.puntos;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar puntos:', err);
      }
    });
  }

  // ── Canjear una recompensa ────────────────────────────────────────
  canjear(recompensa: any): void {
    if (this.puntosDisponibles >= recompensa.puntos_requeridos) {
      const mensaje = `¿Deseas canjear ${recompensa.puntos_requeridos} puntos por "${recompensa.nombre}"?\n\n` +
        `Recuerda: El cupón debe ser validado por el personal del salón al momento de tu pago.`;

      if (confirm(mensaje)) {
        // Genera código de validación aleatorio
        const codigoValidacion = Math.random().toString(36).substring(2, 7).toUpperCase();

        // Descuenta los puntos en el backend
        const headers = this.getAuthHeaders();
        this.http.put(`${this.apiUrl}/admin/puntos`,
          { usuario_id: this.usuarioId, puntos: -recompensa.puntos_requeridos },
          { headers }
        ).subscribe({
          next: (res: any) => {
            this.puntosDisponibles = res.puntos;

            // Agrega al historial local
            const hoy            = new Date();
            const fechaFormateada = hoy.toLocaleDateString('es-ES', {
              day: 'numeric', month: 'long', year: 'numeric'
            });
            this.historial.unshift({
              actividad: `Canjeado - ${recompensa.nombre}`,
              fecha:     fechaFormateada,
              puntos:    recompensa.puntos_requeridos,
              tipo:      'resta'
            });

            this.cdr.detectChanges();
            alert(`¡Canje Exitoso!\n\nTu código es: ${codigoValidacion}\nPresenta esta pantalla en recepción.`);
          },
          error: (err) => {
            alert('Error al canjear: ' + (err.error?.error || err.message));
          }
        });
      }
    } else {
      alert('Lo sentimos, no tienes suficientes puntos para esta recompensa.');
    }
  }

  private readonly MAPA: Record<string,string> = {
    inicio:'home', reservar:'reservar', ver:'ver-cita',
    servicios:'servicios', promociones:'promociones',
    recompensas:'recompensas', resenas:'resenas', perfil:'perfil'
  };

  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion(): void        { this.logout.emit(); }
}