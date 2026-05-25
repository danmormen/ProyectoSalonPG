import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

// ── Celda del calendario bimensual ────────────────────────────────
interface DiaCalendario {
  dia:          number;
  esDelMes:     boolean;
  esHoy:        boolean;
  esTrabajo:    boolean;
  inicio:       string;
  fin:          string;
  semanaISO:    string;   // Lunes de la semana
  tieneHorario: boolean;  // Esa semana tiene alguna entrada
  esSelSemana:  boolean;  // La semana está seleccionada en el resumen
}

// 0=Dom … 6=Sáb → nombre en español
const JS_A_NOMBRE: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves',  5: 'Viernes', 6: 'Sábado'
};

@Component({
  selector: 'app-estilista-horario',
  standalone: true,
  imports: [CommonModule, EstilistaNavbarComponent],
  templateUrl: './horario-estilista.html',
  styleUrls: ['./horario-estilista.css']
})
export class EstilistaHorarioComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/horarios/mi-horario`;

  // Todas las semanas del estilista
  semanas:      any[]  = [];
  cargando      = true;
  mensajeError  = '';

  // ── Semana seleccionada para el resumen ────────────────────────
  semanaSel:    any    = null;   // objeto de semanas[] seleccionado
  semanaSelISO  = '';            // ISO del lunes de esa semana

  // Stats de la semana seleccionada
  diasLaborables      = 0;
  horasSemanalesTotal = 0;
  diasDescansoCount   = 0;
  labelRangoSemana    = '';      // "Lun 4 — Dom 10 may."

  // ── Calendario bimensual ──────────────────────────────────────
  mesBase:      Date                = new Date();
  meses:        DiaCalendario[][][] = [];
  titulosMeses: string[]            = [];
  readonly CABECERA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  readonly HOY_STR:  string;

  // Lookup: semanaISO → Map<diaNombre, {inicio,fin,descanso}>
  private weekMap = new Map<string, Map<string, any>>();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    const hoy    = new Date();
    this.HOY_STR = this.isoFecha(hoy);
    this.mesBase = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  ngOnInit(): void { this.cargarMiHorario(); }

  // ── Helpers ──────────────────────────────────────────────────
  private isoFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  getLunes(d: Date): string {
    const fecha  = new Date(d);
    const diaSem = fecha.getDay();
    const offset = diaSem === 0 ? -6 : 1 - diaSem;
    fecha.setDate(fecha.getDate() + offset);
    return this.isoFecha(fecha);
  }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Carga de datos ────────────────────────────────────────────
  cargarMiHorario(): void {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.cargando = false;
        this.semanas  = res || [];
        if (this.semanas.length > 0) {
          // Construir weekMap
          this.weekMap.clear();
          this.semanas.forEach(s => {
            const diaMap = new Map<string, any>();
            s.horarios.forEach((h: any) => diaMap.set(h.dia, h));
            this.weekMap.set(s.semana_inicio, diaMap);
          });

          // Seleccionar la semana actual (o la más próxima)
          this.seleccionarSemanaActual();
          this.generarCalendario();
          this.mensajeError = '';
        } else {
          this.mensajeError = 'Aún no tienes semanas programadas.';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando     = false;
        this.mensajeError = 'No se pudo conectar con el servidor.';
        this.cdr.detectChanges();
      }
    });
  }

  /** Selecciona la semana que corresponde a hoy, o la más próxima futura */
  private seleccionarSemanaActual() {
    const lunesHoy = this.getLunes(new Date());
    // Buscar la semana actual primero
    let sel = this.semanas.find(s => s.semana_inicio === lunesHoy);
    // Si no existe, la primera (las semanas vienen de más reciente a más antigua)
    if (!sel) sel = this.semanas[0];
    this.aplicarSemana(sel);
  }

  /** Aplica la semana seleccionada al resumen y marca el ISO */
  aplicarSemana(sem: any) {
    if (!sem) return;
    this.semanaSel     = sem;
    this.semanaSelISO  = sem.semana_inicio;
    this.diasLaborables      = sem.diasLaborables;
    this.diasDescansoCount   = sem.diasDescanso;
    this.horasSemanalesTotal = sem.horasTotal;
    this.labelRangoSemana    = this.calcLabelRango(sem.semana_inicio);
    this.cdr.detectChanges();
  }

  /** "Lun 4 may – Dom 10 may 2026" */
  private calcLabelRango(lunesISO: string): string {
    const lunes = new Date(lunesISO + 'T00:00:00');
    const dom   = new Date(lunes);
    dom.setDate(dom.getDate() + 6);
    const fmtL = lunes.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    const fmtD = dom.toLocaleDateString('es-ES',   { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    return `${fmtL} – ${fmtD}`;
  }

  // ── Click en fila de semana del calendario → selecciona esa semana ──
  seleccionarSemana(semanaISO: string, esDelMes: boolean) {
    if (!semanaISO || !esDelMes) return;
    const sem = this.semanas.find(s => s.semana_inicio === semanaISO);
    if (sem) {
      this.aplicarSemana(sem);
      this.generarCalendario(); // refresca esSelSemana en cada celda
    }
  }

  // ── Generar cuadrícula 2 meses ────────────────────────────────
  generarCalendario() {
    this.meses        = [];
    this.titulosMeses = [];
    const hoyStr      = this.HOY_STR;

    for (let m = 0; m < 2; m++) {
      const primerDia = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() + m, 1);
      this.titulosMeses.push(
        primerDia.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
          .replace(/^\w/, c => c.toUpperCase())
      );

      const diaSem  = primerDia.getDay();
      const offset  = diaSem === 0 ? 6 : diaSem - 1;
      const inicio  = new Date(primerDia);
      inicio.setDate(inicio.getDate() - offset);

      const semanas: DiaCalendario[][] = [];
      for (let s = 0; s < 6; s++) {
        const semana: DiaCalendario[] = [];
        for (let d = 0; d < 7; d++) {
          const fecha     = new Date(inicio);
          fecha.setDate(inicio.getDate() + s * 7 + d);
          const esDelMes  = fecha.getMonth() === primerDia.getMonth();
          const nombre    = JS_A_NOMBRE[fecha.getDay()];
          const semISO    = this.getLunes(fecha);
          const diaMap    = this.weekMap.get(semISO);
          const horario   = diaMap?.get(nombre);
          const esTrabajo = esDelMes && !!horario && !horario.descanso;

          semana.push({
            dia:          fecha.getDate(),
            esDelMes,
            esHoy:        this.isoFecha(fecha) === hoyStr,
            esTrabajo,
            inicio:       horario?.inicio?.substring(0,5) || '',
            fin:          horario?.fin?.substring(0,5)    || '',
            semanaISO:    semISO,
            tieneHorario: esDelMes && !!diaMap,
            esSelSemana:  esDelMes && semISO === this.semanaSelISO
          });
        }
        semanas.push(semana);
      }
      this.meses.push(semanas);
    }
    this.cdr.detectChanges();
  }

  get tituloPeriodo(): string { return this.titulosMeses.join(' — '); }

  mesAnterior():  void {
    this.mesBase = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() - 2, 1);
    this.generarCalendario();
  }
  mesSiguiente(): void {
    this.mesBase = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() + 2, 1);
    this.generarCalendario();
  }
  volverMesActual(): void {
    const hoy    = new Date();
    this.mesBase = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.generarCalendario();
  }
  get esMesActual(): boolean {
    const hoy = new Date();
    return this.mesBase.getFullYear() === hoy.getFullYear() &&
           this.mesBase.getMonth()    === hoy.getMonth();
  }

  onNavigate(dest: string): void { this.navigate.emit(dest); }
  cerrarSesion(): void           { this.logout.emit(); }
}
