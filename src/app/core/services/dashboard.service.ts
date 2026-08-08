import { inject, Injectable } from '@angular/core';
import { InsumoBase } from '../models/insumo.model';
import { SupabaseService } from './supabase.service';

export interface MovimientoConDetalle {
  id: string;
  tipo: 'VENTA' | 'MERMA';
  referencia_id: string;
  total_transaccion: number;
  fecha: string;
  created_at?: string;
  ingreso: number;
  egreso: number;
}

export interface ResumenDashboardCompleto {
  ingresosTotales: number;
  costoProduccionVentas: number;
  costoTotalMermas: number;
  egresosTotales: number;
  gananciaNeta: number;
  mermasCount: number;
  movimientos: MovimientoConDetalle[];
}

/**
 * Convierte un string de fecha timestamp de Supabase (UTC) a un objeto Date local del navegador.
 * Garantiza la adición de la zona horaria UTC ('Z') si Supabase retorna la fecha en formato sin sufijo.
 */
export function parseISOToLocalDate(fechaStr: string | null | undefined): Date {
  if (!fechaStr) return new Date();
  let normalized = fechaStr.trim();
  if (normalized.includes(' ') && !normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T');
  }
  if (!normalized.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }
  return new Date(normalized);
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private supabaseService = inject(SupabaseService);

  /**
   * Obtiene el resumen financiero avanzado filtrado por rango de fechas en UTC:
   * Convierte los objetos Date locales de fechaInicio y fechaFin a formato ISO UTC
   * para consultar la columna 'fecha' en Supabase con .gte() y .lte().
   */
  async getResumenDashboard(
    fechaInicio: Date,
    fechaFin: Date
  ): Promise<{ data: ResumenDashboardCompleto | null; error: any }> {
    try {
      // 1. Convertir límites locales del navegador a cadenas ISO en formato UTC para Supabase
      const isoInicio = fechaInicio.toISOString();
      const isoFin = fechaFin.toISOString();

      const { data: movimientos, error: movError } = await this.supabaseService.client
        .from('movimientos_inventario')
        .select('*')
        .gte('fecha', isoInicio)
        .lte('fecha', isoFin)
        .order('fecha', { ascending: true });

      if (movError) {
        return { data: null, error: movError };
      }

      // 2. Consultar productos finales con sus recetas para calcular costo de producción unitario
      const { data: productos } = await this.supabaseService.client
        .from('productos_finales')
        .select('*, receta_producto(cantidad_requerida, insumos_base(id, costo_promedio_unidad))');

      const costoProdUnitarioMap = new Map<string, number>();
      const precioVentaMap = new Map<string, number>();

      if (productos) {
        for (const prod of productos) {
          let costoProduccionUnitario = 0;
          if (prod.receta_producto && Array.isArray(prod.receta_producto)) {
            for (const item of prod.receta_producto) {
              const cant = Number(item.cantidad_requerida || 0);
              const costoIns = Number(item.insumos_base?.costo_promedio_unidad || 0);
              costoProduccionUnitario += cant * costoIns;
            }
          }
          costoProdUnitarioMap.set(prod.id, costoProduccionUnitario);
          precioVentaMap.set(prod.id, Number(prod.precio_venta || 0));
        }
      }

      // 3. Consultar insumos base para obtener el costo unitario de las mermas
      const { data: insumos } = await this.supabaseService.client
        .from('insumos_base')
        .select('id, costo_promedio_unidad');

      const insumoCostoMap = new Map<string, number>();
      if (insumos) {
        for (const ins of insumos) {
          insumoCostoMap.set(ins.id, Number(ins.costo_promedio_unidad || 0));
        }
      }

      // 4. Calcular métricas financieras
      let ingresosTotales = 0;
      let costoProduccionVentas = 0;
      let costoTotalMermas = 0;
      let mermasCount = 0;

      const movimientosProcesados: MovimientoConDetalle[] = [];

      if (movimientos) {
        for (const mov of movimientos) {
          let ingreso = 0;
          let egreso = 0;

          if (mov.tipo === 'VENTA') {
            ingreso = Number(mov.total_transaccion || 0);
            ingresosTotales += ingreso;

            const precioVenta = precioVentaMap.get(mov.referencia_id) || 0;
            const costoUnitario = costoProdUnitarioMap.get(mov.referencia_id) || 0;

            if (precioVenta > 0) {
              const unidadesVendidas = ingreso / precioVenta;
              egreso = unidadesVendidas * costoUnitario;
            } else {
              egreso = 0;
            }

            costoProduccionVentas += egreso;
          } else if (mov.tipo === 'MERMA') {
            mermasCount++;
            const cantidadPerdida = Number(mov.total_transaccion || 0);
            const costoInsumo = insumoCostoMap.get(mov.referencia_id) || 0;
            egreso = cantidadPerdida * costoInsumo;
            costoTotalMermas += egreso;
          }

          const fechaString = mov.fecha || mov.created_at || new Date().toISOString();

          movimientosProcesados.push({
            id: mov.id,
            tipo: mov.tipo,
            referencia_id: mov.referencia_id,
            total_transaccion: Number(mov.total_transaccion || 0),
            fecha: fechaString,
            created_at: fechaString,
            ingreso,
            egreso,
          });
        }
      }

      const egresosTotales = costoProduccionVentas + costoTotalMermas;
      const gananciaNeta = ingresosTotales - egresosTotales;

      return {
        data: {
          ingresosTotales,
          costoProduccionVentas,
          costoTotalMermas,
          egresosTotales,
          gananciaNeta,
          mermasCount,
          movimientos: movimientosProcesados,
        },
        error: null,
      };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Consulta todos los insumos_base y calcula el costo total monetario acumulado en bodega:
   * Suma de (stock_actual * costo_promedio_unidad) de cada insumo.
   */
  async getCostoTotalInsumos(): Promise<{ data: number | null; error: any }> {
    try {
      const { data: insumos, error } = await this.supabaseService.client
        .from('insumos_base')
        .select('stock_actual, costo_promedio_unidad');

      if (error) {
        return { data: null, error };
      }

      let costoTotalBodega = 0;
      if (insumos) {
        for (const item of insumos) {
          const stock = Number(item.stock_actual || 0);
          const costoUnidad = Number(item.costo_promedio_unidad || 0);
          costoTotalBodega += stock * costoUnidad;
        }
      }

      return { data: costoTotalBodega, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Obtiene la lista de insumos con stock crítico (stock_actual <= stock_minimo).
   */
  async getInsumosCriticos(): Promise<{ data: InsumoBase[] | null; error: any }> {
    try {
      const { data: insumos, error } = await this.supabaseService.client
        .from('insumos_base')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) {
        return { data: null, error };
      }

      const criticos = (insumos || []).filter(
        (i: InsumoBase) => (i.stock_actual || 0) <= (i.stock_minimo || 0)
      );

      return { data: criticos, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }
}
