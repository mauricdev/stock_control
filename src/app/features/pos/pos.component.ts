import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ProductosService } from '../../core/services/productos.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { CartItem, VentasService } from '../../core/services/ventas.service';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
  isLoading = true;
  isProcessingVenta = false;
  saleSuccessMessage: string | null = null;
  errorMessage: string | null = null;

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

  // --- Lógica del Carrito de Compras ---
  agregarAlCarrito(producto: any): void {
    const itemExistente = this.carrito.find((item) => item.id === producto.id);

    if (itemExistente) {
      itemExistente.cantidad += 1;
    } else {
      this.carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio_venta: Number(producto.precio_venta),
        categoria: producto.categoria,
        cantidad: 1,
        receta_producto: producto.receta_producto || [],
      });
    }

    this.cdr.detectChanges();
  }

  modificarCantidad(productoId: string, delta: number): void {
    const item = this.carrito.find((i) => i.id === productoId);
    if (!item) return;

    item.cantidad += delta;
    if (item.cantidad <= 0) {
      this.eliminarDelCarrito(productoId);
    } else {
      this.cdr.detectChanges();
    }
  }

  eliminarDelCarrito(productoId: string): void {
    this.carrito = this.carrito.filter((i) => i.id !== productoId);
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
      const { success, error } = await this.ventasService.procesarVenta(this.carrito);

      if (success) {
        this.saleSuccessMessage = '¡Venta procesada con éxito! El inventario de insumos base ha sido actualizado.';
        this.carrito = [];
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
