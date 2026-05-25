import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

interface DiaSemana {
  nombre: string;
  fecha:  string;   // YYYY-MM-DD
  citas:  number;
  esHoy:  boolean;
}

@Component({
  selector: 'app-pantalla-admin',
  standalone: true,
  imports: [CommonModule, AdminNavbarComponent],
  templateUrl: './pantalla-administrador.html',
  styleUrls: ['./pantalla-administrador.css']
})
export class PantallaAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  // Stats
  citasHoyTotal     = 0;
  clientesAtendidos = 0;   // completadas esta semana

  // Citas de hoy
  citasHoy:     any[]       = [];
  cargandoCitas = true;

  // Gráfica semanal
  semana:         DiaSemana[] = [];
  cargandoSemana  = true;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.construirSemana();
    this.cargarCitasHoy();
    this.cargarSemana();
  }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  // ── Construye la estructura de los 7 días (Lun–Dom) de la semana actual ──
  private construirSemana(): void {
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyISO = this.toISO(hoy);

    // Lunes de esta semana
    const lunes = new Date(hoy);
    const diff  = (hoy.getDay() + 6) % 7;   // 0=Lun … 6=Dom
    lunes.setDate(hoy.getDate() - diff);

    const ABREV = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

    this.semana = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      return { nombre: ABREV[i], fecha: this.toISO(d), citas: 0, esHoy: this.toISO(d) === hoyISO };
    });
  }

  private toISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── Citas de hoy ─────────────────────────────────────────────────
  cargarCitasHoy(): void {
    this.cargandoCitas = true;
    const hoy = this.toISO(new Date());
    this.http.get<any[]>(`${this.apiUrl}/citas?fecha=${hoy}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.citasHoy     = data;
          this.citasHoyTotal = data.length;
          this.cargandoCitas = false;
          this.cdr.detectChanges();
        },
        error: () => { this.cargandoCitas = false; this.cdr.detectChanges(); }
      });
  }

  // ── Citas de la semana (una petición por día en paralelo) ─────────
  cargarSemana(): void {
    this.cargandoSemana = true;
    let pendientes = this.semana.length;
    let completadasSemana = 0;

    this.semana.forEach((dia, idx) => {
      this.http.get<any[]>(`${this.apiUrl}/citas?fecha=${dia.fecha}`, { headers: this.getHeaders() })
        .subscribe({
          next: (data) => {
            this.semana[idx].citas = data.length;
            completadasSemana += data.filter(c => c.estado === 'completada').length;
            if (--pendientes === 0) {
              this.clientesAtendidos = completadasSemana;
              this.cargandoSemana    = false;
              this.cdr.detectChanges();
            }
          },
          error: () => {
            if (--pendientes === 0) {
              this.cargandoSemana = false;
              this.cdr.detectChanges();
            }
          }
        });
    });
  }

  // ── Getters ───────────────────────────────────────────────────────
  get totalSemana(): number {
    return this.semana.reduce((a, d) => a + d.citas, 0);
  }

  get confirmadasHoy(): number {
    return this.citasHoy.filter(c => c.estado === 'confirmada').length;
  }

  get pendientesHoy(): number {
    return this.citasHoy.filter(c => c.estado === 'pendiente').length;
  }

  get maxCitasSemana(): number {
    return Math.max(...this.semana.map(d => d.citas), 1);
  }

  porcentajeBarra(citas: number): number {
    return Math.round((citas / this.maxCitasSemana) * 100);
  }

  formatearHora(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2,'0')} ${ampm}`;
  }

  navegarA(destino: string): void { this.navigate.emit(destino); }
  cerrarSesion(): void            { this.logout.emit(); }
}
