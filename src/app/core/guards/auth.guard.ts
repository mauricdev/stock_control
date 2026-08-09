import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, from, map, of } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';

export const authGuard: CanActivateFn = (_route, _state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  return from(supabaseService.getSession()).pipe(
    map((session) => {
      if (session) {
        return true;
      }
      return router.createUrlTree(['/login']);
    }),
    catchError(() => {
      return of(router.createUrlTree(['/login']));
    })
  );
};

export const unauthGuard: CanActivateFn = (_route, _state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  return from(supabaseService.getSession()).pipe(
    map((session) => {
      if (session) {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    }),
    catchError(() => {
      return of(true);
    })
  );
};
