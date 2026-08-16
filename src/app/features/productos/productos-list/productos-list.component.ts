import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ProductosService } from '../../../core/services/productos.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProductoFormComponent } from '../producto-form/producto-form.component';

@Component({
  selector: 'app-productos-list',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ProductoFormComponent],
  templateUrl: './productos-list.component.html',
  styleUrl: './productos-list.component.scss',
})
export class ProductosListComponent implements OnInit {
  private productosService = inject(ProductosService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  productos: any[] = [];
  isLoading = true;
  errorMessage: string | null = null;

  // --- Paginación Client-Side (Máximo 7 por página) ---
  currentPage: number = 1;
  itemsPerPage: number = 7;

  get totalPages(): number {
    return Math.ceil(this.productos.length / this.itemsPerPage) || 1;
  }

  get paginatedItems(): any[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return this.productos.slice(startIndex, startIndex + this.itemsPerPage);
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.detectChanges();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.detectChanges();
    }
  }

  // Estado del Menú Móvil Hamburguesa
  isMobileMenuOpen = false;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  // Modales
  showForm = false;
  selectedProductoForEdit: any = null;
  selectedProductoForReceta: any = null;

  async ngOnInit(): Promise<void> {
    await this.loadProductos();
  }

  async loadProductos(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.productosService.getProductos();
      if (error) {
        this.errorMessage = error.message || 'Error al obtener la lista de productos.';
      } else {
        // Recorrer y calcular costo_total y ganancia para cada producto
        this.productos = (data || []).map((prod: any) => {
          let costoTotal = 0;
          if (prod.receta_producto && Array.isArray(prod.receta_producto)) {
            for (const item of prod.receta_producto) {
              const cantidad = Number(item.cantidad_requerida || 0);
              const costoUnidad = Number(item.insumos_base?.costo_promedio_unidad || 0);
              costoTotal += cantidad * costoUnidad;
            }
          }
          const ganancia = Number(prod.precio_venta || 0) - costoTotal;

          return {
            ...prod,
            costo_total: costoTotal,
            ganancia: ganancia,
          };
        });
        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
        }
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Ocurrió un error inesperado al cargar los productos.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  openForm(productoToEdit: any = null): void {
    this.selectedProductoForEdit = productoToEdit;
    this.showForm = true;
    this.cdr.detectChanges();
  }

  closeForm(): void {
    this.showForm = false;
    this.selectedProductoForEdit = null;
    this.cdr.detectChanges();
  }

  async onProductoSaved(): Promise<void> {
    this.closeForm();
    await this.loadProductos();
  }

  // --- Eliminar Producto ---
  async eliminarProducto(producto: any): Promise<void> {
    if (!producto || !producto.id) return;

    const confirmado = window.confirm(
      `¿Estás seguro de que deseas eliminar el producto "${producto.nombre}"?\nEsta acción también eliminará su receta de forma permanente.`
    );

    if (!confirmado) return;

    this.errorMessage = null;

    try {
      const { error } = await this.productosService.deleteProducto(producto.id);

      if (error) {
        this.errorMessage = error.message || 'Error al eliminar el producto.';
      } else {
        await this.loadProductos();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al eliminar el producto.';
    }
  }

  // --- Modal de Ver Receta ---
  openRecetaModal(producto: any): void {
    this.selectedProductoForReceta = producto;
    this.cdr.detectChanges();
  }

  closeRecetaModal(): void {
    this.selectedProductoForReceta = null;
    this.cdr.detectChanges();
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
