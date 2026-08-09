import { inject, Injectable } from '@angular/core';
import { InsumoBase } from '../models/insumo.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class InsumosService {
  private supabaseService = inject(SupabaseService);
  private tableName = 'insumos_base';

  /**
   * Obtiene la lista completa de insumos base registrados en Supabase.
   */
  async getInsumos(): Promise<{ data: InsumoBase[] | null; error: any }> {
    const { data, error } = await this.supabaseService.client
      .from(this.tableName)
      .select('*')
      .order('nombre', { ascending: true });

    return { data: data as InsumoBase[] | null, error };
  }

  /**
   * Agrega un nuevo insumo base a la tabla insumos_base.
   */
  async addInsumo(
    insumoData: any
  ): Promise<{ data: InsumoBase[] | null; error: any }> {
    const payload = {
      nombre: insumoData.nombre,
      unidad_medida: insumoData.unidad_medida,
      stock_actual: Number(insumoData.stock_actual),
      costo_promedio_unidad: Number(insumoData.costo_promedio_unidad),
      stock_minimo: Number(insumoData.stock_minimo),
    };

    const { data, error } = await this.supabaseService.client
      .from(this.tableName)
      .insert([payload])
      .select();

    return { data: data as InsumoBase[] | null, error };
  }

  /**
   * Actualiza los datos de un insumo base existente en la tabla insumos_base.
   */
  async updateInsumo(
    id: string,
    insumoData: any
  ): Promise<{ data: InsumoBase[] | null; error: any }> {
    const payload = {
      nombre: insumoData.nombre,
      unidad_medida: insumoData.unidad_medida,
      stock_actual: Number(insumoData.stock_actual),
      costo_promedio_unidad: Number(insumoData.costo_promedio_unidad),
      stock_minimo: Number(insumoData.stock_minimo),
    };

    const { data, error } = await this.supabaseService.client
      .from(this.tableName)
      .update(payload)
      .eq('id', id)
      .select();

    return { data: data as InsumoBase[] | null, error };
  }

  /**
   * Elimina un insumo base por su ID de la tabla insumos_base.
   */
  async deleteInsumo(id: string): Promise<{ data: any; error: any }> {
    const { data, error } = await this.supabaseService.client
      .from(this.tableName)
      .delete()
      .eq('id', id);

    return { data, error };
  }

  /**
   * Registra la compra de un insumo base:
   * 1. Suma la cantidad comprada al stock actual.
   * 2. Recalcula el costo promedio ponderado de la unidad: (ValorInventarioAnterior + CostoCompra) / NuevoStock.
   * 3. Actualiza insumos_base y registra la transacción de tipo 'COMPRA' en movimientos_inventario.
   */
  async registrarCompraInsumo(
    insumo: InsumoBase,
    cantidadComprada: number,
    costoCompra: number
  ): Promise<{ data: any; error: any }> {
    try {
      const stockActual = Number(insumo.stock_actual || 0);
      const costoPromedioAnterior = Number(insumo.costo_promedio_unidad || 0);

      const nuevoStock = stockActual + cantidadComprada;
      const valorInventarioAnterior = stockActual * costoPromedioAnterior;
      const nuevoCostoPromedio =
        nuevoStock > 0 ? (valorInventarioAnterior + costoCompra) / nuevoStock : costoPromedioAnterior;

      // 1. Actualizar insumos_base
      const { data, error: updateError } = await this.supabaseService.client
        .from(this.tableName)
        .update({
          stock_actual: nuevoStock,
          costo_promedio_unidad: nuevoCostoPromedio,
        })
        .eq('id', insumo.id)
        .select();

      if (updateError) {
        return { data: null, error: updateError };
      }

      // 2. Registrar la transacción en movimientos_inventario
      try {
        const { error: movError } = await this.supabaseService.client
          .from('movimientos_inventario')
          .insert([
            {
              tipo: 'COMPRA',
              referencia_id: insumo.id,
              total_transaccion: cantidadComprada,
            },
          ]);

        if (movError) {
          console.warn('Advertencia al registrar movimiento de compra:', movError.message);
        }
      } catch (e) {
        console.warn('Nota: Excepción al insertar movimiento de compra:', e);
      }

      return { data: { nuevoStock, nuevoCostoPromedio }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Registra una merma (pérdida de inventario) para un insumo específico.
   * Descuenta la cantidad del stock actual y guarda el registro en el historial.
   */
  async registrarMerma(
    insumoId: string,
    cantidadPerdida: number,
    stockActual: number
  ): Promise<{ data: any; error: any }> {
    const nuevoStock = Math.max(0, stockActual - cantidadPerdida);

    // 1. Actualizar el stock actual en la tabla insumos_base
    const { data, error } = await this.supabaseService.client
      .from(this.tableName)
      .update({ stock_actual: nuevoStock })
      .eq('id', insumoId)
      .select();

    if (error) {
      return { data: null, error };
    }

    // 2. Registrar la transacción en movimientos_inventario (referencia_id y total_transaccion)
    try {
      const { error: historialError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .insert([
          {
            tipo: 'MERMA',
            referencia_id: insumoId,
            total_transaccion: cantidadPerdida,
          },
        ]);

      if (historialError) {
        console.warn('Advertencia al registrar en movimientos_inventario:', historialError.message);
      }
    } catch (e) {
      console.warn('Nota: Excepción al insertar en movimientos_inventario:', e);
    }

    return { data, error: null };
  }

  /**
   * Obtiene la lista de movimientos de tipo MERMA y mapea la información
   * del insumo base sin requerir una clave foránea explícita en Supabase (evitando errores de schema cache).
   */
  async getHistorialMermas(): Promise<{ data: any[] | null; error: any }> {
    try {
      // 1. Consultar todos los movimientos de tipo MERMA ordenados por fecha descendente
      const { data: mermas, error: mermasError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('*')
        .eq('tipo', 'MERMA')
        .order('fecha', { ascending: false });

      if (mermasError) {
        return { data: null, error: mermasError };
      }

      if (!mermas || mermas.length === 0) {
        return { data: [], error: null };
      }

      // 2. Obtener IDs únicos de los insumos vinculados
      const insumoIds = Array.from(
        new Set(mermas.map((m: any) => m.referencia_id).filter(Boolean))
      );

      // 3. Consultar los nombres y unidades de los insumos_base
      const { data: insumos, error: insumosError } = await this.supabaseService.client
        .from('insumos_base')
        .select('id, nombre, unidad_medida, costo_promedio_unidad')
        .in('id', insumoIds);

      if (insumosError) {
        console.warn('Advertencia al consultar datos de insumos para mermas:', insumosError.message);
      }

      const insumoMap = new Map<string, { id: string; nombre: string; unidad_medida: string; costo_promedio_unidad: number }>();
      if (insumos) {
        for (const ins of insumos) {
          insumoMap.set(ins.id, ins);
        }
      }

      // 4. Cruzar en memoria los datos del insumo y aplanar propiedades para el template
      const mermasConInsumo = mermas.map((m: any) => {
        const insumo = insumoMap.get(m.referencia_id);
        // Formatear fecha local
        const fechaLocal = m.fecha ? new Date(m.fecha) : null;
        const fechaFormateada = fechaLocal
          ? fechaLocal.toLocaleString('es-CL', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })
          : 'Sin fecha';

        return {
          ...m,
          insumos_base: insumo || null,
          insumo_nombre: insumo?.nombre || 'Insumo desconocido',
          insumo_unidad: insumo?.unidad_medida || '',
          insumo_costo_unitario: insumo?.costo_promedio_unidad || 0,
          fechaLocalFormatted: fechaFormateada,
        };
      });

      return { data: mermasConInsumo, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Anula un registro de merma previo:
   * 1. Consulta el stock_actual del insumo usando maybeSingle() para prevenir errores 406 si el insumo fue eliminado.
   * 2. Si el insumo existe, le devuelve la cantidad restada por error al stock actual.
   * 3. Elimina el movimiento de merma de la tabla movimientos_inventario para limpiar el registro histórico o huérfano.
   */
  async anularMerma(
    movimientoId: string,
    insumoId: string,
    cantidadADevolver: number
  ): Promise<{ data: any; error: any }> {
    try {
      // 1. Obtener el stock actual del insumo usando maybeSingle()
      const { data: insumoData, error: insumoError } = await this.supabaseService.client
        .from('insumos_base')
        .select('stock_actual')
        .eq('id', insumoId)
        .maybeSingle();

      if (insumoError) {
        return { data: null, error: insumoError };
      }

      // Si el insumo existe en bodega, actualizar stock devolviendo la cantidad mermada
      if (insumoData) {
        const stockActual = Number(insumoData.stock_actual || 0);
        const nuevoStock = stockActual + Number(cantidadADevolver);

        const { error: updateError } = await this.supabaseService.client
          .from('insumos_base')
          .update({ stock_actual: nuevoStock })
          .eq('id', insumoId);

        if (updateError) {
          return { data: null, error: updateError };
        }
      }

      // 2. Eliminar el registro de merma de movimientos_inventario (aplica para insumos activos o huérfanos)
      const { data: deleteData, error: deleteError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .delete()
        .eq('id', movimientoId);

      if (deleteError) {
        return { data: null, error: deleteError };
      }

      return { data: deleteData, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }
}