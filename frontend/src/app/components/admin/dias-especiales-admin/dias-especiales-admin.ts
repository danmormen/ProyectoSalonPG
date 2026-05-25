import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

interface DiaCal {
  fecha:     string;   // YYYY-MM-DD
  dia:       number;
  esDelMes:  boolean;
  esHoy:     boolean;
  esPasado:  boolean;
  tipo:      'cerrado' | 'horario_especial' | null;
  bloqueado: any | null;   // objeto completo si está bloqueado
}

@Component({
  selector: 'app-dias-especiales-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './dias-especiales-admin.html',
  styleUrls: ['./dias-especiales-admin.css']
})
export class DiasEspecialesAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  dias:     any[]  = [];
  cargando  = true;
  error     = '';

  // ── Calendario ────────────────────────────────────────────────────
  mesBase:      Date        = new Date();
  meses:        DiaCal[][][] = [];
  titulosMeses: string[]    = [];
  readonly CABECERA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  readonly HOY_STR: string;
  private fechaMap = new Map<string, any>();

  // ── Modal ─────────────────────────────────────────────────────────
  mostrarModal = false;
  editando:   any  = null;
  guardando        = false;
  errorModal       = '';
  form = this.nuevoForm();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    const hoy    = new Date();
    this.HOY_STR = this.isoFecha(hoy);
    this.mesBase = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  ngOnInit() { this.cargar(); }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  private isoFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── Carga ─────────────────────────────────────────────────────────
  cargar() {
    this.cargando = true;
    this.error    = '';

    this.http.get<any[]>(`${this.apiUrl}/dias-bloqueados`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.dias     = data ?? [];
          this.cargando = false;
          this.construirFechaMap();
          this.generarCalendario();
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err.status === 0)        this.error = 'No se pudo conectar al servidor.';
          else if (err.status === 500) this.error = 'Error en el servidor (500). Reinicia el backend para crear las tablas.';
          else                         this.error = `Error ${err.status}: ${err.error?.error || 'Error al cargar.'}`;
          this.cargando = false;
          this.cdr.detectChanges();
        }
      });
  }

  private construirFechaMap() {
    this.fechaMap.clear();
    for (const d of this.dias) this.fechaMap.set(d.fecha, d);
  }

  // ── Calendario 2 meses ────────────────────────────────────────────
  generarCalendario() {
    this.meses        = [];
    this.titulosMeses = [];
    const hoy         = new Date();
    const hoyISO      = this.HOY_STR;

    for (let m = 0; m < 2; m++) {
      const primer = new Date(this.mesBase.getFullYear(), this.mesBase.getMonth() + m, 1);
      this.titulosMeses.push(
        primer.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
               .replace(/^\w/, c => c.toUpperCase())
      );

      const diaSem = primer.getDay();
      const offset = diaSem === 0 ? 6 : diaSem - 1;
      const inicio = new Date(primer);
      inicio.setDate(inicio.getDate() - offset);

      const semanas: DiaCal[][] = [];
      for (let s = 0; s < 6; s++) {
        const semana: DiaCal[] = [];
        for (let d = 0; d < 7; d++) {
          const fecha    = new Date(inicio);
          fecha.setDate(inicio.getDate() + s * 7 + d);
          const iso      = this.isoFecha(fecha);
          const esDelMes = fecha.getMonth() === primer.getMonth();
          const bloqueado = esDelMes ? (this.fechaMap.get(iso) ?? null) : null;
          semana.push({
            fecha:     iso,
            dia:       fecha.getDate(),
            esDelMes,
            esHoy:     iso === hoyISO,
            esPasado:  esDelMes && fecha < hoy && iso !== hoyISO,
            tipo:      bloqueado ? bloqueado.tipo : null,
            bloqueado
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
  volverHoy() {
    const h = new Date();
    this.mesBase = new Date(h.getFullYear(), h.getMonth(), 1);
    this.generarCalendario();
  }
  get esMesActual(): boolean {
    const h = new Date();
    return this.mesBase.getFullYear() === h.getFullYear() &&
           this.mesBase.getMonth()    === h.getMonth();
  }

  // ── Click en día del calendario ───────────────────────────────────
  clickDia(dia: DiaCal) {
    if (!dia.esDelMes) return;
    if (dia.bloqueado) {
      this.abrirEditar(dia.bloqueado);
    } else {
      this.abrirNuevo(dia.fecha);
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────
  nuevoForm(fecha = '') {
    return { fecha, tipo: 'cerrado', hora_inicio: '', hora_fin: '', motivo: '' };
  }

  abrirNuevo(fecha = '') {
    this.editando     = null;
    this.form         = this.nuevoForm(fecha);
    this.errorModal   = '';
    this.mostrarModal = true;
    this.cdr.detectChanges();
  }

  abrirEditar(dia: any) {
    this.editando = dia;
    this.form = {
      fecha:       dia.fecha?.substring(0, 10) ?? '',
      tipo:        dia.tipo,
      hora_inicio: dia.hora_inicio ? String(dia.hora_inicio).substring(0, 5) : '',
      hora_fin:    dia.hora_fin    ? String(dia.hora_fin).substring(0, 5)    : '',
      motivo:      dia.motivo ?? ''
    };
    this.errorModal   = '';
    this.mostrarModal = true;
    this.cdr.detectChanges();
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.editando     = null;
    this.errorModal   = '';
  }

  // ── Guardar ───────────────────────────────────────────────────────
  guardar() {
    if (!this.form.fecha || !this.form.tipo) {
      this.errorModal = 'Fecha y tipo son obligatorios.'; return;
    }
    if (this.form.tipo === 'horario_especial' && (!this.form.hora_inicio || !this.form.hora_fin)) {
      this.errorModal = 'Para horario especial debes indicar hora de inicio y fin.'; return;
    }

    this.guardando  = true;
    this.errorModal = '';

    const payload: any = {
      fecha:       this.form.fecha,
      tipo:        this.form.tipo,
      motivo:      this.form.motivo || null,
      hora_inicio: this.form.tipo === 'horario_especial' ? this.form.hora_inicio : null,
      hora_fin:    this.form.tipo === 'horario_especial' ? this.form.hora_fin    : null
    };

    const req$ = this.editando
      ? this.http.put(`${this.apiUrl}/dias-bloqueados/${this.editando.id}`, payload, { headers: this.getHeaders() })
      : this.http.post(`${this.apiUrl}/dias-bloqueados`, payload, { headers: this.getHeaders() });

    req$.subscribe({
      next: () => { this.guardando = false; this.cerrarModal(); this.cargar(); },
      error: (err) => {
        this.guardando  = false;
        this.errorModal = err.error?.error || 'Error al guardar. Intenta de nuevo.';
      }
    });
  }

  // ── Eliminar ──────────────────────────────────────────────────────
  eliminar(dia: any, event?: MouseEvent) {
    event?.stopPropagation();
    if (!confirm(`¿Quitar el bloqueo del ${this.formatFecha(dia.fecha)}?`)) return;
    this.http.delete(`${this.apiUrl}/dias-bloqueados/${dia.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => this.cargar(),
        error: () => alert('Error al eliminar. Intenta de nuevo.')
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────
  formatFecha(f: string): string {
    if (!f) return '';
    const [y, m, d] = f.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  labelTipo(tipo: string | null): string {
    return tipo === 'cerrado' ? 'Cerrado todo el día' : 'Horario especial';
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout()               { this.logout.emit(); }
}
