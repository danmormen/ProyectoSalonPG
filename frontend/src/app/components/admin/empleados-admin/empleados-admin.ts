import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

interface Empleado {
  id:                   number;
  nombre:               string;
  apellido?:            string;
  email:                string;
  password?:            string;
  telefono:             string;
  rol:                  'admin' | 'estilista' | 'cliente';
  especialidades_ids?:  number[];
  especialidades_nombres?: string[];
  fecha_nacimiento:     string;
  activo:               boolean | number;
}

interface Especialidad {
  id:     number;
  nombre: string;
  activa: number;
}

@Component({
  selector: 'app-empleados-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './empleados-admin.html',
  styleUrls: ['./empleados-admin.css']
})
export class EmpleadosAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl          = `${environment.apiUrl}/api/usuarios`;
  private apiEspecialidades = `${environment.apiUrl}/api/especialidades`;

  empleados:   Empleado[]    = [];
  especialidades: Especialidad[] = [];

  mostrarModal = false;
  editando     = false;
  empleadoForm: Empleado = this.getNuevoEmpleado();

  mostrarInactivos = false;

  // IDs de especialidades seleccionadas en el formulario actual
  especialidadesSeleccionadas: number[] = [];

  mostrarModalPassword = false;
  idUsuarioPassword:        number = 0;
  empleadoPasswordActual:   string = '';
  nuevaPassword = '';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.cargarEmpleados();
    this.cargarEspecialidades();
  }

  getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  getNuevoEmpleado(): Empleado {
    return {
      id: 0, nombre: '', apellido: '', email: '', password: '',
      telefono: '+502 ', rol: 'estilista',
      fecha_nacimiento: '', activo: 1
    };
  }

  // ── Teléfono con máscara ────────────────────────────────────────
  onTelefonoInput(event: any) {
    let numeros = event.target.value.replace(/\D/g, '');
    if (numeros.length > 8) numeros = numeros.substring(0, 8);
    let formateado = numeros.length > 4
      ? `${numeros.substring(0, 4)}-${numeros.substring(4)}`
      : numeros;
    this.empleadoForm.telefono = `+502 ${formateado}`;
    event.target.value = formateado;
  }

  // ── Especialidades ──────────────────────────────────────────────
  cargarEspecialidades() {
    this.http.get<Especialidad[]>(this.apiEspecialidades, { headers: this.getHeaders() })
      .subscribe({
        next: (res) => { this.especialidades = res.filter(e => e.activa); this.cdr.detectChanges(); },
        error: (err) => console.error('Error al cargar especialidades', err)
      });
  }

  toggleEspecialidad(id: number) {
    const idx = this.especialidadesSeleccionadas.indexOf(id);
    if (idx >= 0) {
      this.especialidadesSeleccionadas.splice(idx, 1);
    } else {
      this.especialidadesSeleccionadas.push(id);
    }
  }

  estaSeleccionada(id: number): boolean {
    return this.especialidadesSeleccionadas.includes(id);
  }

  // ── Filtrar empleados ────────────────────────────────────────────
  get empleadosVisibles() {
    return this.empleados.filter(e => this.mostrarInactivos ? !e.activo : e.activo);
  }

  toggleInactivos() {
    this.mostrarInactivos = !this.mostrarInactivos;
  }

  // ── Carga de empleados ──────────────────────────────────────────
  cargarEmpleados() {
    this.http.get<Empleado[]>(this.apiUrl, { headers: this.getHeaders() })
      .subscribe({
        next: (res) => { this.empleados = res; this.cdr.detectChanges(); },
        error: () => alert('Error al obtener la lista de empleados.')
      });
  }

  abrirModalNuevo() {
    this.editando                 = false;
    this.empleadoForm             = this.getNuevoEmpleado();
    this.especialidadesSeleccionadas = [];
    this.mostrarModal             = true;
  }

  abrirModalEditar(emp: Empleado) {
    this.editando = true;
    const tempEmp = { ...emp };

    if (tempEmp.fecha_nacimiento) {
      tempEmp.fecha_nacimiento = tempEmp.fecha_nacimiento.substring(0, 10);
    }

    // Separar nombre y apellido
    const nombreCompleto = (tempEmp.nombre || '').trim();
    const idx = nombreCompleto.indexOf(' ');
    if (idx !== -1) {
      tempEmp.nombre   = nombreCompleto.substring(0, idx);
      tempEmp.apellido = nombreCompleto.substring(idx + 1);
    } else {
      tempEmp.apellido = '';
    }

    this.empleadoForm             = tempEmp;
    this.especialidadesSeleccionadas = [...(emp.especialidades_ids || [])];
    this.mostrarModal             = true;
  }

  guardarEmpleado() {
    if (!this.empleadoForm.nombre || !this.empleadoForm.email) {
      alert('Nombre y Correo son obligatorios.'); return;
    }
    if (this.empleadoForm.rol === 'estilista' && this.especialidadesSeleccionadas.length === 0) {
      alert('Un estilista debe tener al menos una especialidad.'); return;
    }
    if (this.empleadoForm.telefono.length < 14) {
      alert('El teléfono debe tener 8 números (formato xxxx-xxxx).'); return;
    }

    const payload = {
      ...this.empleadoForm,
      nombre: this.empleadoForm.apellido
        ? `${this.empleadoForm.nombre.trim()} ${this.empleadoForm.apellido.trim()}`
        : this.empleadoForm.nombre.trim(),
      activo:         this.empleadoForm.activo ? 1 : 0,
      especialidades: this.especialidadesSeleccionadas
    };

    if (this.editando) {
      this.http.put(`${this.apiUrl}/${this.empleadoForm.id}`, payload, { headers: this.getHeaders() })
        .subscribe({
          next: () => { alert('Empleado actualizado correctamente'); this.cerrarYRefrescar(); },
          error: (err) => {
            const mensaje = err.error?.error || 'Error desconocido';
            const detalle = err.error?.detalle ? `\n\nDetalle: ${err.error.detalle}` : '';
            alert('Error al actualizar: ' + mensaje + detalle);
          }
        });
    } else {
      if (!this.empleadoForm.password || this.empleadoForm.password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres.'); return;
      }
      this.http.post(this.apiUrl, payload, { headers: this.getHeaders() })
        .subscribe({
          next: () => { alert('Empleado creado con éxito'); this.cerrarYRefrescar(); },
          error: (err) => alert('Error al crear: ' + (err.error?.error || 'Error desconocido'))
        });
    }
  }

  eliminarEmpleado(id: number) {
    if (!confirm('¿Estás seguro de eliminar a este empleado?')) return;
    this.http.delete<any>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (res) => {
          if (res?.message === 'desactivado') {
            alert('El empleado tiene historial de citas y fue desactivado. Puedes reactivarlo si regresa.');
          } else {
            alert('Empleado eliminado correctamente.');
          }
          this.cargarEmpleados();
        },
        error: () => alert('Error al eliminar')
      });
  }

  reactivarEmpleado(emp: any) {
    if (!confirm(`¿Reactivar a ${emp.nombre}? Recuperará su acceso y datos anteriores.`)) return;
    this.http.patch<any>(`${this.apiUrl}/${emp.id}/reactivar`, {}, { headers: this.getHeaders() })
      .subscribe({
        next: () => { alert(`${emp.nombre} fue reactivado correctamente.`); this.cargarEmpleados(); },
        error: (err) => alert('Error: ' + (err.error?.error || 'No se pudo reactivar.'))
      });
  }

  // ── Password ────────────────────────────────────────────────────
  abrirModalPassword(emp: Empleado) {
    this.idUsuarioPassword      = emp.id;
    this.empleadoPasswordActual = emp.nombre;
    this.nuevaPassword          = '';
    this.mostrarModalPassword   = true;
  }

  guardarPassword() {
    if (this.nuevaPassword.trim().length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.'); return;
    }
    this.http.patch(`${this.apiUrl}/${this.idUsuarioPassword}/cambiar-password`,
      { password: this.nuevaPassword },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { alert('Contraseña actualizada correctamente'); this.cerrarModalPassword(); },
      error: () => alert('Error al cambiar contraseña')
    });
  }

  cerrarYRefrescar() {
    this.mostrarModal            = false;
    this.editando                = false;
    this.empleadoForm            = this.getNuevoEmpleado();
    this.especialidadesSeleccionadas = [];
    this.cargarEmpleados();
  }

  cerrarModalPassword() {
    this.mostrarModalPassword = false;
    this.nuevaPassword        = '';
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }

  cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    this.logout.emit();
  }
}
