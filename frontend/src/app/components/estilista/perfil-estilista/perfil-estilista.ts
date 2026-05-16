import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EstilistaNavbarComponent } from '../estilista-navbar/estilista-navbar';

@Component({
  selector: 'app-perfil-estilista',
  standalone: true,
  imports: [CommonModule, FormsModule, EstilistaNavbarComponent],
  templateUrl: './perfil-estilista.html',
  styleUrls: ['./perfil-estilista.css']
})
export class PerfilEstilistaComponent {
  @Output() navigate = new EventEmitter<string>();
  @Output() logout = new EventEmitter<void>();

  estilista = {
    nombre: 'Carolina Hernández',
    puesto: 'Estilista Senior',
    calificacion: 4.8,
    citasCompletadas: 147,
    resenas: 98,
    email: 'carolina.hernandez@ponteguapa.com',
    telefono: '+502 5555-1234',
    especialidades: ['Corte', 'Coloración', 'Tratamiento Facial'],
    fechaIngreso: '14 de enero de 2024',
    fechaCumpleanos: '1992-05-15' 
  };

  editandoTelefono: boolean = false;
  nuevoTelefono: string = '';

  activarEdicion() {
    this.nuevoTelefono = this.estilista.telefono;
    this.editandoTelefono = true;
  }

  guardarTelefono() {
    this.estilista.telefono = this.nuevoTelefono;
    this.editandoTelefono = false;
  }

  onNavigate(dest: string) { this.navigate.emit(dest); }
  onLogout() { this.logout.emit(); }
}