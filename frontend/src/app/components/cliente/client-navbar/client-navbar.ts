import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

// Items posibles del navbar del cliente. Coincide con las secciones que
// maneja el HomeComponent, mas 'inicio' para volver al home.
export type ClientNavSection =
  | 'inicio'
  | 'reservar'
  | 'ver'
  | 'servicios'
  | 'promociones'
  | 'recompensas'
  | 'resenas'
  | 'perfil';

@Component({
  selector: 'app-client-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-navbar.html',
  styleUrl: './client-navbar.css'
})
export class ClientNavbarComponent {
  // Cual item se debe pintar como activo. Lo pasa cada pantalla.
  @Input() active: ClientNavSection = 'inicio';

  // El padre escucha estos eventos y reemite o navega.
  @Output() navigate = new EventEmitter<ClientNavSection>();
  @Output() logout   = new EventEmitter<void>();

  goTo(section: ClientNavSection): void {
    this.navigate.emit(section);
  }

  cerrarSesion(): void {
    this.logout.emit();
  }
}
