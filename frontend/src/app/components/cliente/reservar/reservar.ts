import { Component, EventEmitter, Output, Input, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ClientNavbarComponent } from '../client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

// ── Tipado interno del calendario ──────────────────────────────────
interface DiaCalendario {
  fecha:         string;   // 'YYYY-MM-DD'
  dia:           number;   // 1-31 (0 = padding)
  esDelMes:      boolean;
  esPasado:      boolean;
  esHoy:         boolean;
  esCerrado:     boolean;  // bloqueado totalmente
  esEspecial:    boolean;  // horario reducido
  seleccionable: boolean;
  motivo:        string;
}

@Component({
  selector: 'app-reservar',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientNavbarComponent],
  templateUrl: './reservar.html',
  styleUrl: './reservar.css'
})
export class ReservarComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  // ── Inputs: modos de inicio ────────────────────────────────────────
  // servicioFijo: viene de servicios.ts → nombre del servicio preseleccionado
  // promoActiva:  viene de promociones.ts → objeto completo con servicio_id, precio_especial, etc.
  // datosEdicion: viene de ver-cita.ts → cita existente que se quiere modificar
  @Input() servicioFijo: string  = '';
  @Input() esPromo:      boolean = false;
  @Input() datosEdicion: any     = null;
  @Input() promoActiva:  any     = null;

  private apiUrl = `${environment.apiUrl}/api`;

  // ── Estado del flujo (3 pasos + confirmación) ──────────────────────
  //  1 → elegir servicio
  //  2 → elegir fecha en el calendario
  //  3 → elegir estilista + slot
  //  4 → confirmación (notas + confirmar)
  paso: 1 | 2 | 3 | 4 = 1;

  // ── Paso 1: servicios ──────────────────────────────────────────────
  servicios:          any[]  = [];
  servicioSel:        any    = null;   // objeto del servicio elegido
  cargandoServicios         = true;

  // ── Paso 2: calendario ────────────────────────────────────────────
  mesActual:          Date   = new Date();   // primer día del mes visible
  diasMes:            DiaCalendario[] = [];
  diasBloqueados:     any[]  = [];
  cargandoCalendario        = false;
  fechaSel:           string = '';   // 'YYYY-MM-DD'
  HOY:                string;        // 'YYYY-MM-DD' estático

  // ── Paso 3: estilistas + slots ────────────────────────────────────
  estilistas:         any[]  = [];
  estilistas_filtrados: any[] = [];
  cargandoEstilistas        = false;
  errorEstilistas           = '';
  estilista_selId:    number = 0;
  slotSel:            string = '';   // 'HH:MM'

  // ── Paso 4 / confirmación ─────────────────────────────────────────
  notasReserva:       string = '';
  enviando                  = false;
  errorConfirm:       string = '';

  // Error global
  errorGlobal:        string = '';

  readonly DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    const hoy     = new Date();
    this.HOY      = this.formatISO(hoy);
    this.mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  }

  ngOnInit() {
    this.cargarServicios();
  }

  // ─────────────────────────────────────────────────────────────────
  // UTILS
  // ─────────────────────────────────────────────────────────────────
  private formatISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  private mesISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token });
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 1 — Cargar y seleccionar servicio
  // ─────────────────────────────────────────────────────────────────
  cargarServicios() {
    this.cargandoServicios = true;
    this.http.get<any[]>(`${this.apiUrl}/servicios`).subscribe({
      next: (data) => {
        this.servicios        = data.filter(s => s.activo === 1 || s.activo === true);
        this.cargandoServicios = false;

        // ── Modos de inicio ──────────────────────────────────────────
        if (this.datosEdicion) {
          // Modo edición: preseleccionar servicio y saltar al calendario
          const srv = this.servicios.find(s => s.id === this.datosEdicion.servicio_id ||
                                               String(s.id) === String(this.datosEdicion.servicio_id));
          if (srv) { this.servicioSel = srv; }
          this.paso = 2;
          this.cargarCalendario();
        } else if (this.promoActiva) {
          // Modo promo: preseleccionar servicio por servicio_id
          const srv = this.servicios.find(s => String(s.id) === String(this.promoActiva.servicio_id));
          if (srv) { this.servicioSel = srv; }
          this.paso = 2;
          this.cargarCalendario();
        } else if (this.servicioFijo) {
          // Modo desde servicios.ts: preseleccionar por nombre
          const srv = this.servicios.find(s =>
            s.nombre.toLowerCase() === this.servicioFijo.toLowerCase());
          if (srv) { this.servicioSel = srv; }
          this.paso = 2;
          this.cargarCalendario();
        }
        // else: flujo normal, el cliente elige en el paso 1
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorGlobal       = 'No se pudieron cargar los servicios. Verifica que el servidor esté activo.';
        this.cargandoServicios  = false;
        this.cdr.detectChanges();
      }
    });
  }

  elegirServicio(srv: any) {
    this.servicioSel = srv;
    this.paso        = 2;
    this.cargarCalendario();
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 2 — Calendario
  // ─────────────────────────────────────────────────────────────────

  // Nombre legible del mes actual
  get tituloMes(): string {
    return this.mesActual.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  mesAnterior() {
    const m = new Date(this.mesActual);
    m.setMonth(m.getMonth() - 1);
    // No retroceder más allá del mes en curso
    const hoy = new Date();
    if (m.getFullYear() < hoy.getFullYear() ||
        (m.getFullYear() === hoy.getFullYear() && m.getMonth() < hoy.getMonth())) return;
    this.mesActual = m;
    this.cargarCalendario();
  }

  mesSiguiente() {
    const m = new Date(this.mesActual);
    m.setMonth(m.getMonth() + 1);
    // Límite: mes actual + 2 (ventana de ~60 días)
    const hoy     = new Date();
    const limite  = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 1);
    if (m >= limite) return;
    this.mesActual = m;
    this.cargarCalendario();
  }

  cargarCalendario() {
    this.cargandoCalendario = true;
    this.diasMes            = [];
    const mesStr            = this.mesISO(this.mesActual);

    this.http.get<any[]>(`${this.apiUrl}/dias-bloqueados?mes=${mesStr}`).subscribe({
      next: (bloqueados) => {
        this.diasBloqueados     = bloqueados;
        this.cargandoCalendario = false;
        this.generarDiasMes();
        this.cdr.detectChanges();
      },
      error: () => {
        // Si falla el endpoint de días bloqueados, igual mostramos el calendario
        this.diasBloqueados     = [];
        this.cargandoCalendario = false;
        this.generarDiasMes();
        this.cdr.detectChanges();
      }
    });
  }

  // Genera el array de 42 celdas (6 semanas × 7 días) para el mes visible.
  // La semana empieza en lunes (índice 1 de getDay, domingo = 0 → 7).
  private generarDiasMes() {
    const hoy        = new Date();
    const hoyStr     = this.formatISO(hoy);
    const limMax     = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 0); // último día del mes siguiente
    const limMaxStr  = this.formatISO(limMax);

    // Primer día del mes → lunes de esa semana
    const primerDia  = new Date(this.mesActual.getFullYear(), this.mesActual.getMonth(), 1);
    const diaSemana  = primerDia.getDay(); // 0=dom,1=lun,...
    const offset     = diaSemana === 0 ? 6 : diaSemana - 1; // días a restar para llegar al lunes
    const inicio     = new Date(primerDia);
    inicio.setDate(inicio.getDate() - offset);

    const dias: DiaCalendario[] = [];
    for (let i = 0; i < 42; i++) {
      const d     = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      const fISO  = this.formatISO(d);
      const esDelMes = d.getMonth() === this.mesActual.getMonth();

      // Buscar bloqueo de este día
      const bloqueo = this.diasBloqueados.find(b => b.fecha?.substring(0,10) === fISO);

      const esPasado     = fISO < hoyStr;
      const esHoy        = fISO === hoyStr;
      const fueraDerango = fISO > limMaxStr;
      const esCerrado    = bloqueo?.tipo === 'cerrado';
      const esEspecial   = bloqueo?.tipo === 'horario_especial';

      dias.push({
        fecha:         fISO,
        dia:           d.getDate(),
        esDelMes,
        esPasado,
        esHoy,
        esCerrado,
        esEspecial,
        motivo:        bloqueo?.motivo || '',
        seleccionable: esDelMes && !esPasado && !esCerrado && !fueraDerango
      });
    }
    this.diasMes = dias;
  }

  elegirFecha(dia: DiaCalendario) {
    if (!dia.seleccionable) return;
    this.fechaSel      = dia.fecha;
    this.estilistas    = [];
    this.estilista_selId = 0;
    this.slotSel       = '';
    this.paso          = 3;
    this.cargarEstilistas();
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 3 — Estilistas + Slots
  // ─────────────────────────────────────────────────────────────────
  cargarEstilistas() {
    if (!this.fechaSel || !this.servicioSel) return;
    this.cargandoEstilistas = true;
    this.errorEstilistas    = '';
    this.estilistas         = [];

    const url = `${this.apiUrl}/citas/disponibilidad-completa?fecha=${this.fechaSel}&servicio_id=${this.servicioSel.id}`;
    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        this.estilistas         = data;
        this.cargandoEstilistas  = false;
        if (data.length === 0) {
          this.errorEstilistas = 'No hay estilistas disponibles para esta fecha y servicio. Elige otro día.';
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargandoEstilistas = false;
        this.errorEstilistas    = 'No se pudo cargar la disponibilidad. Intenta de nuevo.';
        this.cdr.detectChanges();
      }
    });
  }

  elegirSlot(estilista: any, slot: string) {
    this.estilista_selId = estilista.id;
    this.slotSel         = slot;
    this.paso            = 4;
    this.cdr.detectChanges();
  }

  esSlotActivo(estilista: any, slot: string): boolean {
    return this.estilista_selId === estilista.id && this.slotSel === slot;
  }

  // ─────────────────────────────────────────────────────────────────
  // PASO 4 — Notas + Confirmar
  // ─────────────────────────────────────────────────────────────────
  get estilistaSeleccionado(): any {
    return this.estilistas.find(e => e.id === this.estilista_selId) || null;
  }

  get resumenFecha(): string {
    if (!this.fechaSel) return '';
    const [y,m,d] = this.fechaSel.split('-');
    const fecha   = new Date(+y, +m-1, +d);
    return fecha.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
      .replace(/^\w/, c => c.toUpperCase());
  }

  formatSlot(slot: string): string {
    if (!slot) return '';
    const [h, m] = slot.split(':').map(Number);
    const periodo = h < 12 ? 'AM' : 'PM';
    const h12     = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${periodo}`;
  }

  get slotSelFormateado(): string {
    return this.formatSlot(this.slotSel);
  }

  get precioFinal(): number | null {
    if (this.promoActiva) return parseFloat(this.promoActiva.precio_especial);
    return this.servicioSel ? parseFloat(this.servicioSel.precio) : null;
  }

  confirmarReserva() {
    this.errorConfirm = '';
    if (!this.servicioSel || !this.fechaSel || !this.estilista_selId || !this.slotSel) {
      this.errorConfirm = 'Faltan datos. Vuelve atrás y completa la selección.';
      return;
    }
    this.enviando = true;

    const payload: any = {
      servicio_id:  this.servicioSel.id,
      estilista_id: this.estilista_selId,
      fecha:        this.fechaSel,
      hora:         this.slotSel,
      notas:        this.notasReserva || null
    };
    if (this.promoActiva?.id) {
      payload.promo_id = this.promoActiva.id;
    }

    this.http.post<any>(`${this.apiUrl}/citas`, payload, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.enviando = false;
        alert(
          `¡Cita agendada con éxito!\n\n` +
          `Servicio: ${res.servicio}\n` +
          `Total: Q${res.precio_total}\n\n` +
          `Recibirás un correo de confirmación. Recuerda confirmar tu cita en "Mis Citas".`
        );
        this.navigate.emit('ver-cita');
      },
      error: (err) => {
        this.enviando     = false;
        this.errorConfirm = err.error?.error || 'Error al agendar la cita. Intenta de nuevo.';
        this.cdr.detectChanges();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Navegación interna (regresar pasos)
  // ─────────────────────────────────────────────────────────────────
  volverPaso(n: 1 | 2 | 3) {
    this.errorConfirm = '';
    this.errorGlobal  = '';
    if (n === 1) {
      // Si el servicio está fijo (promo/servicioFijo/edicion) no puede volver al paso 1
      if (this.promoActiva || this.servicioFijo || this.datosEdicion) {
        this.navigate.emit('home');
        return;
      }
      this.servicioSel = null;
      this.fechaSel    = '';
    }
    if (n <= 2) {
      this.estilistas      = [];
      this.estilista_selId = 0;
      this.slotSel         = '';
    }
    this.paso = n;
    this.cdr.detectChanges();
  }

  regresar() { this.navigate.emit('home'); }

  // Navbar del cliente
  private readonly MAPA: Record<string,string> = {
    inicio:'home', reservar:'reservar', ver:'ver-cita',
    servicios:'servicios', promociones:'promociones',
    recompensas:'recompensas', resenas:'resenas', perfil:'perfil'
  };
  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion()               { this.logout.emit(); }
}
