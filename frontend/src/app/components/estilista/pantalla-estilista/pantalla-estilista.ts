import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

interface DiaHorario {
  dia:            string;
  nombreCompleto: string;
  numeroFecha:    number;
  fechaISO:       string;
  horas:          number;
  inicio:         string;
  fin:            string;
  descanso:       boolean;
  // Días especiales bloqueados por el admin
  bloqueado:      boolean;
  tipoBloqueado:  'cerrado' | 'horario_especial' | '';
  motivoBloqueado: string;
  inicioBloqueado: string;
  finBloqueado:    string;
}

@Component({
  selector: 'app-pantalla-estilista',
  standalone: true,
  imports: [CommonModule, EstilistaNavbarComponent],
  templateUrl: './pantalla-estilista.html',
  styleUrls: ['./pantalla-estilista.css']
})
export class PantallaEstilistaComponent implements OnInit {
  @Output() logout   = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<string>();

  private api = `${environment.apiUrl}/api`;

  nombreEstilista = '';

  // Citas de hoy — reales
  citasHoy:     any[] = [];
  cargandoCitas = true;

  // Notificaciones recientes — reales (máx 3)
  notificaciones: any[] = [];

  // Horario semanal — real
  horarioSemanal: DiaHorario[] = [];
  cargandoHorario = false;
  errorHorario    = '';
  sinHorario      = false;

  private readonly ABREV: Record<string, string> = {
    'domingo':'Dom','lunes':'Lun','martes':'Mar','miércoles':'Mié',
    'miercoles':'Mié','jueves':'Jue','viernes':'Vie','sábado':'Sáb','sabado':'Sáb'
  };
  private readonly INDICE_DIA: Record<string, number> = {
    'domingo':0,'lunes':1,'martes':2,'miércoles':3,'miercoles':3,
    'jueves':4,'viernes':5,'sábado':6,'sabado':6
  };

  private getFechaDelDia(nombreDia: string): number {
    const indice  = this.INDICE_DIA[nombreDia.toLowerCase().trim()] ?? 0;
    const hoy     = new Date();
    const domingo = new Date(hoy);
    domingo.setDate(hoy.getDate() - hoy.getDay() + indice);
    return domingo.getDate();
  }

