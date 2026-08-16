export interface DetallePedido {
  id?: string;
  pedido_id?: string;
  producto_id?: string;
  cantidad: number;
  modificadores_seleccionados?: string | null;
  subtotal: number;
  productos_finales?: {
    id: string;
    nombre: string;
    categoria?: string;
  } | null;
}

export interface Pedido {
  id: string;
  numero_ticket: number;
  estado: string; // 'RECIBIDO' | 'PREPARANDO' | 'LISTO' | 'FINALIZADO'
  origen: string;
  total: number;
  fecha: string;
  nombre_cliente?: string | null;
  detalles_pedido?: DetallePedido[];
}
