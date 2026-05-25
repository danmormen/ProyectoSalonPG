import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';
import { environment } from '../../../../environments/environment';

interface DistribucionItem {
  nivel: number;
  cantidad: number;
  porcentaje: number;
}

interface ResenaItem {
  id: number;
  calificacion: number;
  comentario: string;
  fecha: string;
  cliente: string;
  servicios: string;
}

@Component({
  selector: 'app-resenas-estilista',
  standalone: true,
  imports: [CommonModule, EstilistaNavbarComponent],
  templateUrl: './resenas-estilista.html',
  styleUrls: ['./resenas-estilista.css']
})
export class ResenasEstilistaComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api`;

  cargando = true;
  error    = '';

  promedio      = 0;
  totalResenas  = 0;
  distribucion: DistribucionItem[] = [];
  resenas: ResenaItem[] = [];

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.cargarPerfil(); }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ Authorization: 'Bearer ' + token });
  }

  cargarPerfil() {
    this.cargando = true;
    this.error    = '';
    this.http.get<any>(`${this.apiUrl}/resenas/mi-perfil-estilista`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.promedio     = data.promedio     || 0;
          this.totalResenas = data.total        || 0;
          this.distribucion = data.distribucion || [];
          this.resenas      = data.resenas      || [];
          this.cargando     = false;
          this.cdr.detectChanges();
        },
        error: () => {
          // En caso de error mostramos estado vacío en lugar de mensaje de error
          this.promedio     = 0;
          this.totalResenas = 0;
          this.distribucion = [];
          this.resenas      = [];
          this.cargando     = false;
          this.cdr.detectChanges();
        }
      });
  }

  // Returns array of booleans for star rendering
  getStars(rating: number): boolean[] {
    return Array(5).fill(false).map((_, i) => i < Math.round(rating));
  }

  // Returns booleans for the summary average stars (uses half-star rounding)
  getPromedioStars(): boolean[] {
    return Array(5).fill(false).map((_, i) => i < Math.round(this.promedio));
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '';
    const d = new Date(fecha + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout()               { this.logout.emit(); }
}
