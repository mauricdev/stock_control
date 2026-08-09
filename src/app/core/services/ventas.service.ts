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
        const cantidadProducto = Number(item.cantidad || 0);
        if (cantidadProducto <= 0) {
          return { success: false, error: new Error('La cantidad vendida de cada producto debe ser mayor a 0.') };
        }
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

  /**
   * Obtiene el historial de ventas registradas en movimientos_inventario (tipo = 'VENTA')
   * haciendo un JOIN relacional con productos_finales(id, nombre) mediante referencia_id.
   * Ordena los registros por fecha descendente.
   */
  async getHistorialVentas(): Promise<{ data: any[] | null; error: any }> {
    try {
      // 1. Intento de JOIN directo en Supabase
      const { data, error } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('*, productos_finales:referencia_id (id, nombre)')
        .eq('tipo', 'VENTA')
        .order('fecha', { ascending: false });

      if (!error && data) {
        return { data, error: null };
      }

      // 2. Fallback por si la caché de esquema relacional no detecta FK explícita
      const { data: movimientos, error: movError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('*')
        .eq('tipo', 'VENTA')
        .order('fecha', { ascending: false });

      if (movError) {
        return { data: null, error: movError };
      }

      if (!movimientos || movimientos.length === 0) {
        return { data: [], error: null };
      }

      const productoIds = Array.from(
        new Set(movimientos.map((m: any) => m.referencia_id).filter(Boolean))
      );

      const { data: productos } = await this.supabaseService.client
        .from('productos_finales')
        .select('id, nombre')
        .in('id', productoIds);

      const prodMap = new Map<string, any>();
      if (productos) {
        for (const p of productos) {
          prodMap.set(p.id, p);
        }
      }

      const ventasConProducto = movimientos.map((m: any) => ({
        ...m,
        productos_finales: prodMap.get(m.referencia_id) || null,
      }));

      return { data: ventasConProducto, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Lógica Transaccional Compleja para Anular Venta:
   * a) Obtener la receta del producto (receta_producto) para saber qué insumos y en qué cantidades se usaron.
   * b) Iterar sobre cada ingrediente de la receta y hacer un UPDATE en la tabla insumos_base,
   *    sumando la cantidad_requerida al stock_actual para devolverlos a la bodega. (Usa Promise.all).
   * c) Una vez devuelto el stock, hacer un DELETE en movimientos_inventario eliminando el registro de la venta (movimientoId).
   * 
   * Maneja errores con try/catch para que, si falla la devolución de stock, no se borre la venta.
   */
  async anularVenta(movimientoId: string, productoId: string): Promise<{ success: boolean; error: any }> {
    try {
      // a) Obtener la receta del producto (receta_producto)
      const { data: receta, error: recetaError } = await this.supabaseService.client
        .from('receta_producto')
        .select('insumo_id, cantidad_requerida')
        .eq('producto_id', productoId);

      if (recetaError) {
        return { success: false, error: recetaError };
      }

      // Consultar movimiento y producto para determinar multiplicador de cantidad si aplica
      const { data: movimientoData } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('total_transaccion')
        .eq('id', movimientoId)
        .single();

      const { data: productoData } = await this.supabaseService.client
        .from('productos_finales')
        .select('precio_venta')
        .eq('id', productoId)
        .single();

      let factorCantidad = 1;
      if (movimientoData?.total_transaccion && productoData?.precio_venta && productoData.precio_venta > 0) {
        factorCantidad = Math.max(1, Math.round(movimientoData.total_transaccion / productoData.precio_venta));
      }

      // b) Iterar sobre cada ingrediente de la receta y hacer UPDATE en insumos_base sumando al stock_actual
      if (receta && receta.length > 0) {
        const updatePromises = receta.map(async (ingrediente) => {
          const insumoId = ingrediente.insumo_id;
          const cantidadSumar = Number(ingrediente.cantidad_requerida || 0) * factorCantidad;

          const { data: insumoData, error: fetchError } = await this.supabaseService.client
            .from('insumos_base')
            .select('stock_actual')
            .eq('id', insumoId)
            .single();

          if (fetchError || !insumoData) {
            throw fetchError || new Error(`No se pudo consultar el stock del insumo ${insumoId}`);
          }

          const stockActual = Number(insumoData.stock_actual || 0);
          const nuevoStock = stockActual + cantidadSumar;

          const { error: updateError } = await this.supabaseService.client
            .from('insumos_base')
            .update({ stock_actual: nuevoStock })
            .eq('id', insumoId);

          if (updateError) {
            throw updateError;
          }
        });

        // Procesar múltiples actualizaciones con Promise.all
        await Promise.all(updatePromises);
      }

      // c) Una vez devuelto el stock, eliminar el registro de la venta en movimientos_inventario
      const { error: deleteError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .delete()
        .eq('id', movimientoId);

      if (deleteError) {
        return { success: false, error: deleteError };
      }

      return { success: true, error: null };
    } catch (err: any) {
      // Si falla la devolución de stock, no se borra la venta
      return { success: false, error: err };
    }
  }
}
