import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

// EstilistaNavSection — tipo union con los nombres de sección del navbar del estilista.
// Cada pantalla del módulo estilista le pasa a este navbar cuál sección está activa
// a través del @Input 'active', para resaltar el ítem correspondiente.
export type EstilistaNavSection =
  | 'inicio' | 'agenda' | 'detalle' | 'horario'
  | 'resenas' | 'notificaciones' | 'perfil' | 'nueva-cita';

@Component({
  selector: 'app-estilista-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './estilista-navbar.html',
  styleUrl: './estilista-navbar.css'
})
export class EstilistaNavbarComponent implements OnInit {
  @Input() active: EstilistaNavSection = 'inicio';
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  // Badge de notificaciones no leídas. Se carga en ngOnInit y se muestra
  // como número rojo encima del ícono de notificaciones en el navbar.
  notifSinLeer = 0;

  // Mapa interno: sección semántica → nombre de vista que espera app.ts.
  // El navbar emite el nombre de la vista directamente para que app.ts
  // lo procese en onNavigate() sin necesidad de traducción adicional.
  private rutas: Record<EstilistaNavSection, string> = {
    inicio:         'estilista',
    agenda:         'citas-estilista',
    detalle:        'detalle-citas',
    horario:        'horario-estilista',
    resenas:        'resenas-estilista',
    notificaciones: 'notificacion-estilista',
    perfil:         'perfil-estilista',
    'nueva-cita':   'agendar-walkin'
  };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.cargarConteo(); }

  // Llama al endpoint /sin-leer cada vez que se monta el navbar (es decir,
  // cada vez que el estilista navega a cualquier pantalla de su módulo).
  // Así el badge siempre refleja el estado actual sin necesidad de WebSockets.
  // Si la petición falla (token expirado, servidor caído) simplemente no se muestra el badge.
  cargarConteo() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const headers = new HttpHeaders({ Authorization: 'Bearer ' + token });
    this.http.get<{ total: number }>(`${environment.apiUrl}/api/notif-estilista/sin-leer`, { headers })
      .subscribe({
        next: (res) => { this.notifSinLeer = res.total; this.cdr.detectChanges(); },
        error: () => {}
      });
  }

  goTo(section: EstilistaNavSection): void { this.navigate.emit(this.rutas[section]); }
  cerrarSesion(): void { this.logout.emit(); }
}
