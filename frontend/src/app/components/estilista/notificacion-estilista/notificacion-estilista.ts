import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-notificacion-estilista',
  standalone: true,
  imports: [CommonModule, EstilistaNavbarComponent],
  templateUrl: './notificacion-estilista.html',
  styleUrls: ['./notificacion-estilista.css']
})
export class NotificacionEstilistaComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/notif-estilista`;

  notificaciones: any[] = [];
  cargando  = true;
  error     = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.cargarNotificaciones(); }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  cargarNotificaciones() {
    this.cargando = true;
    this.http.get<any[]>(`${this.apiUrl}/mis-notificaciones`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => { this.notificaciones = data; this.cargando = false; this.cdr.detectChanges(); },
        error: () => { this.error = 'No se pudieron cargar las notificaciones.'; this.cargando = false; this.cdr.detectChanges(); }
      });
  }

  // Getter calculado: cuenta cuántas notificaciones no han sido leídas.
  // Se usa en el template para mostrar el texto "X sin leer" en el encabezado.
  // El campo 'leida' viene del backend como 0/1, por eso !n.leida captura ambos false y 0.
  get sinLeerCount(): number { return this.notificaciones.filter(n => !n.leida).length; }

  // Marca una sola notificación como leída. Si ya estaba leída, no hace nada
  // para evitar un PATCH innecesario. Actualiza el objeto local directamente
  // (leida = 1) sin recargar toda la lista.
  marcarComoLeida(notif: any) {
    if (notif.leida) return;
    this.http.patch(`${this.apiUrl}/${notif.id}/leer`, {}, { headers: this.getHeaders() })
      .subscribe({ next: () => { notif.leida = 1; this.cdr.detectChanges(); }, error: () => {} });
  }

  // Elimina una notificación del servidor y la quita del array local con filter.
  // No recarga la lista completa — actualización optimista del estado local.
  eliminarNotificacion(id: number) {
    this.http.delete(`${this.apiUrl}/${id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => { this.notificaciones = this.notificaciones.filter(n => n.id !== id); this.cdr.detectChanges(); },
        error: () => {}
      });
  }

  // Marca todas como leídas en el backend con un solo PATCH, luego actualiza
  // cada objeto local para no recargar la lista desde el servidor.
  marcarTodas() {
    this.http.patch(`${this.apiUrl}/marcar-todas`, {}, { headers: this.getHeaders() })
      .subscribe({
        next: () => { this.notificaciones.forEach(n => n.leida = 1); this.cdr.detectChanges(); },
        error: () => {}
      });
  }

  borrarTodas() {
    if (!confirm('¿Borrar todas las notificaciones?')) return;
    this.http.delete(`${this.apiUrl}/borrar-todas`, { headers: this.getHeaders() })
      .subscribe({
        next: () => { this.notificaciones = []; this.cdr.detectChanges(); },
        error: () => {}
      });
  }

  // La fecha del backend viene como string ISO con zona UTC. toLocaleDateString
  // la convierte a la zona del navegador del estilista automáticamente.
  formatearFecha(fechaStr: string): string {
    if (!fechaStr) return '';
    const d = new Date(fechaStr);
    return d.toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }) +
           ', ' + d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout()               { this.logout.emit(); }
}
