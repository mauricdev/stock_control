import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InsumoBase } from '../../../core/models/insumo.model';
import { InsumosService } from '../../../core/services/insumos.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { InsumoFormComponent } from '../insumo-form/insumo-form.component';
import { CompraModalComponent } from '../compra-modal/compra-modal.component';

@Component({
  selector: 'app-insumos-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    InsumoFormComponent,
    CompraModalComponent,
  ],
  templateUrl: './insumos-list.component.html',
  styleUrl: './insumos-list.component.scss',
})
export class InsumosListComponent implements OnInit {
  private insumosService = inject(InsumosService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  insumos: InsumoBase[] = [];
  isLoading = true;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // --- Paginación Client-Side (Máximo 7 por página) ---
  currentPage: number = 1;
  itemsPerPage: number = 7;

  get totalPages(): number {
    return Math.ceil(this.insumos.length / this.itemsPerPage) || 1;
  }

  get paginatedItems(): InsumoBase[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return this.insumos.slice(startIndex, startIndex + this.itemsPerPage);
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

  // Estado para el modal de Crear/Editar
  showForm = false;
  selectedInsumoForEdit: InsumoBase | null = null;

  // Estado para el modal de Compra
  selectedInsumoForCompra: InsumoBase | null = null;

  // Estado para el modal de Merma
  selectedInsumoForMerma: InsumoBase | null = null;
  cantidadMerma: number | null = null;
  mermaError: string | null = null;
  isSubmittingMerma = false;

  async ngOnInit(): Promise<void> {
    await this.loadInsumos();
  }

  async loadInsumos(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.insumosService.getInsumos();

      if (error) {
        this.errorMessage = error.message;
      } else {
        this.insumos = data || [];
        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
        }
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error al conectar con el servidor.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  // --- Lógica de Formulario Modal (Crear / Editar) ---
  openForm(insumo: InsumoBase | null = null): void {
    this.selectedInsumoForEdit = insumo;
    this.showForm = true;
  }

  openCreateModal(): void {
    this.openForm(null);
  }

  openEditModal(insumo: InsumoBase): void {
    this.openForm(insumo);
  }

  closeForm(): void {
    this.showForm = false;
    this.selectedInsumoForEdit = null;
  }

  onInsumoSaved(): void {
    this.closeForm();
    this.loadInsumos();
  }

  // --- Lógica de Eliminación ---
  async onDeleteInsumo(insumo: InsumoBase): Promise<void> {
    if (!insumo || !insumo.id) return;

    const confirmado = window.confirm(
      `¿Estás seguro de que deseas eliminar el insumo "${insumo.nombre}"?`
    );

    if (!confirmado) return;

    this.errorMessage = null;

    try {
      const { error } = await this.insumosService.deleteInsumo(insumo.id);

      if (error) {
        if (
          error.code === '23503' ||
          (error.message && error.message.toLowerCase().includes('foreign key'))
        ) {
          this.errorMessage = `No se puede eliminar el insumo "${insumo.nombre}" porque pertenece a la receta de uno o más productos compuestos.`;
        } else {
          this.errorMessage = error.message || 'Error al eliminar el insumo.';
        }
      } else {
        await this.loadInsumos();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al intentar eliminar el insumo.';
    }
  }

  // --- Lógica para Ingresar Compra (Modal Personalizado UX) ---
  openCompraModal(insumo: InsumoBase): void {
    this.selectedInsumoForCompra = insumo;
    this.cdr.detectChanges();
  }

  closeCompraModal(): void {
    this.selectedInsumoForCompra = null;
    this.cdr.detectChanges();
  }

  async onCompraConfirmed(event: { cantidadComprada: number; costoTotal: number }): Promise<void> {
    if (!this.selectedInsumoForCompra || !this.selectedInsumoForCompra.id) return;

    this.errorMessage = null;
    this.successMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.insumosService.registrarCompraInsumo(
        this.selectedInsumoForCompra,
        event.cantidadComprada,
        event.costoTotal
      );

      if (error) {
        this.errorMessage = error.message || 'Error al registrar la compra.';
      } else if (data) {
        const insumoNombre = this.selectedInsumoForCompra.nombre;
        const unidad = this.selectedInsumoForCompra.unidad_medida;
        const nuevoCostoFormateado = Number(data.nuevoCostoPromedio || 0).toFixed(2);

        this.successMessage = `¡Compra de "${insumoNombre}" registrada exitosamente! Nuevo stock: ${data.nuevoStock} ${unidad} | Nuevo costo promedio: $${nuevoCostoFormateado} / ${unidad}`;
        
        setTimeout(() => {
          this.successMessage = null;
          this.cdr.detectChanges();
        }, 5000);

        this.closeCompraModal();
        await this.loadInsumos();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al registrar la compra.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  // --- Lógica para el Modal de Mermas ---
  openMermaModal(insumo: InsumoBase): void {
    this.selectedInsumoForMerma = insumo;
    this.cantidadMerma = null;
    this.mermaError = null;
    this.cdr.detectChanges();
  }

  closeMermaModal(): void {
    this.selectedInsumoForMerma = null;
    this.cantidadMerma = null;
    this.mermaError = null;
    this.isSubmittingMerma = false;
    this.cdr.detectChanges();
  }

  async confirmarMerma(): Promise<void> {
    if (!this.selectedInsumoForMerma || !this.selectedInsumoForMerma.id) {
      return;
    }

    const cantidad = Number(this.cantidadMerma);

    if (isNaN(cantidad) || cantidad <= 0) {
      this.mermaError = 'Ingresa una cantidad perdida válida mayor a 0.';
      return;
    }

    if (cantidad > this.selectedInsumoForMerma.stock_actual) {
      this.mermaError = `La merma (${cantidad}) no puede ser mayor que el stock actual (${this.selectedInsumoForMerma.stock_actual}).`;
      return;
    }

    this.isSubmittingMerma = true;
    this.mermaError = null;
    this.cdr.detectChanges();

    try {
      const { error } = await this.insumosService.registrarMerma(
        this.selectedInsumoForMerma.id,
        cantidad,
        this.selectedInsumoForMerma.stock_actual
      );

      if (error) {
        this.mermaError = error.message || 'Error al registrar la merma en Supabase.';
      } else {
        this.closeMermaModal();
        await this.loadInsumos();
      }
    } catch (err: any) {
      this.mermaError = err?.message || 'Error inesperado al procesar la merma.';
    } finally {
      this.isSubmittingMerma = false;
      this.cdr.detectChanges();
    }
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
