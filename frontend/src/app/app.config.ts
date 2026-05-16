// Configuración global de la aplicación Angular.
// provideHttpClient() registra HttpClient como servicio inyectable en toda la app.
// Sin esta línea todos los componentes que inyectan HttpClient fallan al arrancar.
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient()
  ]
};