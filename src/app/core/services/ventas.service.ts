import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CartItem {
  id: string;
  nombre: string;
  precio_venta: number;
  categoria?: string;
  cantidad: number;
  receta_producto?: any[];
}

@Injectable({
  providedIn: 'root',
})
export class VentasService {
  private supabaseService = inject(SupabaseService);

  /**
   * Procesa la venta del carrito:
   * 1. Descuenta el stock correspondiente en la tabla insumos_base por cada ingrediente consumido.
   * 2. Registra los movimientos de salida en la tabla movimientos_inventario (tipo 'VENTA').
   * @param carrito Array de productos seleccionados en el POS con su cantidad y receta
   */
  async procesarVenta(carrito: CartItem[]): Promise<{ success: boolean; error: any }> {
    if (!carrito || carrito.length === 0) {
      return { success: false, error: new Error('El carrito de compras está vacío.') };
    }

    try {
      // 1. Acumular el total gastado por cada insumo_id en toda la orden
      const descuentoPorInsumo = new Map<string, number>();

      for (const item of carrito) {
        const cantidadProducto = Number(item.cantidad || 1);
        const receta = item.receta_producto || [];

        for (const ingrediente of receta) {
          const insumoId = ingrediente.insumos_base?.id || ingrediente.insumo_id;
          const cantidadRequerida = Number(ingrediente.cantidad_requerida || 0);
          const totalInsumoConsumido = cantidadProducto * cantidadRequerida;

          if (insumoId) {
            const acumuladoPrevio = descuentoPorInsumo.get(insumoId) || 0;
            descuentoPorInsumo.set(insumoId, acumuladoPrevio + totalInsumoConsumido);
          }
        }
      }

      // 2. Descontar el stock en la tabla insumos_base para cada insumo involucrado
      for (const [insumoId, descuentoTotal] of descuentoPorInsumo.entries()) {
        // Consultar el stock actual en tiempo real
        const { data: insumoData, error: fetchError } = await this.supabaseService.client
          .from('insumos_base')
          .select('stock_actual')
          .eq('id', insumoId)
          .single();

        if (!fetchError && insumoData) {
          const stockActual = Number(insumoData.stock_actual || 0);
          const nuevoStock = Math.max(0, stockActual - descuentoTotal);

          const { error: updateError } = await this.supabaseService.client
            .from('insumos_base')
            .update({ stock_actual: nuevoStock })
            .eq('id', insumoId);

          if (updateError) {
            console.warn(`Error al actualizar stock del insumo ${insumoId}:`, updateError.message);
          }
        }
      }

      // 3. Registrar las transacciones en movimientos_inventario (tipo 'VENTA')
      const movimientosPayload = carrito.map((item) => ({
        tipo: 'VENTA',
        referencia_id: item.id,
        total_transaccion: Number(item.cantidad) * Number(item.precio_venta || 0),
      }));

      const { error: movimientosError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .insert(movimientosPayload);

      if (movimientosError) {
        console.warn('Advertencia al insertar movimientos de venta:', movimientosError.message);
      }

      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err };
    }
  }
}
