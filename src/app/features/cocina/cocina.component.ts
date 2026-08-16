import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Pedido } from '../../core/models/pedido.model';
import { PedidosService } from '../../core/services/pedidos.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-cocina',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './cocina.component.html',
  styleUrl: './cocina.component.scss',
})
export class CocinaComponent implements OnInit, OnDestroy {
  private pedidosService = inject(PedidosService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  pedidos: Pedido[] = [];
  isLoading = true;
  errorMessage: string | null = null;
  updatingPedidoId: string | null = null;

  // Canal Realtime de Supabase
  private realtimeChannel: RealtimeChannel | null = null;
  private timeUpdateInterval: any = null;

  // Estado del Menú Móvil Hamburguesa
  isMobileMenuOpen = false;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  async ngOnInit(): Promise<void> {
    await this.loadPedidos();
    this.setupRealtimeSubscription();

    // Actualizar los contadores de tiempo transcurrido cada 30 segundos
    this.timeUpdateInterval = setInterval(() => {
      this.cdr.detectChanges();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.realtimeChannel) {
      this.supabaseService.client.removeChannel(this.realtimeChannel);
    }
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  async loadPedidos(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.pedidosService.getPedidosActivos();
      if (error) {
        this.errorMessage = error.message || 'Error al cargar los pedidos de cocina.';
      } else {
        this.pedidos = data || [];
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al conectar con el servidor.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private setupRealtimeSubscription(): void {
    // Suscribirse a inserciones, actualizaciones y eliminaciones en la tabla 'pedidos'
    this.realtimeChannel = this.supabaseService.client
      .channel('kds-pedidos-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        async () => {
          // Recargar silenciosamente los pedidos al detectar cualquier cambio
          const { data } = await this.pedidosService.getPedidosActivos();
          if (data) {
            this.pedidos = data;
            this.cdr.detectChanges();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'detalles_pedido' },
        async () => {
          const { data } = await this.pedidosService.getPedidosActivos();
          if (data) {
            this.pedidos = data;
            this.cdr.detectChanges();
          }
        }
      )
      .subscribe();
  }

  // --- Filtros para el Tablero Kanban ---
  get pedidosRecibidos(): Pedido[] {
    return this.pedidos.filter(
      (p) => (p.estado || '').toUpperCase() === 'RECIBIDO'
    );
  }

  get pedidosEnPreparacion(): Pedido[] {
    return this.pedidos.filter((p) =>
      ['PREPARANDO', 'EN PREPARACION', 'EN_PREPARACION', 'PREPARACION'].includes(
        (p.estado || '').toUpperCase()
      )
    );
  }

  get pedidosListos(): Pedido[] {
    return this.pedidos.filter(
      (p) => (p.estado || '').toUpperCase() === 'LISTO'
    );
  }

  // --- Transiciones de Estado ---
  async cambiarEstado(pedido: Pedido, nuevoEstado: string): Promise<void> {
    this.updatingPedidoId = pedido.id;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { error } = await this.pedidosService.cambiarEstadoPedido(
        pedido.id,
        nuevoEstado
      );

      if (error) {
        this.errorMessage = error.message || 'No se pudo actualizar el estado del pedido.';
      } else {
        if (nuevoEstado === 'FINALIZADO') {
          this.pedidos = this.pedidos.filter((p) => p.id !== pedido.id);
        } else {
          pedido.estado = nuevoEstado;
        }
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al actualizar el pedido.';
    } finally {
      this.updatingPedidoId = null;
      this.cdr.detectChanges();
    }
  }

  // --- Utilidades de Tiempo ---
  calcularMinutosTranscurridos(fechaStr: string): number {
    if (!fechaStr) return 0;
    const fechaPedido = new Date(fechaStr).getTime();
    const ahora = new Date().getTime();
    const diffMs = ahora - fechaPedido;
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  }

  formatearTiempoTranscurrido(fechaStr: string): string {
    const minutos = this.calcularMinutosTranscurridos(fechaStr);
    if (minutos < 1) return 'Hace un momento';
    if (minutos < 60) return `Hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const minsRestantes = minutos % 60;
    return `Hace ${horas}h ${minsRestantes}m`;
  }

  getClaseAlertaTiempo(fechaStr: string): string {
    const minutos = this.calcularMinutosTranscurridos(fechaStr);
    if (minutos >= 20) {
      return 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse font-extrabold';
    }
    if (minutos >= 10) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
    }
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-semibold';
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
