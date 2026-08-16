import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ProductosService } from '../../core/services/productos.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CartItem, VentasService } from '../../core/services/ventas.service';
import { OpcionesPedidoModalComponent } from './opciones-pedido-modal/opciones-pedido-modal.component';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, OpcionesPedidoModalComponent],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit {
  private productosService = inject(ProductosService);
  private ventasService = inject(VentasService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  productos: any[] = [];
  filteredProductos: any[] = [];
  categories: string[] = ['Todas'];
  selectedCategory = 'Todas';
  searchTerm = '';

  carrito: CartItem[] = [];
  nombreClientePedido: string = '';

  isLoading = true;
  isProcessingVenta = false;
  saleSuccessMessage: string | null = null;
  errorMessage: string | null = null;

  // Estado del Modal de Modificadores
  showOpcionesModal = false;
  selectedProductoForModal: any = null;

  // Estado del Menú Móvil Hamburguesa
  isMobileMenuOpen = false;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCatalogo();
  }

  async loadCatalogo(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.productosService.getProductos();
      if (error) {
        this.errorMessage = error.message || 'Error al obtener el catálogo de productos.';
      } else {
        this.productos = data || [];
        this.extraerCategorias();
        this.filtrarProductos();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al cargar el catálogo del POS.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  extraerCategorias(): void {
    const setCat = new Set<string>();
    setCat.add('Todas');
    for (const prod of this.productos) {
      if (prod.categoria) {
        setCat.add(prod.categoria);
      }
    }
    this.categories = Array.from(setCat);
  }

  filtrarProductos(): void {
    const query = this.searchTerm.toLowerCase().trim();
    this.filteredProductos = this.productos.filter((prod) => {
      const coincideNombre = prod.nombre.toLowerCase().includes(query);
      const coincideCategoria =
        this.selectedCategory === 'Todas' || prod.categoria === this.selectedCategory;
      return coincideNombre && coincideCategoria;
    });
    this.cdr.detectChanges();
  }

  selectCategory(cat: string): void {
    this.selectedCategory = cat;
    this.filtrarProductos();
  }

  // --- Lógica de Selección de Productos y Modificadores ---
  agregarAlCarrito(producto: any): void {
    const isComida = (producto.categoria || '').toUpperCase() === 'COMIDA';
    const tieneOpciones =
      producto.opciones_fijas &&
      Array.isArray(producto.opciones_fijas) &&
      producto.opciones_fijas.length > 0;

    // Si es Comida y tiene opciones fijas, interceptamos para abrir modal de modificadores
    if (isComida && tieneOpciones) {
      this.selectedProductoForModal = producto;
      this.showOpcionesModal = true;
      this.cdr.detectChanges();
      return;
    }

    // Si es Retail o producto sin opciones fijas, lo agregamos directo
    this.insertarItemEnCarrito(producto, 1, '');
  }

  onOpcionesConfirmadas(event: {
    producto: any;
    cantidad: number;
    modificadores: string;
  }): void {
    this.insertarItemEnCarrito(event.producto, event.cantidad, event.modificadores);
    this.closeOpcionesModal();
  }

  closeOpcionesModal(): void {
    this.showOpcionesModal = false;
    this.selectedProductoForModal = null;
    this.cdr.detectChanges();
  }

  insertarItemEnCarrito(producto: any, cantidad: number, modificadores: string = ''): void {
    const modTexto = modificadores ? modificadores.trim() : '';

    // Buscar si ya existe el mismo ítem con exactamente los mismos modificadores
    const itemExistente = this.carrito.find(
      (item) => item.id === producto.id && (item.modificadores || '') === modTexto
    );

    if (itemExistente) {
      itemExistente.cantidad += cantidad;
    } else {
      this.carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio_venta: Number(producto.precio_venta),
        categoria: producto.categoria,
        cantidad: cantidad,
        receta_producto: producto.receta_producto || [],
        modificadores: modTexto || undefined,
      });
    }

    this.cdr.detectChanges();
  }

  modificarCantidad(index: number, delta: number): void {
    const item = this.carrito[index];
    if (!item) return;

    item.cantidad += delta;
    if (item.cantidad <= 0) {
      this.eliminarDelCarrito(index);
    } else {
      this.cdr.detectChanges();
    }
  }

  eliminarDelCarrito(index: number): void {
    this.carrito.splice(index, 1);
    this.cdr.detectChanges();
  }

  vaciarCarrito(): void {
    this.carrito = [];
    this.cdr.detectChanges();
  }

  get totalPagar(): number {
    return this.carrito.reduce(
      (sum, item) => sum + item.cantidad * (item.precio_venta || 0),
      0
    );
  }

  get totalItemsCount(): number {
    return this.carrito.reduce((sum, item) => sum + item.cantidad, 0);
  }

  // --- Procesar la Venta ---
  async confirmarVenta(): Promise<void> {
    if (this.carrito.length === 0) return;

    this.isProcessingVenta = true;
    this.errorMessage = null;
    this.saleSuccessMessage = null;
    this.cdr.detectChanges();

    try {
      const { success, error, pedido } = await this.ventasService.procesarVenta(
        this.carrito,
        this.nombreClientePedido
      );

      if (success) {
        const ticketNum = pedido?.numero_ticket ? ` #${pedido.numero_ticket}` : '';
        this.saleSuccessMessage = `¡Pedido${ticketNum} enviado a cocina y venta procesada con éxito!`;
        this.carrito = [];
        this.nombreClientePedido = '';
        await this.loadCatalogo();

        // Ocultar mensaje tras 4 segundos
        setTimeout(() => {
          this.saleSuccessMessage = null;
          this.cdr.detectChanges();
        }, 4000);
      } else {
        this.errorMessage = error?.message || 'Ocurrió un error al procesar la venta.';
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al conectar con el servidor.';
    } finally {
      this.isProcessingVenta = false;
      this.cdr.detectChanges();
    }
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
