import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CartItem {
  id: string;
  nombre: string;
  precio_venta: number;
  categoria?: string;
  cantidad: number;
  receta_producto?: any[];
  modificadores?: string;
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
   * 3. Registra el pedido en la tabla pedidos (KDS/POS).
   * 4. Registra los detalles del pedido en detalles_pedido con sus modificadores.
   * @param carrito Array de productos seleccionados en el POS con su cantidad, receta y modificadores
   * @param nombreCliente Nombre opcional del cliente asignado a la comanda
   */
  async procesarVenta(
    carrito: CartItem[],
    nombreCliente: string = ''
  ): Promise<{ success: boolean; error: any; pedido?: any }> {
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

      // 3. Insertar en tabla 'pedidos' (para KDS y seguimiento)
      const totalVenta = carrito.reduce(
        (sum, item) => sum + Number(item.cantidad) * Number(item.precio_venta || 0),
        0
      );

      const { data: pedidoCreado, error: pedidoError } = await this.supabaseService.client
        .from('pedidos')
        .insert([
          {
            estado: 'RECIBIDO',
            origen: 'POS',
            total: totalVenta,
            nombre_cliente: nombreCliente?.trim() || null,
          },
        ])
        .select();

      if (pedidoError || !pedidoCreado || pedidoCreado.length === 0) {
        console.error('Error al registrar pedido en Supabase:', pedidoError);
        return {
          success: false,
          error: pedidoError || new Error('No se pudo registrar el pedido en la base de datos.'),
        };
      }

      const pedidoId = pedidoCreado[0].id;

      // 4. Insertar en tabla 'detalles_pedido'
      const detallesPayload = carrito.map((item) => ({
        pedido_id: pedidoId,
        producto_id: item.id,
        cantidad: Number(item.cantidad),
        modificadores_seleccionados: item.modificadores ? item.modificadores.trim() : null,
        subtotal: Number(item.cantidad) * Number(item.precio_venta || 0),
      }));

      const { error: detallesError } = await this.supabaseService.client
        .from('detalles_pedido')
        .insert(detallesPayload);

      if (detallesError) {
        console.error('Error al registrar detalles del pedido:', detallesError);
        return { success: false, error: detallesError };
      }

      // 5. Registrar las transacciones en movimientos_inventario vinculando el pedido_id
      const movimientosPayload = carrito.map((item) => ({
        tipo: 'VENTA',
        referencia_id: item.id,
        pedido_id: pedidoId,
        total_transaccion: Number(item.cantidad) * Number(item.precio_venta || 0),
      }));

      const { error: movimientosError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .insert(movimientosPayload);

      if (movimientosError) {
        console.warn('Advertencia al insertar movimientos de venta:', movimientosError.message);
      }

      return { success: true, error: null, pedido: pedidoCreado[0] };
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
   * 1. Consulta pedido_id y total_transaccion del movimiento a anular.
   * 2. Si existe un pedido_id vinculado, actualiza su estado a 'FINALIZADO' en la tabla 'pedidos'
   *    para remover instantáneamente la comanda de la pantalla KDS de la cocina mediante Realtime.
   * 3. Obtiene la receta del producto (receta_producto) e incrementa el stock_actual en insumos_base.
   * 4. Una vez devuelto el stock, elimina el registro en movimientos_inventario.
   */
  async anularVenta(movimientoId: string, productoId: string): Promise<{ success: boolean; error: any }> {
    try {
      // Paso 1: Consultar el movimiento de venta para obtener total_transaccion y pedido_id vinculado
      const { data: movimientoData, error: movFetchError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('total_transaccion, pedido_id')
        .eq('id', movimientoId)
        .single();

      if (movFetchError) {
        return { success: false, error: movFetchError };
      }

      // Paso 2: Si tiene un pedido_id vinculado, marcarlo como 'FINALIZADO' (o eliminarlo)
      // para que el Realtime lo elimine del KDS al instante
      if (movimientoData?.pedido_id) {
        const { error: pedidoUpdateError } = await this.supabaseService.client
          .from('pedidos')
          .update({ estado: 'FINALIZADO' })
          .eq('id', movimientoData.pedido_id);

        if (pedidoUpdateError) {
          console.warn(`Advertencia al finalizar comanda KDS (${movimientoData.pedido_id}):`, pedidoUpdateError.message);
        }
      }

      // Paso 3: Obtener la receta del producto (receta_producto)
      const { data: receta, error: recetaError } = await this.supabaseService.client
        .from('receta_producto')
        .select('insumo_id, cantidad_requerida')
        .eq('producto_id', productoId);

      if (recetaError) {
        return { success: false, error: recetaError };
      }

      const { data: productoData } = await this.supabaseService.client
        .from('productos_finales')
        .select('precio_venta')
        .eq('id', productoId)
        .single();

      let factorCantidad = 1;
      if (movimientoData?.total_transaccion && productoData?.precio_venta && productoData.precio_venta > 0) {
        factorCantidad = Math.max(1, Math.round(movimientoData.total_transaccion / productoData.precio_venta));
      }

      // Paso 4: Devolver insumos al inventario (insumos_base)
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

        await Promise.all(updatePromises);
      }

      // Paso 5: Eliminar el registro del movimiento de venta
      const { error: deleteError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .delete()
        .eq('id', movimientoId);

      if (deleteError) {
        return { success: false, error: deleteError };
      }

      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err };
    }
  }
}
