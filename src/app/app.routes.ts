import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'insumos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/insumos/insumos-list/insumos-list.component').then(
        (m) => m.InsumosListComponent
      ),
  },
  {
    path: 'productos',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/productos/productos-list/productos-list.component'
      ).then((m) => m.ProductosListComponent),
  },
  {
    path: 'pos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/pos/pos.component').then((m) => m.PosComponent),
  },
  {
    path: 'historial-ventas',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/ventas/ventas-historial/ventas-historial.component'
      ).then((m) => m.VentasHistorialComponent),
  },
  {
    path: 'mermas',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        './features/mermas/mermas-historial/mermas-historial.component'
      ).then((m) => m.MermasHistorialComponent),
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
