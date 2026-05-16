import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-promociones-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './promociones-admin.html',
  styleUrls: ['./promociones-admin.css']
})
export class PromocionesAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  promociones: any[] = [];
  servicios:   any[] = [];   // lista de servicios para el select del formulario
  mostrarModal = false;
  editando  = false;
  guardando = false;
  cargando  = true;
  promoForm: any = this.getNuevaPromo();

  private apiUrl      = `${environment.apiUrl}/api/promociones`;
  private serviciosUrl = `${environment.apiUrl}/api/servicios`;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Cargamos servicios y promociones en paralelo para no bloquear la UI.
    this.cargarServicios();
    this.cargarPromociones();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });
  }

  // ── Servicios ─────────────────────────────────────────────────────
  // Se necesitan solo para mostrar el select "Servicio incluido" en el modal.
  // Solo mostramos los activos porque no tiene sentido crear una promo
  // para un servicio que ya no se ofrece.
  cargarServicios() {
    this.http.get<any[]>(this.serviciosUrl).subscribe({
      next: (data) => {
        this.servicios = data.filter(s => s.activo === 1 || s.activo === true);
        this.cdr.detectChanges();
      },
      error: () => { /* si falla los servicios igual podemos gestionar promos */ }
    });
  }

  // ── Promociones ───────────────────────────────────────────────────
  cargarPromociones() {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.promociones = data;
        this.cargando    = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar promociones:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Modelo vacío de formulario ────────────────────────────────────
  // Refleja el nuevo esquema: servicio_id + precio_especial.
  // El campo activo empieza en 1 (activa) al crear.
  getNuevaPromo() {
    return {
      id:             0,
      titulo:         '',
      descripcion:    '',
      servicio_id:    null as number | null,
      precio_especial: 0,
      fecha_inicio:   '',
      fecha_fin:      '',
      limite_usos:    null as number | null,
      activo:         1
    };
  }

  abrirModalNuevo() {
    this.editando    = false;
    this.guardando   = false;
    this.promoForm   = this.getNuevaPromo();
    this.mostrarModal = true;
  }

  abrirModalEditar(promo: any) {
    this.editando    = true;
    this.guardando   = false;
    this.promoForm   = {
      ...promo,
      // Las fechas llegan como datetime ISO; el input[type=date] necesita YYYY-MM-DD.
      fecha_inicio: promo.fecha_inicio ? promo.fecha_inicio.split('T')[0] : '',
      fecha_fin:    promo.fecha_fin    ? promo.fecha_fin.split('T')[0]    : '',
      // servicio_id puede llegar como número; lo casteamos igual por seguridad.
      servicio_id:  promo.servicio_id ?? null
    };
    this.mostrarModal = true;
  }

  guardarPromo() {
    if (this.guardando) return;

    // Validaciones básicas en el frontend para no hacer viaje al servidor innecesario.
    if (!this.promoForm.titulo?.trim()) {
      return alert('El título es obligatorio.');
    }
    if (!this.promoForm.servicio_id) {
      return alert('Debes seleccionar un servicio para la promoción.');
    }
    if (this.promoForm.precio_especial == null || Number(this.promoForm.precio_especial) < 0) {
      return alert('El precio especial debe ser un número mayor o igual a 0.');
    }
    if (!this.promoForm.fecha_inicio || !this.promoForm.fecha_fin) {
      return alert('Las fechas de inicio y fin son obligatorias.');
    }
    const inicio = new Date(this.promoForm.fecha_inicio);
    const fin    = new Date(this.promoForm.fecha_fin);
    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      return alert('Una o ambas fechas no son válidas.');
    }
    if (fin < inicio) {
      return alert('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }

    const payload = {
      titulo:          this.promoForm.titulo.trim(),
      descripcion:     this.promoForm.descripcion?.trim() || null,
      servicio_id:     Number(this.promoForm.servicio_id),
      precio_especial: parseFloat(this.promoForm.precio_especial),
      fecha_inicio:    this.promoForm.fecha_inicio,
      fecha_fin:       this.promoForm.fecha_fin,
      limite_usos:     this.promoForm.limite_usos ? Number(this.promoForm.limite_usos) : null,
      activo:          Number(this.promoForm.activo)
    };

    const headers  = this.getAuthHeaders();
    this.guardando = true;

    if (this.editando) {
      this.http.put(`${this.apiUrl}/${this.promoForm.id}`, payload, { headers }).subscribe({
        next: () => {
          this.mostrarModal = false;
          this.promoForm    = this.getNuevaPromo();
          this.guardando    = false;
          this.cargarPromociones();
        },
        error: (err) => {
          this.guardando = false;
          alert('Error al actualizar: ' + (err.error?.error || err.message));
        }
      });
    } else {
      this.http.post(this.apiUrl, payload, { headers }).subscribe({
        next: () => {
          this.mostrarModal = false;
          this.promoForm    = this.getNuevaPromo();
          this.guardando    = false;
          this.cargarPromociones();
        },
        error: (err) => {
          this.guardando = false;
          alert('Error al crear: ' + (err.error?.error || err.message));
        }
      });
    }
  }

  eliminarPromo(id: number) {
    if (confirm('¿Seguro que deseas eliminar esta promoción?')) {
      const headers = this.getAuthHeaders();
      this.http.delete(`${this.apiUrl}/${id}`, { headers }).subscribe({
        next: () => this.cargarPromociones(),
        error: (err) => alert('Error al eliminar: ' + (err.error?.error || err.message))
      });
    }
  }

  // Devuelve el texto de estado de usos: "Ilimitada" o "X/Y usos".
  textoUsos(p: any): string {
    if (p.limite_usos === null || p.limite_usos === undefined) return 'Ilimitada';
    return `${p.usos_actuales ?? 0} / ${p.limite_usos} usos`;
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  cerrarSesion()           { this.logout.emit(); }
}