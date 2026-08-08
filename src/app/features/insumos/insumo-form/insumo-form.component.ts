import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InsumoBase } from '../../../core/models/insumo.model';
import { InsumosService } from '../../../core/services/insumos.service';

@Component({
  selector: 'app-insumo-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './insumo-form.component.html',
  styleUrl: './insumo-form.component.scss',
})
export class InsumoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private insumosService = inject(InsumosService);

  @Input() insumoEdit: InsumoBase | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  insumoForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    unidad_medida: ['unidad', [Validators.required]],
    stock_actual: [0, [Validators.required, Validators.min(0)]],
    costo_total: [0, [Validators.required, Validators.min(0)]],
    unidades_empaque: [1, [Validators.required, Validators.min(0.00001)]],
    stock_minimo: [0, [Validators.required, Validators.min(0)]],
  });

  isLoading = false;
  errorMessage: string | null = null;

  ngOnInit(): void {
    if (this.insumoEdit) {
      // Precargar los datos en el formulario para edición
      this.insumoForm.patchValue({
        nombre: this.insumoEdit.nombre || '',
        unidad_medida: this.insumoEdit.unidad_medida || 'unidad',
        stock_actual: this.insumoEdit.stock_actual || 0,
        costo_total: this.insumoEdit.costo_promedio_unidad || 0,
        unidades_empaque: 1,
        stock_minimo: this.insumoEdit.stock_minimo || 0,
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.insumoForm.invalid) {
      this.insumoForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const formValues = this.insumoForm.value;
    const costo_total = Number(formValues.costo_total);
    const unidades_empaque = Number(formValues.unidades_empaque);

    if (unidades_empaque <= 0) {
      this.errorMessage = 'Las unidades del empaque deben ser mayores a 0.';
      this.isLoading = false;
      return;
    }

    // Cálculo automático del costo por unidad
    const costo_calculado = costo_total / unidades_empaque;

    const payload = {
      nombre: formValues.nombre.trim(),
      unidad_medida: formValues.unidad_medida,
      stock_actual: Number(formValues.stock_actual),
      costo_promedio_unidad: costo_calculado,
      stock_minimo: Number(formValues.stock_minimo),
    };

    try {
      let response;
      if (this.insumoEdit && this.insumoEdit.id) {
        response = await this.insumosService.updateInsumo(this.insumoEdit.id, payload);
      } else {
        response = await this.insumosService.addInsumo(payload);
      }

      if (response.error) {
        this.errorMessage = response.error.message || 'Error al guardar el insumo.';
      } else {
        this.saved.emit();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al conectar con Supabase.';
    } finally {
      this.isLoading = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  // Getters para validaciones en la plantilla
  get nombreControl() {
    return this.insumoForm.get('nombre');
  }

  get unidadMedidaControl() {
    return this.insumoForm.get('unidad_medida');
  }

  get stockActualControl() {
    return this.insumoForm.get('stock_actual');
  }

  get costoTotalControl() {
    return this.insumoForm.get('costo_total');
  }

  get unidadesEmpaqueControl() {
    return this.insumoForm.get('unidades_empaque');
  }

  get stockMinimoControl() {
    return this.insumoForm.get('stock_minimo');
  }
}
