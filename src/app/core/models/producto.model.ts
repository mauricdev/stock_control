export interface ProductoFinal {
  id?: string;
  nombre: string;
  precio_venta: number;
  categoria?: string;
  opciones_fijas?: string[];
  created_at?: string;
}

export interface IngredienteReceta {
  id?: string;
  producto_id?: string;
  insumo_id: string;
  cantidad_requerida: number;
}
