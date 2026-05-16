import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ClientNavbarComponent } from '../client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

interface Servicio {
  id?: number;
  nombre: string;
  descripcion: string;
  precio: number | string;
  duracion: number | string;
  categoria: string;
  imagen?: string;
  activo: number | boolean;
}

@Component({
  selector: 'app-servicios',
  standalone: true,
  imports: [CommonModule, ClientNavbarComponent],
  templateUrl: './servicios.html',
  styleUrl: './servicios.css'
})
export class ServiciosComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() reservar = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  // URL de tu API
  private apiUrl = `${environment.apiUrl}/api/servicios`;
  
  // Inicializamos la lista vacía para llenarla desde la base de datos
  listaServicios: Servicio[] = [];
  cargando: boolean = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.obtenerServicios();
  }

  /**
   * Obtiene los servicios desde el backend.
   * Nota: Esta ruta es pública, por lo que no necesita Headers de Token.
   */
  obtenerServicios() {
    this.cargando = true;
    this.http.get<Servicio[]>(this.apiUrl).subscribe({
      next: (data) => {
        // Filtramos para que el cliente solo vea servicios marcados como ACTIVOS
        this.listaServicios = data.filter(s => s.activo == 1 || s.activo == true);
        this.cargando = false;
        this.cdr.detectChanges(); // Asegura que la vista se actualice
      },
      error: (err) => {
        console.error('Error al cargar servicios para clientes:', err);
        this.cargando = false;
      }
    });
  }

  private readonly MAPA: Record<string,string> = {
    inicio:'home', reservar:'reservar', ver:'ver-cita',
    servicios:'servicios', promociones:'promociones',
    recompensas:'recompensas', resenas:'resenas', perfil:'perfil'
  };

  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion()              { this.logout.emit(); }
  onReservar(servicio: string){ this.reservar.emit(servicio); }
}