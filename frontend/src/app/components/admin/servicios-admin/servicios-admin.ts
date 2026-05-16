import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

interface Servicio {
  id?: number;
  nombre: string;
  descripcion: string;
  precio: number;
  duracion: number;
  categoria: string;
  imagen?: string;
  activo: boolean | number;
  especialidad_id?: number | null;
  especialidad_nombre?: string;
}

interface Especialidad {
  id: number;
  nombre: string;
  activa: number;
}

@Component({
  selector: 'app-servicios-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './servicios-admin.html',
  styleUrls: ['./servicios-admin.css']
})
export class ServiciosAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiServicios     = `${environment.apiUrl}/api/servicios`;
  private apiEspecialidades = `${environment.apiUrl}/api/especialidades`;

  // ── Servicios ────────────────────────────────────────────────────
  servicios:    Servicio[]    = [];
  mostrarModal  = false;
  editando      = false;
  servicioForm: Servicio = this.getNuevoServicio();

  // ── Especialidades ───────────────────────────────────────────────
  especialidades:   Especialidad[] = [];
  mostrarModalEsp   = false;
  editandoEsp       = false;
  guardandoEsp      = false;
  errorEsp          = '';
  espForm: { id?: number; nombre: string; activa: number } = this.getNuevaEsp();

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.cargarServicios();
    this.cargarEspecialidades();
  }

  getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ════════════════════════════════════════════════════════════════
  // SERVICIOS
  // ════════════════════════════════════════════════════════════════

  getNuevoServicio(): Servicio {
    return { nombre: '', descripcion: '', precio: 0, duracion: 0,
             categoria: 'otros', activo: 1, especialidad_id: null };
  }

  cargarServicios() {
    this.http.get<Servicio[]>(this.apiServicios).subscribe({
      next: (res) => { this.servicios = res; this.cdr.detectChanges(); },
      error: () => alert('Error al obtener la lista de servicios.')
    });
  }

  abrirModalNuevo() {
    this.editando     = false;
    this.servicioForm = this.getNuevoServicio();
    this.mostrarModal = true;
  }

  abrirModalEditar(s: Servicio) {
    this.editando     = true;
    this.servicioForm = { ...s };
    this.mostrarModal = true;
  }

  guardarServicio() {
    if (!this.servicioForm.nombre || !this.servicioForm.precio || !this.servicioForm.duracion) {
      alert('Nombre, Precio y Duración son obligatorios.');
      return;
    }
    if (this.servicioForm.precio < 0)  { alert('El precio no puede ser negativo.'); return; }
    if (this.servicioForm.duracion < 1) { alert('La duración debe ser de al menos 1 minuto.'); return; }

    const payload = { ...this.servicioForm, activo: this.servicioForm.activo ? 1 : 0 };

    if (this.editando) {
      this.http.put(`${this.apiServicios}/${this.servicioForm.id}`, payload, { headers: this.getHeaders() })
        .subscribe({
          next: () => { alert('Servicio actualizado correctamente'); this.cerrarYRefrescar(); },
          error: (err) => alert('Error al actualizar: ' + (err.error?.error || 'Error desconocido'))
        });
    } else {
      this.http.post(this.apiServicios, payload, { headers: this.getHeaders() })
        .subscribe({
          next: () => { alert('Servicio creado con éxito'); this.cerrarYRefrescar(); },
          error: (err) => alert('Error al crear: ' + (err.error?.error || 'Error desconocido'))
        });
    }
  }

  eliminarServicio(id: number | undefined) {
    if (!id) return;
    if (!confirm('¿Estás seguro? Si el servicio tiene citas asociadas se desactivará en lugar de eliminarse.')) return;
    this.http.delete<any>(`${this.apiServicios}/${id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (res) => {
          if (res?.message === 'desactivado') {
            alert('El servicio tiene citas asociadas y fue desactivado (ya no aparece para nuevas reservas, pero el historial se mantiene).');
          } else {
            alert('Servicio eliminado correctamente.');
          }
          this.cargarServicios();
        },
        error: (err) => alert('Error: ' + (err.error?.error || 'No se pudo procesar la solicitud.'))
      });
  }

  cerrarYRefrescar() {
    this.mostrarModal = false;
    this.editando     = false;
    this.servicioForm = this.getNuevoServicio();
    this.cargarServicios();
  }

  // ════════════════════════════════════════════════════════════════
  // ESPECIALIDADES
  // ════════════════════════════════════════════════════════════════

  getNuevaEsp() {
    return { nombre: '', activa: 1 };
  }

  cargarEspecialidades() {
    this.http.get<Especialidad[]>(this.apiEspecialidades, { headers: this.getHeaders() })
      .subscribe({
        next: (res) => { this.especialidades = res; this.cdr.detectChanges(); },
        error: () => console.error('Error al cargar especialidades')
      });
  }

  abrirModalNuevaEsp() {
    this.editandoEsp   = false;
    this.espForm       = this.getNuevaEsp();
    this.errorEsp      = '';
    this.mostrarModalEsp = true;
  }

  abrirModalEditarEsp(esp: Especialidad) {
    this.editandoEsp   = true;
    this.espForm       = { id: esp.id, nombre: esp.nombre, activa: esp.activa };
    this.errorEsp      = '';
    this.mostrarModalEsp = true;
  }

  guardarEspecialidad() {
    if (!this.espForm.nombre.trim()) {
      this.errorEsp = 'El nombre es obligatorio.'; return;
    }
    this.guardandoEsp = true;
    this.errorEsp     = '';

    const req$ = this.editandoEsp
      ? this.http.put(`${this.apiEspecialidades}/${this.espForm.id}`, this.espForm, { headers: this.getHeaders() })
      : this.http.post(this.apiEspecialidades, this.espForm, { headers: this.getHeaders() });

    req$.subscribe({
      next: () => {
        this.guardandoEsp    = false;
        this.mostrarModalEsp = false;
        this.cargarEspecialidades();
        this.cargarServicios(); // refrescar nombre de especialidad en cards
      },
      error: (err) => {
        this.guardandoEsp = false;
        this.errorEsp = err.error?.error || 'Error al guardar.';
      }
    });
  }

  eliminarEspecialidad(esp: Especialidad) {
    if (!confirm(`¿Desactivar la especialidad "${esp.nombre}"? Los estilistas que la tienen asignada no se verán afectados.`)) return;
    this.http.delete(`${this.apiEspecialidades}/${esp.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => this.cargarEspecialidades(),
        error: () => alert('Error al desactivar.')
      });
  }

  cerrarModalEsp() {
    this.mostrarModalEsp = false;
    this.errorEsp        = '';
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }

  cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.logout.emit();
  }
}
