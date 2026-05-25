import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

// ── Componentes Cliente ────────────────────────────────────────────
import { LoginComponent } from './components/shared/login/login';
import { RegistroComponent } from './components/shared/registro/registro';
import { HomeComponent } from './components/cliente/home/home';
import { PerfilComponent } from './components/shared/perfil/perfil';
import { ServiciosComponent } from './components/cliente/servicios/servicios';
import { ReservarComponent } from './components/cliente/reservar/reservar';
import { PromocionesComponent } from './components/cliente/promociones/promociones';
import { VerCitaComponent } from './components/cliente/ver-cita/ver-cita';
import { RecompensasComponent } from './components/cliente/recompensas/recompensas';
import { ResenasComponent } from './components/cliente/resenas/resenas';

// ── Componentes Admin ──────────────────────────────────────────────
import { PantallaAdminComponent } from './components/admin/pantalla-administrador/pantalla-administrador';
import { EmpleadosAdminComponent } from './components/admin/empleados-admin/empleados-admin';
import { ServiciosAdminComponent } from './components/admin/servicios-admin/servicios-admin';
import { GestionCitasAdminComponent } from './components/admin/gestion-citas-admin/gestion-citas-admin';
import { PromocionesAdminComponent } from './components/admin/promociones-admin/promociones-admin';
import { NotificacionesAdminComponent } from './components/admin/notificaciones-admin/notificaciones-admin';
import { RecompensasAdminComponent } from './components/admin/recompensa-admin/recompensa-admin';
import { ReportesAdminComponent } from './components/admin/reportes-admin/reportes-admin';
import { DiasEspecialesAdminComponent } from './components/admin/dias-especiales-admin/dias-especiales-admin';

// ── Componentes Estilista ──────────────────────────────────────────
import { PantallaEstilistaComponent } from './components/estilista/pantalla-estilista/pantalla-estilista';
import { CitasEstilistaComponent } from './components/estilista/citas-estilista/citas-estilista';
import { DetalleCitasComponent } from './components/estilista/detalle-citas/detalle-citas';
import { ResenasEstilistaComponent } from './components/estilista/resenas-estilista/resenas-estilista';
import { NotificacionEstilistaComponent } from './components/estilista/notificacion-estilista/notificacion-estilista';
import { PerfilEstilistaComponent } from './components/estilista/perfil-estilista/perfil-estilista';
import { EstilistaHorarioComponent } from './components/estilista/horario-estilista/horario-estilista';
import { HorariosAdministradorComponent } from './components/admin/horario-administrador/horario-administrador';
import { AgendarWalkinComponent } from './components/estilista/agendar-walkin/agendar-walkin';

// ── Componentes de Autenticación y Seguridad ──────────────────────
import { CambioContrasenaComponent } from './components/shared/cambio-contrasena/cambio-contrasena';
import { RecuperarContrasenaComponent } from './components/shared/recuperar-contrasena/recuperar-contrasena';

