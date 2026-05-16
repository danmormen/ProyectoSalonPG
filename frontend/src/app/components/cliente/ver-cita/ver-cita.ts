import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ClientNavbarComponent } from '../client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-ver-cita',
  standalone: true,
  imports: [CommonModule, ClientNavbarComponent],
  templateUrl: './ver-cita.html',
  styleUrl: './ver-cita.css'
})
export class VerCitaComponent implements OnInit {
  @Output() navigate  = new EventEmitter<string>();
  @Output() modificar = new EventEmitter<any>();
  @Output() logout    = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/citas`;

  listaCitas: any[] = [];
  cargando  = true;
  error     = '';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarCitas();
  }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    });
  }

  cargarCitas() {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl + '/mis-citas', { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

              // Solo se muestran citas cuya fecha sea hoy o posterior.
        // Las pasadas ya no son accionables (no se pueden cancelar ni modificar)
        // y llenarían la lista sin aportar nada al cliente en este momento.
        // Se usa new Date(y, m-1, d) para construir la fecha en hora local y
        // evitar el desfase UTC que da c.fecha directamente como ISO string.
        this.listaCitas = data.filter(c => {
          const soloFecha = (c.fecha as string).includes('T') ? c.fecha.split('T')[0] : c.fecha;
          const [y, m, d] = soloFecha.split('-').map(Number);
          return new Date(y, m - 1, d) >= hoy;
        });

        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar citas:', err);
        this.error    = 'No se pudieron cargar tus citas.';
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  onModificar(cita: any) { this.modificar.emit(cita); }

  // El cliente siempre puede cancelar una cita activa.
  puedeCancelar(cita: any): boolean {
    return cita.estado !== 'cancelada' && cita.estado !== 'completada';
  }

  // Solo se puede modificar si faltan más de 24 horas para la cita.
  // La política es: se puede cambiar hasta el día anterior pero no el mismo día
  // porque el estilista ya organizó su agenda. Se compara en milisegundos para
  // manejar correctamente la hora exacta y no solo la fecha.
  puedeModificar(cita: any): boolean {
    if (cita.estado === 'cancelada' || cita.estado === 'completada') return false;
    const [fy, fm, fd] = (cita.fecha as string).substring(0, 10).split('-').map(Number);
    const [fh, fmin]   = (cita.hora  as string).substring(0, 5).split(':').map(Number);
    const citaMs       = new Date(fy, fm - 1, fd, fh, fmin).getTime();
    return citaMs - Date.now() > 24 * 60 * 60 * 1000;
  }

  // Devuelve true si el cliente puede confirmar su cita (solo pendiente).
  puedeConfirmar(cita: any): boolean {
    return cita.estado === 'pendiente';
  }

  onConfirmar(cita: any) {
    this.http.patch(this.apiUrl + '/' + cita.id + '/confirmar', {}, { headers: this.getHeaders() }).subscribe({
      next: () => { cita.estado = 'confirmada'; this.cdr.detectChanges(); },
      error: (err) => alert(err.error?.error || 'No se pudo confirmar la cita.')
    });
  }

  onCancelar(cita: any) {
    if (!confirm('¿Estás seguro de cancelar tu cita de ' + cita.servicios + '?')) return;
    this.http.delete(this.apiUrl + '/' + cita.id, { headers: this.getHeaders() }).subscribe({
      next: () => { cita.estado = 'cancelada'; this.cdr.detectChanges(); },
      error: (err) => alert(err.error?.error || 'No se pudo cancelar la cita.')
    });
  }

  formatearFecha(fechaStr: string): string {
    if (!fechaStr) return '';
    const soloFecha = fechaStr.includes("T") ? fechaStr.split("T")[0] : fechaStr;
    const [y, m, d] = soloFecha.split("-").map(Number);
    const fecha = new Date(y, m - 1, d);
    return fecha.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
                .replace(/^\w/, c => c.toUpperCase());
  }

  formatearHora(horaStr: string): string {
    if (!horaStr) return '';
    const [h, m] = horaStr.split(':');
    const hora   = parseInt(h);
    const ampm   = hora >= 12 ? 'PM' : 'AM';
    const h12    = hora % 12 || 12;
    return h12 + ':' + m + ' ' + ampm;
  }

  estadoClass(estado: string): string {
    const mapa: Record<string,string> = {
      confirmada:'tag-green', completada:'tag-blue',
      pendiente:'tag-yellow', cancelada:'tag-red'
    };
    return mapa[estado] ?? 'tag-yellow';
  }

  private readonly MAPA: Record<string,string> = {
    inicio:'home', reservar:'reservar', ver:'ver-cita',
    servicios:'servicios', promociones:'promociones',
    recompensas:'recompensas', resenas:'resenas', perfil:'perfil'
  };
  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion()               { this.logout.emit(); }
}
