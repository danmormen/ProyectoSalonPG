import { Component, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [CommonModule],
  
  templateUrl: './blog.html',
  styleUrl: './blog.css'
})
export class BlogComponent {

  @Output() backToHome = new EventEmitter<void>();

  // Variable para almacenar el artículo que se mostrará en el pop-up
  selectedPost: any = null;

  posts = [
    {
      title: 'Tendencias en Nail Art',
      author: 'Admin',
      date: '19/03/2026',
      tag: 'Manicure',
      img: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600',
      content: 'El nail art evoluciona con mezclas de minimalismo y audacia. Los diseños geométricos con líneas finas metalizadas lideran las tendencias actuales. Esta temporada, los acabados mate combinados con detalles brillantes son el "must-have" en cualquier salón de prestigio.'
    },
    {
      title: 'Mantenimiento del Francés',
      author: 'Admin',
      date: '17/03/2026',
      tag: 'Cuidados',
      img: 'https://images.pexels.com/photos/3997381/pexels-photo-3997381.jpeg?auto=compress&cs=tinysrgb&w=600',
      content: 'El manicure francés requiere disciplina para evitar el desgaste. El secreto es una base niveladora de alta calidad y aplicar protector cada tres días. Además, el uso de aceites para cutícula diariamente ayuda a mantener el brillo y la flexibilidad de la uña por mucho más tiempo.'
    }
  ];

  constructor(private router: Router) {}

 
  abrirArticulo(post: any) {
    this.selectedPost = post;
  
    document.body.style.overflow = 'hidden';
  }

  cerrarModal() {
    this.selectedPost = null;
  
    document.body.style.overflow = 'auto';
  }

  
  regresar() {
    console.log('Regresando al panel...');
    
    if (this.selectedPost) {
      this.cerrarModal();
    }
    this.backToHome.emit(); 
  }

  
//Redirige al usuario a la pantalla de login
   
  cerrarSesion() {
    this.router.navigate(['/login']);
  }
}