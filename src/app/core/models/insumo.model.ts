export type UnidadMedida = 'ml' | 'gr' | 'unidad';

export interface InsumoBase {
  id?: string;
  nombre: string;
  unidad_medida: UnidadMedida;
  stock_actual: number;
  costo_promedio_unidad: number;
  stock_minimo: number;
  created_at?: string;
}