  private get hoyISO(): string {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`;
  }

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const usuarioStr = localStorage.getItem('usuario');
    if (usuarioStr) {
      try { this.nombreEstilista = JSON.parse(usuarioStr).nombre || ''; } catch {}
    }
    this.cargarCitasHoy();
    this.cargarNotificaciones();
    this.cargarHorario();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Citas de hoy ─────────────────────────────────────────────────
  cargarCitasHoy(): void {
    this.cargandoCitas = true;
    this.http.get<any[]>(
      `${this.api}/citas/mis-citas-estilista?fecha=${this.hoyISO}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.citasHoy = data; this.cargandoCitas = false; this.cdr.detectChanges(); },
      error: ()     => { this.cargandoCitas = false; this.cdr.detectChanges(); }
    });
  }

  // ── Notificaciones recientes (últimas 3) ─────────────────────────
  cargarNotificaciones(): void {
    this.http.get<any[]>(
      `${this.api}/notif-estilista/mis-notificaciones`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.notificaciones = data.slice(0, 3); this.cdr.detectChanges(); },
      error: ()     => {}
    });
  }

  formatearHora(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2,'0')} ${ampm}`;
  }

  formatearTiempo(fechaStr: string): string {
    if (!fechaStr) return '';
    const diff = Date.now() - new Date(fechaStr).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 1)   return 'Ahora';
    if (min < 60)  return `Hace ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24)  return `Hace ${hrs}h`;
    return `Hace ${Math.floor(hrs / 24)}d`;
  }

  // Offset en días desde el lunes para cada nombre de día
  private readonly DIA_OFFSET: Record<string, number> = {
    'lunes':0,'martes':1,'miércoles':2,'miercoles':2,
    'jueves':3,'viernes':4,'sábado':5,'sabado':5,'domingo':6
  };

  private fechaISODesdeLunes(lunesISO: string, nombreDia: string): string {
    const offset = this.DIA_OFFSET[nombreDia.toLowerCase().trim()] ?? 0;
    const d = new Date(lunesISO + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── Horario semanal + días bloqueados ────────────────────────────
  // Carga en paralelo el horario del estilista y los días especiales
  // del admin para la semana actual, y los fusiona en horarioSemanal.
  cargarHorario(): void {
    const token = localStorage.getItem('token');
    if (!token) return;
    this.cargandoHorario = true;

    // Lunes de la semana actual
    const hoy  = new Date();
    const diff = hoy.getDay() === 0 ? -6 : 1 - hoy.getDay();
    hoy.setDate(hoy.getDate() + diff);
    const lunesActual = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;

    // Meses que cubre la semana (puede abarcar dos meses)
    const domingo = new Date(lunesActual + 'T00:00:00');
    domingo.setDate(domingo.getDate() + 6);
    const mesLunes   = lunesActual.substring(0, 7);   // 'YYYY-MM'
    const mesDomingo = `${domingo.getFullYear()}-${String(domingo.getMonth()+1).padStart(2,'0')}`;

    // Construir URLs de días bloqueados (uno o dos meses)
    const urlBloqueadosLunes   = `${this.api}/dias-bloqueados?mes=${mesLunes}`;
    const urlBloqueadosDomingo = mesDomingo !== mesLunes
      ? `${this.api}/dias-bloqueados?mes=${mesDomingo}` : null;

    const bloqueados$ = urlBloqueadosDomingo
      ? forkJoin([
          this.http.get<any[]>(urlBloqueadosLunes).pipe(catchError(() => of([]))),
          this.http.get<any[]>(urlBloqueadosDomingo).pipe(catchError(() => of([])))
        ])
      : this.http.get<any[]>(urlBloqueadosLunes).pipe(catchError(() => of([[]])));

    forkJoin({
      semanas:    this.http.get<any[]>(`${this.api}/horarios/mi-horario`, { headers: this.getHeaders() })
                    .pipe(timeout(10000), catchError(() => of([]))),
      bloqueados: bloqueados$
    }).subscribe({
      next: ({ semanas, bloqueados }) => {
        this.cargandoHorario = false;

        // Aplanar días bloqueados (pueden venir de 1 o 2 arrays)
        const bloqueadosFlat: any[] = Array.isArray(bloqueados[0])
          ? (bloqueados as any[][]).flat()
          : (bloqueados as any[]);

        // Índice rápido: fecha → registro bloqueado
        const bloqueadosMap = new Map<string, any>();
        bloqueadosFlat.forEach(b => bloqueadosMap.set(b.fecha, b));

        if (!semanas || semanas.length === 0) {
          // Sin horario asignado — igual mostrar si hay días bloqueados en la semana
          this.sinHorario = true;
          this.cdr.detectChanges();
          return;
        }

        const semanaActual = semanas.find(s => s.semana_inicio === lunesActual) ?? semanas[0];
        const dias: any[] = semanaActual?.horarios ?? [];

        if (dias.length === 0) { this.sinHorario = true; this.cdr.detectChanges(); return; }

        this.horarioSemanal = dias.map(d => {
          const esDescanso = !!d.descanso;
          const inicio     = d.inicio ?? '';
          const fin        = d.fin    ?? '';
          let horas = 0;
          if (!esDescanso && inicio && fin) {
            const [h1, m1] = inicio.split(':').map(Number);
            const [h2, m2] = fin.split(':').map(Number);
            horas = Math.round(((h2 - h1) + (m2 - m1) / 60) * 10) / 10;
          }
          const nombreDia = (d.dia || '').toLowerCase().trim();
          const fechaISO  = this.fechaISODesdeLunes(lunesActual, nombreDia);
          const blq       = bloqueadosMap.get(fechaISO);

          return {
            dia:             this.ABREV[nombreDia] ?? d.dia.substring(0, 3),
            nombreCompleto:  d.dia,
            numeroFecha:     this.getFechaDelDia(nombreDia),
            fechaISO,
            horas, inicio, fin,
            descanso:        esDescanso,
            bloqueado:       !!blq,
            tipoBloqueado:   blq?.tipo ?? '',
            motivoBloqueado: blq?.motivo ?? '',
            inicioBloqueado: blq?.hora_inicio ? String(blq.hora_inicio).substring(0,5) : '',
            finBloqueado:    blq?.hora_fin    ? String(blq.hora_fin).substring(0,5)    : '',
          } as DiaHorario;
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cargandoHorario = false;
        if (err.status === 404) this.sinHorario = true;
        else this.errorHorario = err.error?.message || `Error ${err.status}`;
        this.cdr.detectChanges();
      }
    });
  }

  get totalHoras(): number  { return this.horarioSemanal.reduce((t, d) => t + d.horas, 0); }
  get confirmadas(): number { return this.citasHoy.filter(c => c.estado === 'confirmada').length; }
  get pendientes():  number { return this.citasHoy.filter(c => c.estado === 'pendiente').length; }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()           { this.logout.emit(); }
  navegarA(modulo: string) { this.navigate.emit(modulo); }
}
