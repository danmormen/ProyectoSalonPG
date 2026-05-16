import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

interface DiaCalendario {
  fecha:         string;
  dia:           number;
  esDelMes:      boolean;
  esPasado:      boolean;
  esHoy:         boolean;
  esCerrado:     boolean;
  seleccionable: boolean;
  motivo:        string;
}

@Component({
  selector: 'app-agendar-walkin',
  standalone: true,
  imports: [CommonModule, FormsModule, EstilistaNavbarComponent],
  templateUrl: './agendar-walkin.html',
  styleUrls: ['./agendar-walkin.css']
})
export class AgendarWalkinComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  // Flujo: 1=servicios, 2=fecha, 3=slot+cliente
  paso: 1 | 2 | 3 = 1;

  // Estilista logueado
  estilistaId      = 0;
  rolUsuario       = '';

  // ── Selector de estilista ─────────────────────────────────────────
  estilistas:       any[]   = [];
  estilistaSelId:   number  = 0;   // el que se usará para slots y confirmación
  cargandoEstilistas = true;

  // ── Paso 1: Servicios ─────────────────────────────────────────────
  servicios:          any[] = [];
  serviciosSelIds:    number[] = [];
  cargandoServicios = true;

  // ── Paso 2: Calendario ───────────────────────────────────────────
  mesActual:       Date = new Date();
  diasMes:         DiaCalendario[] = [];
  diasBloqueados:  any[] = [];
  fechaSel:        string = '';
  HOY:             string;
  readonly DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  // ── Paso 3: Slots + datos cliente ────────────────────────────────
  slots:                 string[] = [];
  cargandoSlots        = false;
  slotSel:               string = '';
  clienteNombre:         string = '';
  clienteApellido:       string = '';
  clienteTelefonoDisplay: string = '';   // valor visible con guión: xxxx-xxxx
  notasExtra:            string = '';

  // Estado general
  enviando    = false;
  errorMsg    = '';
  exito       = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    const h = new Date();
    this.HOY = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  }

  ngOnInit() {
    const u = localStorage.getItem('usuario');
    if (u) {
      try {
        const parsed     = JSON.parse(u);
        this.estilistaId = parsed.id  || 0;
        this.rolUsuario  = parsed.rol || '';
      } catch {}
    }
    this.cargarServicios();
    this.cargarBloqueados();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: 'Bearer ' + localStorage.getItem('token') });
  }

  // ── Estilistas filtrados por especialidad + día ───────────────────
  // Se llama al entrar al paso 3 porque recién en ese momento se tienen
  // tanto los servicios como la fecha confirmados. El endpoint devuelve
  // solo los estilistas que tienen la especialidad necesaria y trabajan ese día.
  cargarEstilistasFiltrados() {
    if (!this.fechaSel || this.serviciosSelIds.length === 0) return;
    this.cargandoEstilistas = true;
    this.estilistas         = [];
    this.estilistaSelId     = 0;
    this.slots              = [];
    this.slotSel            = '';
    this.errorMsg           = '';

    const serviciosParam = this.serviciosSelIds.join(',');
    const url = `${this.apiUrl}/citas/estilistas-walk-in?fecha=${this.fechaSel}&servicios=${serviciosParam}`;
    this.http.get<any[]>(url, { headers: this.getHeaders() }).subscribe({
      next: data => {
        this.estilistas = data || [];
        this.cargandoEstilistas = false;
        this.cdr.detectChanges();
      },
      error: err => {
        this.cargandoEstilistas = false;
        const msg = err.error?.debug || err.error?.error || err.message || 'Error al cargar estilistas';
        this.errorMsg = `Error cargando estilistas: ${msg}`;
        this.cdr.detectChanges();
      }
    });
  }

  seleccionarEstilista(id: number) {
    this.estilistaSelId = id;
    this.slotSel        = '';
    this.errorMsg       = '';
    this.cargarSlots();
  }

  // ── Teléfono xxxx-xxxx ────────────────────────────────────────────
  // Se formatean 8 dígitos con guión visual (ej. 5555-1234) para que el
  // estilista pueda leerlos fácilmente. Al confirmar se quita el guión
  // y se antepone '502' (código de país Guatemala) antes de guardar.
  // El DOM se actualiza directamente con el valor formateado para evitar
  // que Angular lo reescriba sin el guión en el siguiente ciclo de detección.
  onTelInput(event: Event) {
    const el     = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    const fmt    = digits.length > 4 ? digits.slice(0, 4) + '-' + digits.slice(4) : digits;
    this.clienteTelefonoDisplay = fmt;
    el.value = fmt;
  }

  // ── Servicios ─────────────────────────────────────────────────────
  cargarServicios() {
    this.cargandoServicios = true;
    this.http.get<any[]>(`${this.apiUrl}/servicios`, { headers: this.getHeaders() }).subscribe({
      next: data => {
        this.servicios = (data || []).filter(s => s.activo !== 0);
        this.cargandoServicios = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoServicios = false; this.cdr.detectChanges(); }
    });
  }

  toggleServicio(id: number) {
    const i = this.serviciosSelIds.indexOf(id);
    if (i === -1) this.serviciosSelIds.push(id);
    else          this.serviciosSelIds.splice(i, 1);
    this.errorMsg = '';
  }

  isSeleccionado(id: number) { return this.serviciosSelIds.includes(id); }

  get serviciosSeleccionados(): any[] {
    return this.servicios.filter(s => this.serviciosSelIds.includes(s.id));
  }
  get duracionTotal(): number {
    return this.serviciosSeleccionados.reduce((t, s) => t + (s.duracion || 0), 0);
  }
  get precioTotal(): number {
    return this.serviciosSeleccionados.reduce((t, s) => t + parseFloat(s.precio || 0), 0);
  }
  get duracionFormateada(): string {
    const m = this.duracionTotal;
    if (!m) return '';
    if (m < 60)  return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h ${r}min` : `${h}h`;
  }

  // ── Calendario ───────────────────────────────────────────────────
  cargarBloqueados() {
    const mes = `${this.mesActual.getFullYear()}-${String(this.mesActual.getMonth()+1).padStart(2,'0')}`;
    this.http.get<any[]>(`${this.apiUrl}/dias-bloqueados?mes=${mes}`).subscribe({
      next: data => { this.diasBloqueados = data || []; this.construirCalendario(); this.cdr.detectChanges(); },
      error: () => { this.construirCalendario(); this.cdr.detectChanges(); }
    });
  }

  construirCalendario() {
    const y = this.mesActual.getFullYear();
    const m = this.mesActual.getMonth();
    const primerDia = new Date(y, m, 1);
    const ultimoDia = new Date(y, m + 1, 0);

    // Offset: lunes=0 … domingo=6
    let startOffset = primerDia.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const dias: DiaCalendario[] = [];
    for (let i = 0; i < startOffset; i++) {
      dias.push({ fecha:'', dia:0, esDelMes:false, esPasado:false, esHoy:false, esCerrado:false, seleccionable:false, motivo:'' });
    }
    for (let d = 1; d <= ultimoDia.getDate(); d++) {
      const fecha = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const esPasado = fecha < this.HOY;
      const esHoy    = fecha === this.HOY;
      const blq      = this.diasBloqueados.find(b => b.fecha === fecha);
      const esCerrado = blq?.tipo === 'cerrado';
      dias.push({
        fecha, dia: d,
        esDelMes: true,
        esPasado,
        esHoy,
        esCerrado,
        seleccionable: !esPasado && !esCerrado,
        motivo: blq?.motivo || ''
      });
    }
    this.diasMes = dias;
  }

  get tituloMes(): string {
    return this.mesActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  mesSiguiente() {
    this.mesActual = new Date(this.mesActual.getFullYear(), this.mesActual.getMonth() + 1, 1);
    this.fechaSel = '';
    this.cargarBloqueados();
  }
  mesAnterior() {
    const nuevo = new Date(this.mesActual.getFullYear(), this.mesActual.getMonth() - 1, 1);
    const hoyD  = new Date(this.HOY + 'T00:00:00');
    // No retroceder más allá del mes actual
    if (nuevo.getFullYear() < hoyD.getFullYear() ||
       (nuevo.getFullYear() === hoyD.getFullYear() && nuevo.getMonth() < hoyD.getMonth())) return;
    this.mesActual = nuevo;
    this.fechaSel  = '';
    this.cargarBloqueados();
  }

  seleccionarFecha(dia: DiaCalendario) {
    if (!dia.seleccionable) return;
    this.fechaSel = dia.fecha;
    this.errorMsg = '';
  }

  get fechaFormateada(): string {
    if (!this.fechaSel) return '';
    const [y, m, d] = this.fechaSel.split('-').map(Number);
    return new Date(y, m-1, d).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  // ── Slots ────────────────────────────────────────────────────────
  cargarSlots() {
    if (!this.fechaSel || !this.estilistaSelId || this.duracionTotal === 0) return;
    this.cargandoSlots = true;
    this.slots         = [];
    this.slotSel       = '';
    const url = `${this.apiUrl}/citas/slots-disponibles?fecha=${this.fechaSel}&estilista_id=${this.estilistaSelId}&duracion_total=${this.duracionTotal}`;
    this.http.get<string[]>(url, { headers: this.getHeaders() }).subscribe({
      next: data => { this.slots = data || []; this.cargandoSlots = false; this.cdr.detectChanges(); },
      error: ()  => { this.cargandoSlots = false; this.cdr.detectChanges(); }
    });
  }

  formatHora(h: string): string {
    if (!h) return '';
    const [hh, mm] = h.split(':').map(Number);
    return `${hh % 12 || 12}:${String(mm).padStart(2,'0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  }

  // ── Navegación entre pasos ────────────────────────────────────────
  irPaso2() {
    if (this.serviciosSelIds.length === 0) { this.errorMsg = 'Selecciona al menos un servicio.'; return; }
    this.errorMsg = '';
    this.paso = 2;
    this.cdr.detectChanges();
  }

  irPaso3() {
    if (!this.fechaSel) { this.errorMsg = 'Selecciona una fecha.'; return; }
    this.errorMsg = '';
    this.paso = 3;
    this.cargarEstilistasFiltrados();   // carga estilistas válidos → al elegir uno carga slots
    this.cdr.detectChanges();
  }

  volverPaso(n: 1 | 2) {
    this.paso     = n;
    this.errorMsg = '';
    this.cdr.detectChanges();
  }

  // ── Confirmar cita ────────────────────────────────────────────────
  confirmar() {
    this.errorMsg = '';
    if (!this.estilistaSelId)         { this.errorMsg = 'Selecciona un estilista.'; return; }
    if (!this.slotSel)                { this.errorMsg = 'Selecciona un horario disponible.'; return; }
    if (!this.clienteNombre.trim())   { this.errorMsg = 'El nombre del cliente es requerido.'; return; }
    if (!this.clienteApellido.trim()) { this.errorMsg = 'El apellido del cliente es requerido.'; return; }

    const digitos = this.clienteTelefonoDisplay.replace('-', '');
    if (digitos && digitos.length !== 8) {
      this.errorMsg = 'El teléfono debe tener exactamente 8 dígitos.';
      return;
    }

    this.enviando = true;
    const nombreCompleto = `${this.clienteNombre.trim()} ${this.clienteApellido.trim()}`;
    const body = {
      nombre:       nombreCompleto,
      // Se antepone el código de país 502 (Guatemala) al número local.
      // Si no se ingresó teléfono se envía null para que el backend lo acepte como opcional.
      telefono:     digitos ? `502${digitos}` : null,
      fecha:        this.fechaSel,
      hora:         this.slotSel,
      servicios:    this.serviciosSelIds,
      notas:        this.notasExtra.trim() || null,
      estilista_id: this.estilistaSelId
    };

    this.http.post<any>(`${this.apiUrl}/citas/walk-in`, body, { headers: this.getHeaders() }).subscribe({
      next: () => {
        this.enviando = false;
        this.exito    = true;
        this.cdr.detectChanges();
      },
      error: err => {
        this.enviando = false;
        // Si el servidor devuelve un mensaje de migración pendiente, mostrarlo completo
        if (err.error?.debug?.includes('migracion_walk_in')) {
          this.errorMsg = '⚠️ Migración pendiente: ' + err.error.debug;
        } else {
          const base  = err.error?.error   || 'Error al registrar la cita.';
          const debug = err.error?.sql_error ? ` → ${err.error.sql_error}` : (err.error?.debug ? ` → ${err.error.debug}` : '');
          this.errorMsg = base + debug;
        }
        this.cdr.detectChanges();
      }
    });
  }

  nuevaCita() {
    this.paso                   = 1;
    this.serviciosSelIds        = [];
    this.fechaSel               = '';
    this.estilistas             = [];
    this.estilistaSelId         = 0;
    this.slots                  = [];
    this.slotSel                = '';
    this.clienteNombre          = '';
    this.clienteApellido        = '';
    this.clienteTelefonoDisplay = '';
    this.notasExtra             = '';
    this.errorMsg               = '';
    this.exito                  = false;
    this.cdr.detectChanges();
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout()               { this.logout.emit(); }
}
