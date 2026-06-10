import { HttpErrorResponse } from '@angular/common/http';

/** Extracts the server's Spanish message (string or class-validator array). */
export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message: unknown = error.error?.message;
    if (Array.isArray(message) && message.length > 0) return String(message[0]);
    if (typeof message === 'string' && message) return message;
    if (error.status === 0) return 'No se pudo conectar con el servidor.';
  }
  return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
}
