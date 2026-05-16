import { Component, Output, EventEmitter, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AdminNavbarComponent } from '../admin-navbar/admin-navbar';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-notificaciones-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminNavbarComponent],
  templateUrl: './notificaciones-admin.html',
  styleUrls: ['./notificaciones-admin.css']
})
export class NotificacionesAdminComponent implements OnInit {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout   = new EventEmitter<void>();

  // ── Formulario ────────────────────────────────────────────────────
  destinatarioSeleccionado = 'todos';
  clienteSeleccionado      = ''; // ← ID del cliente seleccionado en el dropdown
  correoEspecifico         = '';
  asunto                   = '';
  mensaje                  = '';
  imagenUrl                = '';
  posicionImagen           = 'medio';
  mensajeCierre            = '';
  enviando                 = false;

  // ── Listas y conteos ──────────────────────────────────────────────
  historial:      any[]   = [];
  listaClientes:  any[]   = []; // ← Lista de clientes para el dropdown
  totalClientes:  number  = 0;
  cargando:       boolean = true;

  private apiUrl = `${environment.apiUrl}/api/notificaciones`;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarHistorial();
    this.cargarTotalClientes();
    this.cargarListaClientes();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token');
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  // ── Carga el historial de notificaciones enviadas ─────────────────
  cargarHistorial() {
    this.cargando = true;
    const headers = this.getAuthHeaders();
    this.http.get<any[]>(`${this.apiUrl}/historial`, { headers }).subscribe({
      next: (data) => {
        this.historial = data;
        this.cargando  = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar historial:', err);
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Carga el total de clientes para el alcance estimado ───────────
  cargarTotalClientes() {
    const headers = this.getAuthHeaders();
    this.http.get<any>(`${this.apiUrl}/total-clientes`, { headers }).subscribe({
      next: (data) => {
        this.totalClientes = data.total;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar total clientes:', err)
    });
  }

  // ── Carga la lista de clientes para el dropdown ───────────────────
  cargarListaClientes() {
    const headers = this.getAuthHeaders();
    this.http.get<any[]>(`${this.apiUrl}/lista-clientes`, { headers }).subscribe({
      next: (data) => {
        this.listaClientes = data;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Error al cargar lista de clientes:', err)
    });
  }

  // ── Al seleccionar un cliente del dropdown rellena el correo ──────
  onClienteSeleccionado() {
    const cliente = this.listaClientes.find(c => c.id === Number(this.clienteSeleccionado));
    if (cliente) {
      this.correoEspecifico = cliente.email;
      this.cdr.detectChanges();
    }
  }

  // ── Limpia el historial de notificaciones ─────────────────────────
  limpiarHistorial() {
    if (!confirm('¿Estás seguro de que deseas limpiar el historial de notificaciones?')) return;

    const headers = this.getAuthHeaders();
    this.http.delete(`${this.apiUrl}/historial`, { headers }).subscribe({
      next: () => {
        this.historial = [];
        this.cdr.detectChanges();
      },
      error: (err) => alert('Error al limpiar historial: ' + (err.error?.error || err.message))
    });
  }

  // ── Envía la notificación por correo ──────────────────────────────
  enviarNotificacion() {
    if (this.enviando) return;

    if (!this.asunto.trim()) return alert('El asunto es obligatorio.');
    if (!this.mensaje.trim()) return alert('El mensaje es obligatorio.');
    if (this.destinatarioSeleccionado === 'especifico' && !this.correoEspecifico.trim()) {
      return alert('Selecciona un cliente.');
    }

    this.enviando = true;
    const headers = this.getAuthHeaders();

    const payload = {
      destinatario:     this.destinatarioSeleccionado,
      correoEspecifico: this.correoEspecifico.trim(),
      asunto:           this.asunto.trim(),
      mensaje:          this.mensaje.trim(),
      imagenUrl:        this.imagenUrl.trim() || null,
      posicionImagen:   this.posicionImagen,
      mensajeCierre:    this.mensajeCierre.trim() || null
    };

    this.http.post(`${this.apiUrl}/enviar`, payload, { headers }).subscribe({
      next: (res: any) => {
        this.enviando         = false;
        alert(`Notificación enviada a ${res.enviados} cliente(s).`);
        this.asunto           = '';
        this.mensaje          = '';
        this.correoEspecifico = '';
        this.clienteSeleccionado = '';
        this.imagenUrl        = '';
        this.mensajeCierre    = '';
        this.posicionImagen   = 'medio';
        this.cargarHistorial();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.enviando = false;
        alert('Error al enviar: ' + (err.error?.error || err.message));
      }
    });
  }

  onBack()   { this.navigate.emit('admin'); }
  onLogout() { this.logout.emit(); }
}