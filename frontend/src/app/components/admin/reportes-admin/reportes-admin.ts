import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-reportes-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './reportes-admin.html',
  styleUrls: ['./reportes-admin.css']
})
export class ReportesAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/reportes`;

  periodoSeleccionado = 'mes';
  cargando  = true;
  error     = '';

  // ── Datos del API ─────────────────────────────────────────────────
  // ingresosAnterior y citasAnterior vienen del período equivalente anterior
  // (p.ej. si el período es "este mes", el anterior es el mes pasado).
  // Los usa getPorcentajeCambio() para calcular el delta +/- que se muestra
  // junto a cada KPI.
  kpis = {
    ingresos: 0, ingresosAnterior: 0,
    citas: 0,    citasAnterior: 0,
    satisfaccion: 0, satisfaccionAnterior: 0
  };

  totales = { total: 0, completadas: 0, canceladas: 0, pendientes: 0, confirmadas: 0 };

  citasPorDia:     { dia: string; total: number }[] = [];
  serviciosTop:    { nombre: string; total: number }[] = [];
  estilistas:      { nombre: string; citas: number; ingresos: number; satisfaccion: number }[] = [];

  // rango contiene las fechas inicio/fin del período seleccionado,
  // que el backend calcula y devuelve para mostrarlas en el subtitle del reporte.
  rango = { inicio: '', fin: '' };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.cargarReporte(); }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  cargarReporte() {
    this.cargando = true;
    this.error    = '';
    const url = `${this.apiUrl}?periodo=${this.periodoSeleccionado}`;

    this.http.get<any>(url, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.kpis        = data.kpis;
        this.citasPorDia = data.citasPorDia;
        this.serviciosTop= data.serviciosTop;
        this.estilistas  = data.estilistas;
        this.totales     = data.totales;
        this.rango       = data.rango;
        this.cargando    = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.error    = 'No se pudo cargar el reporte.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  onPeriodoChange() { this.cargarReporte(); }

  // ── Helpers de KPIs ──────────────────────────────────────────────
  getPorcentajeCambio(actual: number, anterior: number): number {
    if (!anterior) return actual > 0 ? 100 : 0;
    return Math.round(((actual - anterior) / anterior) * 100);
  }

  esCambioPositivo(actual: number, anterior: number): boolean {
    return actual >= anterior;
  }

  // ── Helpers de gráficas ───────────────────────────────────────────

  getMaxDia(): number {
    // El mínimo de 1 evita división por cero cuando no hay citas en el período.
    return Math.max(...this.citasPorDia.map(d => d.total), 1);
  }

  getAlturaBarra(total: number): number {
    // 160px es la altura máxima del contenedor de las barras en el CSS.
    // La barra del día con más citas ocupa 160px y el resto se escala proporcionalmente.
    return Math.round((total / this.getMaxDia()) * 160);
  }

  esDiaPico(total: number): boolean {
    // Solo el día con más citas recibe la clase visual de "pico".
    // El total > 0 evita que días vacíos sean marcados como pico cuando no hay datos.
    return total > 0 && total === this.getMaxDia();
  }

  getAnchoServicio(total: number): number {
    // Los servicios vienen ya ordenados de mayor a menor desde el backend,
    // así que el primero siempre es el máximo. Se normaliza a 100% para
    // que la barra del más popular ocupe todo el ancho disponible.
    const max = this.serviciosTop[0]?.total || 1;
    return Math.round((total / max) * 100);
  }

  // Devuelve el total de todas las citas en serviciosTop para calcular %.
  get totalServicios(): number {
    return this.serviciosTop.reduce((s, x) => s + x.total, 0);
  }

  getPctServicio(total: number): number {
    if (!this.totalServicios) return 0;
    return Math.round((total / this.totalServicios) * 100);
  }

  // Retorna el día de la semana con más citas en el período, con su nombre completo.
  get diaPico(): { dia: string; diaCompleto: string; total: number } | null {
    const max = this.getMaxDia();
    if (max === 0 || !this.citasPorDia.length) return null;
    const pico = this.citasPorDia.find(d => d.total === max);
    if (!pico) return null;
    const nombres: Record<string, string> = {
      'Lun': 'lunes', 'Mar': 'martes', 'Mié': 'miércoles',
      'Jue': 'jueves', 'Vie': 'viernes', 'Sáb': 'sábados', 'Dom': 'domingos'
    };
    return { ...pico, diaCompleto: nombres[pico.dia] ?? pico.dia };
  }

  // ── Labels de período ─────────────────────────────────────────────
  get labelPeriodo(): string {
    const map: Record<string, string> = {
      semana: 'Esta semana', mes: 'Este mes',
      trimestre: 'Este trimestre', año: 'Este año'
    };
    return map[this.periodoSeleccionado] ?? '';
  }

  get labelRango(): string {
    if (!this.rango.inicio) return '';
    const fmt = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };
    return `${fmt(this.rango.inicio)} – ${fmt(this.rango.fin)}`;
  }

  // ── Tasa de cancelación ───────────────────────────────────────────
  get tasaCancelacion(): number {
    if (!this.totales.total) return 0;
    // Se divide sobre el total (todas las citas del período) para que
    // la tasa refleje la proporción real, no solo vs. las completadas.
    return Math.round((this.totales.canceladas / this.totales.total) * 100);
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()            { this.logout.emit(); }
}
