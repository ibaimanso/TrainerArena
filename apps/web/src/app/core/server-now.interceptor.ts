import { HttpEvent, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ServerTimeService } from './server-time.service';

export function serverNowInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const serverTime = inject(ServerTimeService);
  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        const serverNow = event.headers.get('X-Server-Now');
        if (serverNow) serverTime.calibrate(serverNow);
      }
    })
  );
}
