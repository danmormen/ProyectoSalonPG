import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

// Items posibles del navbar del admin
export type AdminNavSection =
  | 'inicio'
  | 'citas'
  | 'empleados'
  | 'horarios'
  | 'servicios'
  | 'promociones'
  | 'recompensas'
  | 'reportes'
  | 'notificaciones'
  | 'dias-especiales';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-navbar.html',
  styleUrl: './admin-navbar.css'
})
export class AdminNavbarComponent {
  @Input() active: AdminNavSection = 'inicio';

  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  // Mapea cada item a la ruta real que entiende app.ts
  private rutas: Record<AdminNavSection, string> = {
    inicio:         'admin',
    citas:          'gestion-citas-admin',
    empleados:      'empleados-admin',
    horarios:       'horarios-administrador',
    servicios:      'servicios-admin',
    promociones:    'promociones-admin',
    recompensas:    'recompensas-admin',
    reportes:       'blog-admin',
    notificaciones:   'notificaciones-admin',
    'dias-especiales': 'dias-especiales-admin'
  };

  goTo(section: AdminNavSection): void {
    this.navigate.emit(this.rutas[section]);
  }

  cerrarSesion(): void {
    this.logout.emit();
  }
}
