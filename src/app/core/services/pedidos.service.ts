import { inject, Injectable } from '@angular/core';
import { Pedido } from '../models/pedido.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class PedidosService {
  private supabaseService = inject(SupabaseService);

  /**
   * Obtiene todos los pedidos activos (cuyo estado no sea 'FINALIZADO'),
   * ordenados por fecha ascendente (el más antiguo primero),
   * incluyendo los ítems de detalles_pedido y la información de los productos_finales.
   */
  async getPedidosActivos(): Promise<{ data: Pedido[] | null; error: any }> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('pedidos')
        .select('*, detalles_pedido(*, productos_finales(id, nombre, categoria))')
        .neq('estado', 'FINALIZADO')
        .order('fecha', { ascending: true });

      if (error) {
        return { data: null, error };
      }

      return { data: (data as Pedido[]) || [], error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Actualiza el estado de un pedido en la base de datos de Supabase.
   * @param id ID único del pedido (UUID)
   * @param nuevoEstado Nuevo estado (ej. 'RECIBIDO', 'PREPARANDO', 'LISTO', 'FINALIZADO')
   */
  async cambiarEstadoPedido(
    id: string,
    nuevoEstado: string
  ): Promise<{ data: any; error: any }> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('pedidos')
        .update({ estado: nuevoEstado })
        .eq('id', id)
        .select();

      return { data, error };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }
}
