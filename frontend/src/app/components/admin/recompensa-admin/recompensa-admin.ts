import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-recompensa-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './recompensa-admin.html',
  styleUrls: ['./recompensa-admin.css']
})
export class RecompensasAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  recompensas: any[] = [];
  mostrarModal = false;
  esEdicion    = false;
  cargando     = true;
  guardando    = false;

  private apiUrl = `${environment.apiUrl}/api/recompensas`;

  recompensaForm: any = this.getNuevaRecompensa();

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarRecompensas();
  }

  // ── Headers con token JWT ─────────────────────────────────────────
  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // ── Formulario vacío ──────────────────────────────────────────────
  getNuevaRecompensa() {
    return {
      id:                null,
      nombre:            '',
      descripcion:       '',
      puntos_requeridos: null,
      activo:            1,
      canjes:            0
    };
  }

  // ── KPIs calculados automáticamente ──────────────────────────────
  get totalRecompensas() {
    return this.recompensas.length;
  }

  get recompensasActivas() {
    return this.recompensas.filter(r => r.activo === 1).length;
  }

  get totalCanjes() {
    return this.recompensas.reduce((acc, curr) => acc + (curr.canjes || 0), 0);
  }

  // ── Carga las recompensas del backend ─────────────────────────────
  cargarRecompensas() {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.recompensas = data;
        this.cargando    = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar recompensas:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Abre modal para nueva recompensa ──────────────────────────────
  nuevaRecompensa() {
    this.esEdicion      = false;
    this.guardando      = false;
    this.recompensaForm = this.getNuevaRecompensa();
    this.mostrarModal   = true;
  }

  // ── Abre modal para editar recompensa existente ───────────────────
  editarRecompensa(recompensa: any) {
    this.esEdicion      = true;
    this.guardando      = false;
    this.recompensaForm = { ...recompensa };
    this.mostrarModal   = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
  }

  // ── Guarda o actualiza la recompensa ──────────────────────────────
  guardarRecompensa() {
    if (this.guardando) return;

    // Validaciones
    if (!this.recompensaForm.nombre?.trim()) {
      return alert('El nombre es obligatorio.');
    }
    if (!this.recompensaForm.puntos_requeridos || this.recompensaForm.puntos_requeridos <= 0) {
      return alert('Los puntos requeridos deben ser mayor a 0.');
    }

    // Payload limpio
    const payload = {
      ...this.recompensaForm,
      nombre:            this.recompensaForm.nombre.trim(),
      puntos_requeridos: Number(this.recompensaForm.puntos_requeridos),
      activo:            Number(this.recompensaForm.activo)
    };

    const headers  = this.getAuthHeaders();
    this.guardando = true;

    if (this.esEdicion) {
      this.http.put(`${this.apiUrl}/${payload.id}`, payload, { headers }).subscribe({
        next: () => {
          this.mostrarModal   = false;
          this.recompensaForm = this.getNuevaRecompensa();
          this.guardando      = false;
          this.cdr.detectChanges(); // ← Fuerza cierre del modal
          this.cargarRecompensas();
        },
        error: (err) => {
          this.guardando = false;
          alert('Error al actualizar: ' + (err.error?.error || err.message));
        }
      });
    } else {
      this.http.post(this.apiUrl, payload, { headers }).subscribe({
        next: () => {
          this.mostrarModal   = false;
          this.recompensaForm = this.getNuevaRecompensa();
          this.guardando      = false;
          this.cdr.detectChanges(); // ← Fuerza cierre del modal
          this.cargarRecompensas();
        },
        error: (err) => {
          this.guardando = false;
          alert('Error al crear: ' + (err.error?.error || err.message));
        }
      });
    }
  }

  // ── Elimina una recompensa ────────────────────────────────────────
  eliminarRecompensa(id: number) {
    if (confirm('¿Estás seguro de que deseas eliminar esta recompensa?')) {
      const headers = this.getAuthHeaders();
      this.http.delete(`${this.apiUrl}/${id}`, { headers }).subscribe({
        next: () => this.cargarRecompensas(),
        error: (err) => alert('Error al eliminar: ' + (err.error?.error || err.message))
      });
    }
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()           { this.logout.emit(); }
}