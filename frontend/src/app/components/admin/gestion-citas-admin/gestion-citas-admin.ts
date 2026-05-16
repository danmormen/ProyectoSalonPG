import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

interface DiaSemana {
  fecha:  string;
  label:  string;
  num:    string;
  esHoy:  boolean;
}

@Component({
  selector: 'app-gestion-citas-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './gestion-citas-admin.html',
  styleUrls: ['./gestion-citas-admin.css']
})
export class GestionCitasAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  citas:   any[] = [];
  cargando = true;
  error    = '';

  filtroBusqueda = '';
  filtroFecha    = '';

  tabActivo: 'atender' | 'completadas' | 'canceladas' = 'atender';

  // Hoy en ISO
  readonly HOY: string = (() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  })();

  // Semana base para el navegador (lunes de la semana actual)
  semanaBase: Date = (() => {
    const h   = new Date();
    const dow = h.getDay();
    const d   = new Date(h);
    d.setDate(h.getDate() + (dow === 0 ? -6 : 1 - dow));
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.filtroFecha = this.HOY;
    this.cargarCitas();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: 'Bearer ' + localStorage.getItem('token') });
  }

  // ── Navegador de semana ──────────────────────────────────────
  get diasSemana(): DiaSemana[] {
    const CORTOS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(this.semanaBase);
      d.setDate(d.getDate() + i);
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return { fecha: iso, label: CORTOS[d.getDay()], num: String(d.getDate()), esHoy: iso === this.HOY };
    });
  }

  semanaAnterior() {
    const n = new Date(this.semanaBase);
    n.setDate(n.getDate() - 7);
    this.semanaBase = n;
  }

  semanaSiguiente() {
    const n = new Date(this.semanaBase);
    n.setDate(n.getDate() + 7);
    this.semanaBase = n;
  }

  seleccionarDia(fecha: string) {
    this.filtroFecha = this.filtroFecha === fecha ? '' : fecha;
    this.cargarCitas();
  }

  irHoy() {
    const h   = new Date();
    const dow = h.getDay();
    const lun = new Date(h);
    lun.setDate(h.getDate() + (dow === 0 ? -6 : 1 - dow));
    lun.setHours(0, 0, 0, 0);
    this.semanaBase  = lun;
    this.filtroFecha = this.HOY;
    this.cargarCitas();
  }

  get tituloFecha(): string {
    if (!this.filtroFecha) return 'Todas las citas';
    if (this.filtroFecha === this.HOY) return 'Hoy';
    const [y, m, d] = this.filtroFecha.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const man = new Date(); man.setDate(man.getDate() + 1);
    if (dt.toDateString() === man.toDateString()) return 'Mañana';
    return dt.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  // ── Carga de datos ───────────────────────────────────────────
  cargarCitas() {
    this.cargando = true;
    this.error    = '';
    let url = this.apiUrl + '/citas?';
    if (this.filtroFecha) url += 'fecha=' + this.filtroFecha + '&';

    this.http.get<any[]>(url, { headers: this.getHeaders() }).subscribe({
      next: data  => { this.citas = data; this.cargando = false; this.cdr.detectChanges(); },
      error: ()   => { this.error = 'No se pudieron cargar las citas.'; this.cargando = false; this.cdr.detectChanges(); }
    });
  }

  // ── Filtrado de texto (client-side) ─────────────────────────
  get citasFiltradas(): any[] {
    if (!this.filtroBusqueda.trim()) return this.citas;
    const q = this.filtroBusqueda.toLowerCase();
    return this.citas.filter(c =>
      c.cliente_nombre?.toLowerCase().includes(q) ||
      c.servicios?.toLowerCase().includes(q) ||
      c.estilista_nombre?.toLowerCase().includes(q)
    );
  }

  // ── Conteos para badges de tabs ──────────────────────────────
  get resumen() {
    const all = this.citasFiltradas;
    return {
      atender:    all.filter(c => c.estado === 'pendiente' || c.estado === 'confirmada').length,
      completadas: all.filter(c => c.estado === 'completada').length,
      canceladas:  all.filter(c => c.estado === 'cancelada').length,
    };
  }

  // ── Citas por tab ────────────────────────────────────────────
  get citasPorAtender(): any[] {
    const hoy = this.HOY;
    return this.citasFiltradas
      .filter(c =>
        (c.estado === 'pendiente' || c.estado === 'confirmada') &&
        (c.fecha || '').substring(0, 10) >= hoy
      )
      .sort((a, b) => {
        const fa = (a.fecha || '').substring(0, 10) + (a.hora || '');
        const fb = (b.fecha || '').substring(0, 10) + (b.hora || '');
        return fa.localeCompare(fb);
      });
  }

  get citasCompletadas(): any[] {
    return this.citasFiltradas
      .filter(c => c.estado === 'completada')
      .sort((a, b) => {
        const fa = (a.fecha || '').substring(0, 10) + (a.hora || '');
        const fb = (b.fecha || '').substring(0, 10) + (b.hora || '');
        return fb.localeCompare(fa);
      });
  }

  get citasCanceladas(): any[] {
    return this.citasFiltradas
      .filter(c => c.estado === 'cancelada')
      .sort((a, b) => {
        const fa = (a.fecha || '').substring(0, 10) + (a.hora || '');
        const fb = (b.fecha || '').substring(0, 10) + (b.hora || '');
        return fb.localeCompare(fa);
      });
  }

  get citasActuales(): any[] {
    if (this.tabActivo === 'completadas') return this.citasCompletadas;
    if (this.tabActivo === 'canceladas')  return this.citasCanceladas;
    return [];
  }

  // ── Agrupar "Por atender" por fecha (solo si no hay filtro de día) ──
  get citasAgrupadasPorFecha(): { fecha: string; label: string; citas: any[] }[] {
    const map = new Map<string, any[]>();
    for (const c of this.citasPorAtender) {
      const key = (c.fecha || '').substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const result: { fecha: string; label: string; citas: any[] }[] = [];
    map.forEach((citas, fecha) => result.push({ fecha, label: this.formatearFechaGrupo(fecha), citas }));
    return result.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  // ── Helpers de fecha ─────────────────────────────────────────
  formatearFechaGrupo(fechaStr: string): string {
    if (!fechaStr) return '';
    const [y, m, d] = fechaStr.split('-').map(Number);
    const date  = new Date(y, m - 1, d);
    const hoy   = new Date(); hoy.setHours(0,0,0,0);
    const mañana = new Date(hoy); mañana.setDate(hoy.getDate() + 1);
    if (date.toDateString() === hoy.toDateString())    return 'Hoy';
    if (date.toDateString() === mañana.toDateString()) return 'Mañana';
    return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  formatearHora(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  }

  getFechaParts(fechaStr: string): { dia: string; num: string; mes: string } {
    if (!fechaStr) return { dia: '', num: '', mes: '' };
    const solo = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    const [y, m, d] = solo.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return {
      dia: date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase()),
      num: String(d).padStart(2, '0'),
      mes: date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').replace(/^\w/, c => c.toUpperCase())
    };
  }

  // ── Acciones ─────────────────────────────────────────────────
  cambiarEstado(cita: any, nuevoEstado: string) {
    this.http.patch(
      `${this.apiUrl}/citas/${cita.id}/estado`,
      { estado: nuevoEstado },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { cita.estado = nuevoEstado; this.cdr.detectChanges(); },
      error: err => alert('Error al cambiar estado: ' + (err.error?.error || 'Intenta de nuevo'))
    });
  }

  confirmarCita(cita: any) { this.cambiarEstado(cita, 'confirmada'); }

  cancelarCita(cita: any) {
    if (!confirm(`¿Cancelar la cita de ${cita.cliente_nombre}?`)) return;
    this.cambiarEstado(cita, 'cancelada');
  }

  irATab(tab: 'atender' | 'completadas' | 'canceladas') { this.tabActivo = tab; }

  limpiarBusqueda() { this.filtroBusqueda = ''; }
  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()           { this.logout.emit(); }
}
