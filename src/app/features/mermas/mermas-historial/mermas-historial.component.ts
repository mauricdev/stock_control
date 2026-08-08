import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { InsumosService } from '../../../core/services/insumos.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { parseISOToLocalDate } from '../../../core/services/dashboard.service';

@Component({
  selector: 'app-mermas-historial',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mermas-historial.component.html',
  styleUrl: './mermas-historial.component.scss',
})
export class MermasHistorialComponent implements OnInit {
  private insumosService = inject(InsumosService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  mermas: any[] = [];
  isLoading = true;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.loadHistorial();
  }

  async loadHistorial(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    try {
      const { data, error } = await this.insumosService.getHistorialMermas();
      if (error) {
        this.errorMessage = error.message || 'Error al cargar el historial de mermas.';
      } else {
        this.mermas = data || [];
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al consultar Supabase.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  formatFechaLocal(fechaStr: string): Date {
    return parseISOToLocalDate(fechaStr);
  }

  async anularMerma(movimiento: any): Promise<void> {
    if (!movimiento || !movimiento.id || !movimiento.referencia_id) return;

    const insumoNombre = movimiento.insumos_base?.nombre || 'el insumo seleccionado';
    const unidad = movimiento.insumos_base?.unidad_medida || 'unidades';
    const cantidad = Number(movimiento.total_transaccion || 0);

    const confirmado = window.confirm(
      `¿Estás seguro de que deseas anular esta merma de ${cantidad} ${unidad} de "${insumoNombre}"?\n\nLa cantidad será devuelta automáticamente al stock actual del insumo.`
    );

    if (!confirmado) return;

    this.errorMessage = null;
    this.successMessage = null;
    this.cdr.detectChanges();

    try {
      const { error } = await this.insumosService.anularMerma(
        movimiento.id,
        movimiento.referencia_id,
        cantidad
      );

      if (error) {
        this.errorMessage = error.message || 'No se pudo anular la merma.';
      } else {
        this.successMessage = `Merma anulada con éxito. Se devolvieron ${cantidad} ${unidad} al stock de "${insumoNombre}".`;
        
        setTimeout(() => {
          this.successMessage = null;
          this.cdr.detectChanges();
        }, 4000);

        await this.loadHistorial();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al anular la merma.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
