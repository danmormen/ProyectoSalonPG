import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-detalle-citas',
  standalone: true,
  imports: [CommonModule, FormsModule, EstilistaNavbarComponent],
  templateUrl: './detalle-citas.html',
  styleUrls: ['./detalle-citas.css']
})
export class DetalleCitasComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  citas:   any[]  = [];
  cargando = true;
  error    = '';

  // Cancelación inline: guarda la cita activa y el motivo mientras el
  // estilista escribe. No abre ningún modal externo.
  citaCancelando:    any     = null;
  motivoCancelacion: string  = '';
  cancelando:        boolean = false;

  get fechaISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  get tituloDia(): string {
    return new Date().toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).replace(/^\w/, c => c.toUpperCase());
  }

  get completadas(): number { return this.citas.filter(c => c.estado === 'completada').length; }
  get total(): number       { return this.citas.length; }
  // La barra de progreso muestra cuántas citas del día ya fueron atendidas.
  // Se calcula como porcentaje para que el CSS pueda usarlo directamente con [style.width].
  get progreso(): number    { return this.total > 0 ? (this.completadas / this.total) * 100 : 0; }

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.cargarCitas(); }

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  cargarCitas() {
    this.cargando = true;
    this.error    = '';
    this.http.get<any[]>(
      `${this.apiUrl}/citas/mis-citas-estilista?fecha=${this.fechaISO}`,
      { headers: this.getHeaders() }
    ).subscribe({
      next: (data) => { this.citas = data; this.cargando = false; this.cdr.detectChanges(); },
      error: () => { this.error = 'No se pudieron cargar las citas.'; this.cargando = false; this.cdr.detectChanges(); }
    });
  }

  // ── Completar ────────────────────────────────────────────────────
  marcarCompletada(cita: any) {
    if (cita.estado === 'completada') return;
    this.http.patch(
      `${this.apiUrl}/citas/${cita.id}/estado`,
      { estado: 'completada' },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { cita.estado = 'completada'; this.cdr.detectChanges(); },
      error: (err) => alert('Error: ' + (err.error?.error || 'Intenta de nuevo'))
    });
  }

  // ── Cancelar inline ──────────────────────────────────────────────
  // Se usa un patrón inline en lugar de un modal porque el estilista
  // trabaja en pantallas pequeñas y un modal extra interrumpe el flujo.
  // citaCancelando guarda la referencia a la cita activa para que el
  // template pueda mostrar el formulario de motivo debajo de esa tarjeta.
  iniciarCancelacion(cita: any) {
    this.citaCancelando    = cita;
    this.motivoCancelacion = '';
    this.cancelando        = false;
    this.cdr.detectChanges();
  }

  descartarCancelacion() {
    this.citaCancelando    = null;
    this.motivoCancelacion = '';
    this.cancelando        = false;
    this.cdr.detectChanges();
  }

  confirmarCancelacion() {
    if (!this.motivoCancelacion.trim()) return;
    this.cancelando = true;
    this.http.patch(
      `${this.apiUrl}/citas/${this.citaCancelando.id}/estado`,
      { estado: 'cancelada', motivo_cancelacion: this.motivoCancelacion.trim() },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => {
        this.citaCancelando.estado             = 'cancelada';
        this.citaCancelando.motivo_cancelacion = this.motivoCancelacion.trim();
        this.descartarCancelacion();
      },
      error: (err) => {
        this.cancelando = false;
        alert('Error: ' + (err.error?.error || 'Intenta de nuevo'));
        this.cdr.detectChanges();
      }
    });
  }

  formatearHora(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    const ampm = hh >= 12 ? 'PM' : 'AM';
    return `${hh % 12 || 12}:${String(mm).padStart(2,'0')} ${ampm}`;
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout()               { this.logout.emit(); }
}