// ══════════════════════════════════════════════════════════════════
// VistaActual — tipo union con todos los nombres de pantalla posibles.
// Solo los strings aquí listados son válidos como destino de navegación.
// Si se intenta navegar a algo que no está en este tipo, TypeScript
// lo detecta en tiempo de compilación antes de que llegue al usuario.
// ══════════════════════════════════════════════════════════════════
type VistaActual =
  | 'login' | 'registro' | 'home' | 'perfil' | 'servicios'
  | 'reservar' | 'promociones' | 'ver-cita' | 'recompensas'
  | 'resenas'
  | 'admin' | 'empleados-admin' | 'gestion-citas-admin'
  | 'notificaciones-admin' | 'promociones-admin' | 'servicios-admin'
  | 'blog-admin' | 'recompensa-admin' | 'horarios-administrador'
  | 'dias-especiales-admin'
  | 'estilista' | 'citas-estilista' | 'detalle-citas'
  | 'resenas-estilista' | 'notificacion-estilista' | 'perfil-estilista'
  | 'horario-estilista' | 'agendar-walkin'
  | 'cambio-password' | 'recuperar-password';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LoginComponent, RegistroComponent, HomeComponent, PerfilComponent,
    ServiciosComponent, ReservarComponent, PromocionesComponent,
    VerCitaComponent, RecompensasComponent, ResenasComponent,
    PantallaAdminComponent, PantallaEstilistaComponent, EmpleadosAdminComponent,
    ServiciosAdminComponent, GestionCitasAdminComponent, PromocionesAdminComponent,
    ReportesAdminComponent, NotificacionesAdminComponent, CitasEstilistaComponent,
    DetalleCitasComponent, ResenasEstilistaComponent, NotificacionEstilistaComponent,
    PerfilEstilistaComponent, EstilistaHorarioComponent, HorariosAdministradorComponent,
    RecompensasAdminComponent, CambioContrasenaComponent, RecuperarContrasenaComponent,
    DiasEspecialesAdminComponent, AgendarWalkinComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

  // ══════════════════════════════════════════════════════════════════
  // vistaActual — propiedad central de toda la navegación.
  // El template usa *ngIf="vistaActual === 'nombre'" para decidir
  // qué componente se renderiza. Solo uno está visible en cualquier
  // momento dado. No hay Angular Router ni URLs distintas por pantalla.
  // ══════════════════════════════════════════════════════════════════
  vistaActual: VistaActual = 'login';

  // Datos que se pasan al componente reservar cuando viene desde
  // servicios.ts (servicioFijo), promociones.ts (promoActiva)
  // o ver-cita.ts en modo edición (citaAEditar).
  servicioPreseleccionado = '';
  esPromocion             = false;
  citaAEditar: any        = null;
  // promoActiva contiene el objeto completo de la promo seleccionada
  // (id, titulo, servicio_id, servicio_nombre, precio_especial, etc.)
  // Se pasa como @Input a reservar.ts para que pueda preseleccionar
  // el servicio, mostrar el banner y usar el precio especial.
  promoActiva: any        = null;

  // ══════════════════════════════════════════════════════════════════
  // onNavigate — punto único de entrada para toda la navegación.
  // Recibe un string desde cualquier componente hijo (vía @Output) y
  // lo traduce al tipo VistaActual correcto usando un mapa de aliases.
  //
  // El mapa existe porque los componentes emiten nombres propios
  // (por ej. 'recompensas-admin') que no siempre coinciden exactamente
  // con el tipo interno ('recompensa-admin'). Centralizar la traducción
  // aquí evita bugs por typos repartidos en múltiples componentes.
  // ══════════════════════════════════════════════════════════════════
  onNavigate(section: string): void {
    const mapa: Record<string, VistaActual> = {
      login: 'login', registro: 'registro', home: 'home',
      perfil: 'perfil', servicios: 'servicios', reservar: 'reservar',
      promociones: 'promociones', ver: 'ver-cita', 'ver-cita': 'ver-cita',
      recompensas: 'recompensas', resenas: 'resenas',

      admin: 'admin',
      'empleados-admin':        'empleados-admin',
      'gestion-citas-admin':    'gestion-citas-admin',
      'notificaciones-admin':   'notificaciones-admin',
      'promociones-admin':      'promociones-admin',
      'servicios-admin':        'servicios-admin',
      'recompensas-admin':      'recompensa-admin',
      'recomensa-admin':        'recompensa-admin',    // alias por si viene con typo
      'horarios-administrador': 'horarios-administrador',
      'horario-administrador':  'horarios-administrador',
      'blog-admin':             'blog-admin',
      'dias-especiales-admin':  'dias-especiales-admin',

      estilista:                  'estilista',
      'citas-estilista':          'citas-estilista',
      'detalle-citas':            'detalle-citas',
      'resenas-estilista':        'resenas-estilista',
      'notificacion-estilista':   'notificacion-estilista',
      'notificaciones-estilista': 'notificacion-estilista', // alias con 's'
      'perfil-estilista':         'perfil-estilista',
      'horario-estilista':        'horario-estilista',
      'agendar-walkin':           'agendar-walkin',

      'cambio-password':    'cambio-password',
      'recuperar-password': 'recuperar-password'
    };

    const destino = mapa[section];
    if (!destino) {
      console.warn('Vista no reconocida:', section);
      return;
    }

    this.vistaActual = destino;

    // Si el usuario navega a cualquier pantalla que no sea reservar,
    // limpiamos el estado de reserva para no contaminar la próxima visita.
    if (destino !== 'reservar') {
      this.resetReserva();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // AUTENTICACIÓN Y ROLES
  //
  // La lógica de roles no vive en guards de Angular sino en los
  // eventos que emite login.ts después de recibir la respuesta del backend.
  // Cada rol tiene su propio evento (@Output) y app.html los mapea
  // a métodos distintos de este componente.
  //
  // La seguridad real está en el backend: aunque alguien cambiara
  // vistaActual desde la consola, sin token válido todas las peticiones
  // devolverían 401 o 403 y la pantalla quedaría vacía o con error.
  // ══════════════════════════════════════════════════════════════════

  goToRegister(): void {
    this.vistaActual = 'registro';
  }

  goToLogin(): void {
    this.vistaActual = 'login';
    this.resetReserva();
  }

  onLogout(): void {
    // Eliminar el token y los datos del usuario del navegador.
    // El token sigue siendo válido en el servidor hasta que expire (7 días),
    // pero sin él en sessionStorage el frontend no puede adjuntarlo a peticiones.
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    this.vistaActual = 'login';
    this.resetReserva();
  }

  // Se llama cuando login.ts detecta requiere_cambio = 1 en la respuesta.
  // Aplica tanto para estilistas nuevos (contraseña asignada por el admin)
  // como para clientes que usaron la contraseña temporal de recuperación.
  irACambioPasswordObligatorio(): void {
    this.vistaActual = 'cambio-password';
  }

  // Se llama cuando cambio-contrasena.ts confirma que el PATCH fue exitoso.
  // Lee el rol del sessionStorage para saber a qué panel llevar al usuario,
  // porque en este punto ya no tenemos acceso directo a la respuesta del login.
  completarCambioPassword(): void {
    const userStr = sessionStorage.getItem('usuario');
    if (userStr) {
      const user = JSON.parse(userStr);
      const rol  = user.rol;

      if (rol === 'estilista') {
        this.vistaActual = 'estilista';
      } else if (rol === 'admin') {
        this.vistaActual = 'admin';
      } else {
        this.vistaActual = 'home';
      }
    } else {
      // Si por alguna razón el sessionStorage quedó vacío, mandamos al login
      this.vistaActual = 'login';
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // FLUJO DE RESERVAS
  //
  // El componente reservar.ts puede iniciarse de tres formas distintas
  // y necesita contexto diferente en cada caso. app.ts actúa de puente
  // guardando ese contexto y pasándolo como @Input a reservar.ts.
  // ══════════════════════════════════════════════════════════════════

  // Desde servicios.ts: solo pasa el nombre del servicio.
  onServiceSelected(servicio: string, dePromo: boolean = false): void {
    this.servicioPreseleccionado = servicio;
    this.esPromocion             = dePromo;
    this.citaAEditar             = null;
    this.promoActiva             = null;
    this.vistaActual             = 'reservar';
  }

  // Desde promociones.ts: pasa el objeto completo de la promo.
  // reservar.ts lo usa para preseleccionar el servicio, mostrar el precio
  // especial y enviar promo_id al backend al confirmar la cita.
  onPromoSelected(promo: any): void {
    this.promoActiva             = promo;
    this.servicioPreseleccionado = '';   // reservar.ts tomará el servicio del promo
    this.esPromocion             = true;
    this.citaAEditar             = null;
    this.vistaActual             = 'reservar';
  }

  // Desde ver-cita.ts cuando el cliente quiere modificar una cita existente.
  // citaAEditar lleva los datos de la cita actual para pre-rellenar el formulario.
  onModificarCita(cita: any): void {
    this.citaAEditar             = cita;
    this.servicioPreseleccionado = cita?.servicio ?? '';
    this.esPromocion             = false;
    this.vistaActual             = 'reservar';
  }

  private resetReserva(): void {
    this.servicioPreseleccionado = '';
    this.esPromocion             = false;
    this.citaAEditar             = null;
    this.promoActiva             = null;
  }
}
