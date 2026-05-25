import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

// ── Celda del calendario bimensual ────────────────────────────────
interface DiaCalendario {
  dia:          number;
  esDelMes:     boolean;
  esHoy:        boolean;
  esTrabajo:    boolean;
  inicio:       string;
  fin:          string;
  semanaISO:    string;   // Lunes de la semana a la que pertenece
  tieneHorario: boolean;  // ¿existe alguna entrada para esa semana?
}

// 0=Dom … 6=Sáb → nombre en español
const JS_A_NOMBRE: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves',  5: 'Viernes', 6: 'Sábado'
};

@Component({
  selector: 'app-horarios-administrador',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './horario-administrador.html',
  styleUrls: ['./horario-administrador.css']
})
export class HorariosAdministradorComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl      = `${environment.apiUrl}/api/horarios`;
  private usuariosUrl = `${environment.apiUrl}/api/usuarios`;

  listaEstilistas:          any[] = [];
  listaEmpleadosSinSemana:  any[] = [];
  private todosLosUsuarios: any[] = [];

  // ── Estilista activo ─────────────────────────────────────────────
  estilistaActivo: any = null;

  // weekMap es un índice de dos niveles para evitar recorrer arrays en el render del calendario.
  // Estructura: semanaISO → Map<diaNombre, {inicio, fin, descanso}>
  // Al renderizar cada celda del calendario solo hacemos dos .get() en lugar de
  // buscar en arrays anidados, lo que es mucho más rápido con muchas semanas asignadas.
  private weekMap = new Map<string, Map<string, any>>();

  // ── Calendario bimensual ──────────────────────────────────────────
  mesBase:      Date                = new Date();
  meses:        DiaCalendario[][][] = [];
  titulosMeses: string[]            = [];
  readonly CABECERA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  readonly HOY_STR:  string;

  // ── Modal ─────────────────────────────────────────────────────────
  mostrarModal  = false;
  guardando     = false;
  modoNuevo     = false;   // true = nuevo (pide empleado), false = editar semana

  seleccionado: any = { id: null, nombre: '', horarios: [] };
  semanaSelISO  = '';   // Lunes de la semana que se edita (YYYY-MM-DD)
  semanaSelLabel = ''; // "27 abr. — 3 may."

  private readonly ORDEN_DIAS = [
    'Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'
  ];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    const hoy    = new Date();
    this.HOY_STR = this.isoFecha(hoy);
    this.mesBase = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  ngOnInit() {
    this.cargarHorarios();
    this.preCargarUsuarios();
  }

  // ── Helpers ──────────────────────────────────────────────────────
  private isoFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /** Devuelve el ISO del lunes de la semana que contiene `d` */
  getLunes(d: Date): string {
    const fecha = new Date(d);
    const diaSem = fecha.getDay();
    const offset = diaSem === 0 ? -6 : 1 - diaSem;
    fecha.setDate(fecha.getDate() + offset);
    return this.isoFecha(fecha);
  }

  /** "Lun 27 abr – Dom 3 may" a partir del ISO del lunes */
  labelSemana(lunesISO: string): string {
    if (!lunesISO) return '';
    const lunes = new Date(lunesISO + 'T00:00:00');
    const dom   = new Date(lunes);
    dom.setDate(dom.getDate() + 6);
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `${fmt(lunes)} – ${fmt(dom)}`;
  }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Carga ─────────────────────────────────────────────────────────
  cargarHorarios() {
    this.http.get<any[]>(this.apiUrl, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.listaEstilistas = res.map(e => ({
          ...e,
          resumen: e.totalSemanas
            ? `${e.totalSemanas} semana(s) asignada(s)`
            : 'Sin semanas asignadas'
        }));

        if (this.estilistaActivo) {
          const act = this.listaEstilistas.find(e => e.id === this.estilistaActivo.id);
          if (act) {
            this.estilistaActivo = act;
            this.construirWeekMap();
            this.generarCalendario();
          }
        }
        this.cdr.detectChanges();
      },
      error: err => console.error('Error cargando horarios:', err)
    });
  }

  preCargarUsuarios() {
    this.http.get<any[]>(this.usuariosUrl, { headers: this.getHeaders() }).subscribe({
      next: us => { this.todosLosUsuarios = us; },
      error: err => console.error('Error cargando usuarios:', err)
    });
  }

  // ── Selección de estilista ────────────────────────────────────────
  seleccionarEstilista(est: any) {
    this.estilistaActivo = est;
    this.construirWeekMap();
    this.generarCalendario();
  }

  /** Construye weekMap a partir de estilistaActivo.semanas */
  private construirWeekMap() {
    this.weekMap.clear();
    for (const semana of (this.estilistaActivo?.semanas || [])) {
      const diaMap = new Map<string, any>();
      for (const h of semana.horarios) diaMap.set(h.dia, h);
      this.weekMap.set(semana.semana_inicio, diaMap);
    }
  }

  // ── Generar calendario 2 meses ────────────────────────────────────
  // Siempre se muestran 2 meses a la vez para que el admin pueda ver
  // continuidad entre semanas que cruzan el límite de mes (p.ej. sem 28 abr – 4 may).
  // Se generan 6 filas × 7 columnas por mes para cubrir cualquier distribución del calendario.
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

      const diaSem = primerDia.getDay();
      const offset = diaSem === 0 ? 6 : diaSem - 1;
      const inicio = new Date(primerDia);
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
            tieneHorario: esDelMes && !!diaMap
          });
        }
        semanas.push(semana);
      }
      this.meses.push(semanas);
    }
    this.cdr.detectChanges();
  }

  get tituloPeriodo(): string { return this.titulosMeses.join(' — '); }

  mesAnterior()  {
    this.mesBase = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() - 2, 1);
    this.generarCalendario();
  }
  mesSiguiente() {
    this.mesBase = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() + 2, 1);
    this.generarCalendario();
  }
  volverMesActual() {
    const hoy = new Date();
    this.mesBase = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.generarCalendario();
  }
  get esMesActual(): boolean {
    const hoy = new Date();
    return this.mesBase.getFullYear() === hoy.getFullYear() &&
           this.mesBase.getMonth()    === hoy.getMonth();
  }

  // ── Modal: click en semana del calendario ─────────────────────────
  editarSemana(semanaISO: string, event?: MouseEvent) {
    event?.stopPropagation();
    if (!this.estilistaActivo) return;

    this.modoNuevo      = false;
    this.semanaSelISO   = semanaISO;
    this.semanaSelLabel = this.labelSemana(semanaISO);

    const diaMap = this.weekMap.get(semanaISO);
    this.seleccionado = {
      id:      this.estilistaActivo.id,
      nombre:  this.estilistaActivo.nombre,
      horarios: this.ORDEN_DIAS.map(dia => {
        const h = diaMap?.get(dia);
        return {
          dia,
          inicio:   h ? (h.inicio || null) : (dia === 'Domingo' ? null : '09:00'),
          fin:      h ? (h.fin    || null) : (dia === 'Domingo' ? null : '18:00'),
          descanso: h ? h.descanso         : (dia === 'Domingo')
        };
      })
    };
    this.mostrarModal = true;
  }

  // ── Modal: nueva semana desde el botón Asignar ────────────────────
  abrirModalNuevo() {
    this.modoNuevo    = true;
    this.listaEmpleadosSinSemana = this.todosLosUsuarios.filter(
      u => u.rol === 'estilista' || u.rol === 'admin'
    );
    this.semanaSelISO   = this.getLunes(new Date());
    this.semanaSelLabel = this.labelSemana(this.semanaSelISO);
    this.seleccionado = { id: null, nombre: '', horarios: this.crearHorarioVacio() };
    this.mostrarModal = true;
  }

  /** Nueva semana para el estilista activo (+ button en la card) */
  nuevaSemanaParaActivo() {
    if (!this.estilistaActivo) return;
    this.modoNuevo      = false;
    this.semanaSelISO   = this.getLunes(new Date());
    this.semanaSelLabel = this.labelSemana(this.semanaSelISO);
    this.seleccionado   = {
      id:      this.estilistaActivo.id,
      nombre:  this.estilistaActivo.nombre,
      horarios: this.crearHorarioVacio()
    };
    this.mostrarModal = true;
  }

  /** Seleccionar empleado en el modal modo-nuevo (reemplaza el dropdown) */
  seleccionarEmpleadoModal(emp: any) {
    // Construir weekMap para este empleado para precargar su semana actual si existe
    const empCompleto = this.listaEstilistas.find(e => e.id === emp.id) || emp;
    const tempWeekMap = new Map<string, Map<string, any>>();
    for (const semana of (empCompleto?.semanas || [])) {
      const dm = new Map<string, any>();
      for (const h of semana.horarios) dm.set(h.dia, h);
      tempWeekMap.set(semana.semana_inicio, dm);
    }
    const diaMap = tempWeekMap.get(this.semanaSelISO);
    this.seleccionado = {
      id:      emp.id,
      nombre:  emp.nombre,
      horarios: this.ORDEN_DIAS.map(dia => {
        const h = diaMap?.get(dia);
        return {
          dia,
          inicio:   h ? (h.inicio || null) : (dia === 'Domingo' ? null : '09:00'),
          fin:      h ? (h.fin    || null) : (dia === 'Domingo' ? null : '18:00'),
          descanso: h ? h.descanso         : (dia === 'Domingo')
        };
      })
    };
    this.cdr.detectChanges();
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.guardando    = false;
    this.seleccionado = { id: null, horarios: [] };
  }

  guardarCambios() {
    if (!this.seleccionado.id || this.seleccionado.id === 'null') {
      alert('Selecciona un empleado.'); return;
    }
    if (!this.semanaSelISO) { alert('Selecciona una semana.'); return; }

    this.guardando = true;
    const payload = {
      empleado_id:   Number(this.seleccionado.id),
      semana_inicio: this.semanaSelISO,
      horarios:      this.seleccionado.horarios
    };

    // POST /save hace un upsert en el backend (INSERT ... ON DUPLICATE KEY UPDATE),
    // así que sirve tanto para crear una semana nueva como para actualizar una existente.
    this.http.post(`${this.apiUrl}/save`, payload, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardando = false; this.cerrarModal(); this.cargarHorarios(); },
      error: err => {
        this.guardando = false;
        let msg = '';
        if (err.status === 0) {
          msg = 'No se pudo conectar al servidor. ¿Está corriendo el backend?';
        } else if (err.status === 403) {
          msg = 'Sin permisos de administrador.';
        } else if (err.status === 401) {
          msg = 'Sesión expirada. Vuelve a iniciar sesión.';
        } else {
          msg = err.error?.details || err.error?.message || err.error?.error || `Error ${err.status}`;
          // Si la tabla aún no existe, el error de MySQL incluye "doesn't exist".
          // Se da instrucción directa para que el admin no tenga que adivinar.
          if (msg.includes("doesn't exist") || msg.includes('no existe')) {
            msg += '\n\nEjecuta la migración SQL:\nmysql -u root -p ponte_guapagt < backend/src/migrations/esquema-semanal.sql';
          }
        }
        alert('Error al guardar horario:\n\n' + msg);
      }
    });
  }

  eliminarSemana(semanaISO: string, event?: MouseEvent) {
    event?.stopPropagation();
    if (!confirm(`¿Eliminar horario de la semana ${this.labelSemana(semanaISO)}?`)) return;
    this.http.delete(
      `${this.apiUrl}/${this.estilistaActivo.id}/${semanaISO}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => this.cargarHorarios(),
      error: () => alert('No se pudo eliminar la semana.')
    });
  }

  /** Abre el modal de edición para un estilista específico desde su tarjeta */
  abrirModalParaEstilista(est: any, event?: MouseEvent) {
    event?.stopPropagation();
    // Asegurarse de que el weekMap esté construido para este estilista
    if (this.estilistaActivo?.id !== est.id) {
      this.estilistaActivo = est;
      this.construirWeekMap();
      this.generarCalendario();
    }
    this.modoNuevo      = false;
    this.semanaSelISO   = this.getLunes(new Date());
    this.semanaSelLabel = this.labelSemana(this.semanaSelISO);
    const diaMap = this.weekMap.get(this.semanaSelISO);
    this.seleccionado = {
      id:      est.id,
      nombre:  est.nombre,
      horarios: this.ORDEN_DIAS.map(dia => {
        const h = diaMap?.get(dia);
        return {
          dia,
          inicio:   h ? (h.inicio || null) : (dia === 'Domingo' ? null : '09:00'),
          fin:      h ? (h.fin    || null) : (dia === 'Domingo' ? null : '18:00'),
          descanso: h ? h.descanso         : (dia === 'Domingo')
        };
      })
    };
    this.mostrarModal = true;
  }

  eliminarTodoEstilista(est: any, event?: MouseEvent) {
    event?.stopPropagation();
    if (!confirm(`¿Eliminar TODOS los horarios de ${est.nombre}?`)) return;
    this.http.delete(`${this.apiUrl}/${est.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          if (this.estilistaActivo?.id === est.id) {
            this.estilistaActivo = null;
            this.meses = []; this.titulosMeses = []; this.weekMap.clear();
          }
          this.cargarHorarios();
        },
        error: () => alert('No se pudo eliminar.')
      });
  }

  // ── Navegación de semana en el modal ─────────────────────────────
  semanaAnteriorModal() {
    const d = new Date(this.semanaSelISO + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    this.semanaSelISO   = this.isoFecha(d);
    this.semanaSelLabel = this.labelSemana(this.semanaSelISO);
    // Recargar datos si esa semana ya tiene horario
    const diaMap = this.weekMap.get(this.semanaSelISO);
    if (diaMap && this.seleccionado?.id) {
      this.seleccionado.horarios = this.ORDEN_DIAS.map(dia => {
        const h = diaMap.get(dia);
        return {
          dia,
          inicio:   h ? (h.inicio || null) : (dia === 'Domingo' ? null : '09:00'),
          fin:      h ? (h.fin    || null) : (dia === 'Domingo' ? null : '18:00'),
          descanso: h ? h.descanso         : (dia === 'Domingo')
        };
      });
    } else {
      this.seleccionado.horarios = this.crearHorarioVacio();
    }
  }

  semanaSiguienteModal() {
    const d = new Date(this.semanaSelISO + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    this.semanaSelISO   = this.isoFecha(d);
    this.semanaSelLabel = this.labelSemana(this.semanaSelISO);
    const diaMap = this.weekMap.get(this.semanaSelISO);
    if (diaMap && this.seleccionado?.id) {
      this.seleccionado.horarios = this.ORDEN_DIAS.map(dia => {
        const h = diaMap.get(dia);
        return {
          dia,
          inicio:   h ? (h.inicio || null) : (dia === 'Domingo' ? null : '09:00'),
          fin:      h ? (h.fin    || null) : (dia === 'Domingo' ? null : '18:00'),
          descanso: h ? h.descanso         : (dia === 'Domingo')
        };
      });
    } else {
      this.seleccionado.horarios = this.crearHorarioVacio();
    }
  }

  private crearHorarioVacio() {
    return this.ORDEN_DIAS.map(d => ({
      dia:      d,
      inicio:   d === 'Domingo' ? null : '09:00',
      fin:      d === 'Domingo' ? null : '18:00',
      descanso: d === 'Domingo'
    }));
  }

  toggleDescanso(dia: any) {
    if (dia.descanso) { dia.inicio = null; dia.fin = null; }
    else              { dia.inicio = '09:00'; dia.fin = '18:00'; }
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()           { this.logout.emit(); }
}
