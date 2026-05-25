import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

type HomeSection =
  | 'perfil' | 'servicios' | 'reservar' | 'promociones'
  | 'ver' | 'recompensas' | 'resenas';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit {
  @Output() navigate = new EventEmitter<HomeSection>();
  @Output() logout   = new EventEmitter<void>();

  nombreUsuario = 'Cliente';

  // Citas
  proximasCitas: any[]    = [];
  totalCitas:    number   = 0;
  ultimaCita:    any|null = null;
  cargandoCitas = true;

  // Puntos y próxima recompensa
  puntos                  = 0;
  puntosProximaRecompensa = 500;
  nombreProximaRecompensa = '';
  cargandoPuntos          = true;

  // Servicios del catálogo real
  serviciosDestacados: any[] = [];
  cargandoServicios   = true;

  private apiUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const userStr = sessionStorage.getItem('usuario');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const partes = (user.nombre || '').split(' ');
        this.nombreUsuario = partes[0] || 'Cliente';
      } catch { /* ignorar */ }
    }
    this.cargarCitas();
    this.cargarPuntos();
    this.cargarServicios();
  }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ 'Authorization': 'Bearer ' + token });
  }

  // ── Citas ─────────────────────────────────────────────────────────
  cargarCitas() {
    this.cargandoCitas = true;
    this.http.get<any[]>(this.apiUrl + '/citas/mis-citas', { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

        this.totalCitas = data.length;

        const pasadas = data
          .filter(c => {
            const soloFecha = c.fecha.includes('T') ? c.fecha.split('T')[0] : c.fecha;
            const [y, m, d] = soloFecha.split('-').map(Number);
            return new Date(y, m - 1, d) < hoy;
          })
          .sort((a, b) => {
            const fa = a.fecha.split('T')[0] + 'T' + a.hora;
            const fb = b.fecha.split('T')[0] + 'T' + b.hora;
            return fb.localeCompare(fa);
          });
        this.ultimaCita = pasadas[0] || null;

        this.proximasCitas = data
          .filter(c => {
            if (c.estado === 'cancelada' || c.estado === 'completada') return false;
            const soloFecha = c.fecha.includes('T') ? c.fecha.split('T')[0] : c.fecha;
            const [y, m, d] = soloFecha.split('-').map(Number);
            return new Date(y, m - 1, d) >= hoy;
          })
          .sort((a, b) => {
            const fa = a.fecha.split('T')[0] + 'T' + a.hora;
            const fb = b.fecha.split('T')[0] + 'T' + b.hora;
            return fa.localeCompare(fb);
          })
          .slice(0, 4);

        this.cargandoCitas = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.proximasCitas = [];
        this.cargandoCitas = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Puntos reales ─────────────────────────────────────────────────
  cargarPuntos() {
    this.cargandoPuntos = true;
    this.http.get<{ puntos: number }>(this.apiUrl + '/recompensas/mis-puntos', { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.puntos = res.puntos || 0;
        this.cargarProximaRecompensa();
        this.cdr.detectChanges();
      },
      error: () => {
        this.puntos         = 0;
        this.cargandoPuntos = false;
        this.cdr.detectChanges();
      }
    });
  }

  cargarProximaRecompensa() {
    this.http.get<any[]>(this.apiUrl + '/recompensas').subscribe({
      next: (recompensas) => {
        // La próxima recompensa es la primera cuyo costo supera los puntos actuales
        const proxima = recompensas.find(r => r.puntos_requeridos > this.puntos);
        if (proxima) {
          this.puntosProximaRecompensa = proxima.puntos_requeridos;
          this.nombreProximaRecompensa = proxima.nombre;
        } else if (recompensas.length > 0) {
          // Ya tiene suficientes para todas, mostrar la última
          const ultima = recompensas[recompensas.length - 1];
          this.puntosProximaRecompensa = ultima.puntos_requeridos;
          this.nombreProximaRecompensa = ultima.nombre;
        }
        this.cargandoPuntos = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoPuntos = false; this.cdr.detectChanges(); }
    });
  }

  // ── Servicios reales ──────────────────────────────────────────────
  cargarServicios() {
    this.cargandoServicios = true;
    this.http.get<any[]>(this.apiUrl + '/servicios').subscribe({
      next: (servicios) => {
        // Tomar los primeros 4 activos
        this.serviciosDestacados = servicios
          .filter(s => s.activo)
          .slice(0, 4);
        this.cargandoServicios = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.serviciosDestacados = [];
        this.cargandoServicios   = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────
  formatearFecha(fechaStr: string): string {
    if (!fechaStr) return '';
    const soloFecha = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    const [y, m, d] = soloFecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).replace(/^\w/, c => c.toUpperCase());
  }

  formatearHora(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`;
  }

  formatearDuracion(minutos: number): string {
    if (!minutos) return '';
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }

  get porcentajeProgreso(): number {
    if (!this.puntosProximaRecompensa) return 0;
    return Math.min(100, Math.round((this.puntos / this.puntosProximaRecompensa) * 100));
  }

  estadoLabel(estado: string): string {
    const map: Record<string, string> = {
      pendiente: 'Pendiente', confirmada: 'Confirmada',
      completada: 'Completada', cancelada: 'Cancelada'
    };
    return map[estado] ?? estado;
  }

  goTo(section: HomeSection): void { this.navigate.emit(section); }
  cerrarSesion(): void              { this.logout.emit(); }
}
