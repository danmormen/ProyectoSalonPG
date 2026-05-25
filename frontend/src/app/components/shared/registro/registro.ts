import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http'; 
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro.html',
  styleUrls: ['./registro.css']
})
export class RegistroComponent {
  @Output() onNavigate = new EventEmitter<string>();

  nombre:          string  = '';
  apellido:        string  = '';
  email:           string  = '';
  pass:            string  = '';
  fechaNacimiento: string  = '';
  telefonoDisplay: string  = '';
  mostrarPass:     boolean = false;
  cargando:        boolean = false;

  constructor(private http: HttpClient) {}

  // Formatea el teléfono como xxxx-xxxx mientras el usuario escribe
  onTelInput(event: any) {
    let digits = event.target.value.replace(/\D/g, '').substring(0, 8);
    this.telefonoDisplay = digits.length > 4
      ? digits.substring(0, 4) + '-' + digits.substring(4)
      : digits;
    event.target.value = this.telefonoDisplay;
  }

  // Bloquea cualquier tecla que no sea un dígito (0-9) en el campo de fecha.
  // charCode < 31 son teclas de control (Enter, Backspace, etc.) que sí dejamos pasar.
  validarSoloNumeros(event: KeyboardEvent) {
    const charCode = event.which ? event.which : event.keyCode;
    if (charCode > 31 && (charCode < 48 || charCode > 57)) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  // Formatea la fecha automáticamente mientras el usuario escribe.
  // El usuario teclea solo números; el componente inserta las barras.
  // Ejemplo: "01022000" → "01/02/2000"
  // Se usa replace(/\D/g,'') primero para limpiar si el usuario pegó texto con barras.
  formatearFecha(event: any) {
    let input = event.target.value.replace(/\D/g, '');
    let formatted = '';

    if (input.length > 0) {
      formatted = input.substring(0, 2);
      if (input.length > 2) {
        formatted += '/' + input.substring(2, 4);
        if (input.length > 4) {
          formatted += '/' + input.substring(4, 8);
        }
      }
    }
    this.fechaNacimiento = formatted;
  }

  registrar() {
    // La fecha debe tener exactamente 10 caracteres (DD/MM/AAAA)
    if (this.fechaNacimiento.length < 10) {
      alert('Por favor, ingresa la fecha completa (DD/MM/AAAA)');
      return;
    }

    const [dia, mes, anio] = this.fechaNacimiento.split('/').map(Number);

    if (dia < 1 || dia > 31) { alert('Día inválido (01-31)'); return; }
    if (mes < 1 || mes > 12) { alert('Mes inválido (01-12)'); return; }

    // Validación de mayoría de edad: año > 2008 implica menos de 18 años (aprox.).
    // Es una validación rápida por año, no exacta por día/mes — el backend puede
    // hacer la validación precisa si se necesita.
    if (anio > 2008) {
      alert('Debes ser mayor de 18 años para registrarte.');
      return;
    }
    if (anio < 1920) {
      alert('Por favor, ingresa un año de nacimiento realista.');
      return;
    }

    const telefonoDigits = this.telefonoDisplay.replace(/\D/g, '');
    if (telefonoDigits.length !== 8) {
      alert('Por favor, ingresa un número de teléfono válido de 8 dígitos.');
      return;
    }

    if (this.nombre && this.apellido && this.email && this.pass) {

      this.cargando = true;

      const datosRegistro = {
        nombre:          this.nombre,
        apellido:        this.apellido,
        email:           this.email,
        password:        this.pass,
        fechaNacimiento: this.fechaNacimiento,
        telefono:        telefonoDigits
      };

      this.http.post(`${environment.apiUrl}/api/auth/registro`, datosRegistro)
        .subscribe({
          next: (respuesta: any) => {
            this.cargando = false;
            if (respuesta.token) {
              sessionStorage.setItem('token', respuesta.token);
            }
            alert('¡Cuenta creada con éxito!');
            this.onNavigate.emit('login');
          },
          error: (errorRes) => {
            this.cargando = false;
            if (errorRes.error && errorRes.error.errores) {
              const mensajes = errorRes.error.errores.map((e: any) => e.msg).join('\n');
              alert('Revisa tus datos:\n' + mensajes);
            } else if (errorRes.error && errorRes.error.message) {
              alert('Error: ' + errorRes.error.message);
            } else {
              alert('Ocurrió un error de conexión con el servidor. Verifica que el backend esté corriendo.');
            }
          }
        });

    } else {
      alert('Por favor, completa todos los campos.');
    }
  }

  irALogin() {
    this.onNavigate.emit('login');
  }
}