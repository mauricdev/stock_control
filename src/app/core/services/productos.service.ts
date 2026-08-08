import { inject, Injectable } from '@angular/core';
import { IngredienteReceta, ProductoFinal } from '../models/producto.model';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class ProductosService {
  private supabaseService = inject(SupabaseService);

  /**
   * Obtiene la lista completa de productos finales haciendo un JOIN relacional
   * con las recetas y sus insumos base asociados.
   */
  async getProductos(): Promise<{ data: any[] | null; error: any }> {
    const { data, error } = await this.supabaseService.client
      .from('productos_finales')
      .select('*, receta_producto(cantidad_requerida, insumos_base(id, nombre, costo_promedio_unidad, unidad_medida))')
      .order('nombre', { ascending: true });

    return { data, error };
  }

  /**
   * Registra un producto final y su receta correspondiente.
   */
  async crearProductoCompleto(
    producto: Omit<ProductoFinal, 'id' | 'created_at'>,
    receta: Omit<IngredienteReceta, 'id' | 'producto_id'>[]
  ): Promise<{ data: any; error: any }> {
    // 1. Insertar en productos_finales
    const { data: productoCreado, error: productoError } =
      await this.supabaseService.client
        .from('productos_finales')
        .insert([
          {
            nombre: producto.nombre.trim(),
            precio_venta: Number(producto.precio_venta),
            categoria: producto.categoria ? producto.categoria.trim() : 'General',
          },
        ])
        .select();

    if (productoError || !productoCreado || productoCreado.length === 0) {
      return {
        data: null,
        error: productoError || new Error('No se pudo crear el producto final.'),
      };
    }

    const productoId = productoCreado[0].id;

    // 2. Insertar ingredientes en receta_producto
    if (receta && receta.length > 0) {
      const recetaPayload = receta.map((item) => ({
        producto_id: productoId,
        insumo_id: item.insumo_id,
        cantidad_requerida: Number(item.cantidad_requerida),
      }));

      const { error: recetaError } = await this.supabaseService.client
        .from('receta_producto')
        .insert(recetaPayload);

      if (recetaError) {
        return { data: productoCreado[0], error: recetaError };
      }
    }

    return { data: productoCreado[0], error: null };
  }

  /**
   * Actualiza los datos de un producto final y reemplaza su receta de ingredientes.
   */
  async actualizarProductoCompleto(
    productoId: string,
    producto: Omit<ProductoFinal, 'id' | 'created_at'>,
    receta: Omit<IngredienteReceta, 'id' | 'producto_id'>[]
  ): Promise<{ data: any; error: any }> {
    // 1. Actualizar el producto en productos_finales
    const { data: productoActualizado, error: productoError } =
      await this.supabaseService.client
        .from('productos_finales')
        .update({
          nombre: producto.nombre.trim(),
          precio_venta: Number(producto.precio_venta),
          categoria: producto.categoria ? producto.categoria.trim() : 'General',
        })
        .eq('id', productoId)
        .select();

    if (productoError) {
      return { data: null, error: productoError };
    }

    // 2. Eliminar la receta previa de este producto
    const { error: deleteError } = await this.supabaseService.client
      .from('receta_producto')
      .delete()
      .eq('producto_id', productoId);

    if (deleteError) {
      return { data: productoActualizado, error: deleteError };
    }

    // 3. Insertar la nueva receta actualizada
    if (receta && receta.length > 0) {
      const recetaPayload = receta.map((item) => ({
        producto_id: productoId,
        insumo_id: item.insumo_id,
        cantidad_requerida: Number(item.cantidad_requerida),
      }));

      const { error: recetaError } = await this.supabaseService.client
        .from('receta_producto')
        .insert(recetaPayload);

      if (recetaError) {
        return { data: productoActualizado, error: recetaError };
      }
    }

    return { data: productoActualizado, error: null };
  }

  /**
   * Elimina un producto final por su ID de la tabla productos_finales.
   * La clave foránea ON DELETE CASCADE eliminará automáticamente sus filas en receta_producto.
   */
  async deleteProducto(id: string): Promise<{ data: any; error: any }> {
    const { data, error } = await this.supabaseService.client
      .from('productos_finales')
      .delete()
      .eq('id', id);

    return { data, error };
  }
}
