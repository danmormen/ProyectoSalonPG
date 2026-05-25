import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ClientNavbarComponent } from '../client-navbar/client-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-resenas',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientNavbarComponent],
  templateUrl: './resenas.html',
  styleUrl: './resenas.css'
})
export class ResenasComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  private apiUrl = `${environment.apiUrl}/api/resenas`;

  // Estado de carga
  cargando         = true;
  cargandoPublicas = true;
  enviando         = false;
  error            = '';

  // Datos
  citasPendientes: any[] = [];   // citas completadas disponibles para reseñar
  misResenas:      any[] = [];   // reseñas ya enviadas por este cliente
  resenasPublicas: any[] = [];   // reseñas de todos los clientes

  // Modal
  mostrarModal      = false;
  citaSeleccionada: any | null = null;
  nuevaCalificacion = 0;
  nuevoComentario   = '';
  errorModal        = '';

  // Estrellas hover
  hoveredStar = 0;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarPendientes();
    this.cargarHistorial();
    this.cargarPublicas();
  }

  private getHeaders(): HttpHeaders {
    const token = sessionStorage.getItem('token');
    return new HttpHeaders({ 'Authorization': 'Bearer ' + token });
  }

  // ── Carga de datos ───────────────────────────────────────────────

  cargarPendientes() {
    this.cargando = true;
    this.http.get<any[]>(this.apiUrl + '/mis-pendientes', { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.citasPendientes = data;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.citasPendientes = [];
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  cargarHistorial() {
    this.http.get<any[]>(this.apiUrl + '/mi-historial', { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.misResenas = data; this.cdr.detectChanges(); },
      error: () => { this.misResenas = []; }
    });
  }

  cargarPublicas() {
    this.cargandoPublicas = true;
    this.http.get<any[]>(this.apiUrl + '/publicas').subscribe({
      next: (data) => {
        this.resenasPublicas = data;
        this.cargandoPublicas = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.resenasPublicas = [];
        this.cargandoPublicas = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Modal ────────────────────────────────────────────────────────

  abrirModal(cita: any) {
    this.citaSeleccionada  = cita;
    this.nuevaCalificacion = 0;
    this.nuevoComentario   = '';
    this.errorModal        = '';
    this.hoveredStar       = 0;
    this.mostrarModal      = true;
  }

  cerrarModal() {
    this.mostrarModal     = false;
    this.citaSeleccionada = null;
    this.enviando         = false;
  }

  seleccionarEstrellas(n: number) { this.nuevaCalificacion = n; }
  hoverStar(n: number)            { this.hoveredStar = n; }
  leaveStar()                     { this.hoveredStar = 0; }

  estrellaActiva(n: number): boolean {
    return n <= (this.hoveredStar || this.nuevaCalificacion);
  }

  enviarResena() {
    if (this.nuevaCalificacion === 0) { this.errorModal = 'Elige una calificación.'; return; }
    if (!this.nuevoComentario.trim()) { this.errorModal = 'Escribe un comentario.'; return; }

    this.enviando   = true;
    this.errorModal = '';

    this.http.post(this.apiUrl, {
      cita_id:     this.citaSeleccionada.id,
      calificacion: this.nuevaCalificacion,
      comentario:  this.nuevoComentario.trim()
    }, { headers: this.getHeaders() }).subscribe({
      next: () => {
        // Quitar la cita de pendientes y recargar datos
        this.citasPendientes = this.citasPendientes.filter(c => c.id !== this.citaSeleccionada!.id);
        this.cerrarModal();
        this.cargarHistorial();
        this.cargarPublicas();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorModal = err.error?.error || 'No se pudo enviar la reseña.';
        this.enviando   = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────

  formatearFecha(fechaStr: string): string {
    if (!fechaStr) return '';
    const soloFecha = fechaStr.includes('T') ? fechaStr.split('T')[0] : fechaStr;
    const [y, m, d] = soloFecha.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  diasRestantes(hasta: string): number {
    if (!hasta) return 0;
    const diff = new Date(hasta).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  arregloEstrellas(n: number): number[] {
    return Array.from({ length: 5 }, (_, i) => i + 1);
  }

  private readonly MAPA: Record<string, string> = {
    inicio: 'home', reservar: 'reservar', ver: 'ver-cita',
    servicios: 'servicios', promociones: 'promociones',
    recompensas: 'recompensas', resenas: 'resenas', perfil: 'perfil'
  };
  onNavigate(section: string) { this.navigate.emit(this.MAPA[section] ?? section); }
  cerrarSesion()               { this.logout.emit(); }
}
