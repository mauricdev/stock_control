import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { VentasService } from '../../../core/services/ventas.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { parseISOToLocalDate } from '../../../core/services/dashboard.service';

@Component({
  selector: 'app-ventas-historial',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './ventas-historial.component.html',
  styleUrl: './ventas-historial.component.scss',
})
export class VentasHistorialComponent implements OnInit {
  private ventasService = inject(VentasService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  ventas: any[] = [];
  isLoading = true;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // Estado del Menú Móvil Hamburguesa
  isMobileMenuOpen = false;

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  async ngOnInit(): Promise<void> {
    await this.loadHistorial();
  }

  async loadHistorial(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.ventasService.getHistorialVentas();
      if (error) {
        this.errorMessage = error.message || 'Error al consultar el historial de ventas.';
      } else {
        this.ventas = (data || []).map((item) => {
          const fechaRaw = item.fecha || item.created_at;
          const fechaLocal = parseISOToLocalDate(fechaRaw);
          const fechaFormateada = fechaLocal
            ? fechaLocal.toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Sin fecha';

          return {
            ...item,
            productoNombre: item.productos_finales?.nombre || 'Producto no especificado',
            fechaLocalFormatted: fechaFormateada,
          };
        });
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al cargar el historial de ventas.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  async anularVenta(item: any): Promise<void> {
    if (!item || !item.id || !item.referencia_id) return;

    const productoNombre = item.productoNombre || 'el producto';
    const totalPagado = item.total_transaccion || 0;

    const confirmado = window.confirm(
      `¿Estás seguro de que deseas anular esta venta de "${productoNombre}" por un total de $${totalPagado}?\n\nEsta acción devolverá los insumos de la receta al inventario y eliminará el registro de la venta.`
    );

    if (!confirmado) return;

    this.errorMessage = null;
    this.successMessage = null;
    this.cdr.detectChanges();

    try {
      const { success, error } = await this.ventasService.anularVenta(
        item.id,
        item.referencia_id
      );

      if (!success || error) {
        this.errorMessage = error?.message || 'No se pudo completar la anulación de la venta.';
      } else {
        this.successMessage = `Venta de "${productoNombre}" anulada exitosamente. Se devolvió el stock correspondiente a los insumos en la bodega.`;

        setTimeout(() => {
          this.successMessage = null;
          this.cdr.detectChanges();
        }, 5000);

        await this.loadHistorial();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al intentar anular la venta.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
