import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InsumoBase } from '../../../core/models/insumo.model';
import { InsumosService } from '../../../core/services/insumos.service';
import { ProductosService } from '../../../core/services/productos.service';

@Component({
  selector: 'app-producto-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './producto-form.component.html',
  styleUrl: './producto-form.component.scss',
})
export class ProductoFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private insumosService = inject(InsumosService);
  private productosService = inject(ProductosService);

  @Input() productoEdit: any = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  insumosList: InsumoBase[] = [];
  isLoadingInsumos = true;
  isLoadingSubmit = false;
  errorMessage: string | null = null;

  costoProduccionTotal = 0;
  margenEstimado = 0;

  productoForm: FormGroup = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    precio_venta: [0, [Validators.required, Validators.min(0)]],
    categoria: ['General', [Validators.required]],
    ingredientes: this.fb.array([]),
  });

  async ngOnInit(): Promise<void> {
    await this.cargarInsumos();

    if (this.productoEdit) {
      // Modo Edición: Precargar los datos del producto y su receta
      this.productoForm.patchValue({
        nombre: this.productoEdit.nombre || '',
        precio_venta: this.productoEdit.precio_venta || 0,
        categoria: this.productoEdit.categoria || 'General',
      });

      this.ingredientesArray.clear();

      if (this.productoEdit.receta_producto && this.productoEdit.receta_producto.length > 0) {
        for (const item of this.productoEdit.receta_producto) {
          const insumoId = item.insumos_base?.id || item.insumo_id;
          this.ingredientesArray.push(
            this.crearGrupoIngrediente(insumoId, item.cantidad_requerida)
          );
        }
      } else {
        this.agregarIngrediente();
      }
    } else {
      // Modo Creación
      if (this.ingredientesArray.length === 0) {
        this.agregarIngrediente();
      }
    }

    this.calcularCostoTotal();

    // Escuchar cambios para recalcular en tiempo real
    this.productoForm.valueChanges.subscribe(() => {
      this.calcularCostoTotal();
    });
  }

  async cargarInsumos(): Promise<void> {
    this.isLoadingInsumos = true;
    try {
      const { data, error } = await this.insumosService.getInsumos();
      if (error) {
        this.errorMessage = 'No se pudieron cargar los insumos para la receta.';
      } else {
        this.insumosList = data || [];
      }
    } catch (e: any) {
      this.errorMessage = 'Error inesperado al cargar los insumos.';
    } finally {
      this.isLoadingInsumos = false;
    }
  }

  get ingredientesArray(): FormArray {
    return this.productoForm.get('ingredientes') as FormArray;
  }

  crearGrupoIngrediente(insumoId = '', cantidad = 1): FormGroup {
    return this.fb.group({
      insumo_id: [insumoId, [Validators.required]],
      cantidad_requerida: [cantidad, [Validators.required, Validators.min(0.00001)]],
    });
  }

  agregarIngrediente(): void {
    const primerInsumoId = this.insumosList.length > 0 ? this.insumosList[0].id || '' : '';
    this.ingredientesArray.push(this.crearGrupoIngrediente(primerInsumoId, 1));
    this.calcularCostoTotal();
  }

  removerIngrediente(index: number): void {
    this.ingredientesArray.removeAt(index);
    this.calcularCostoTotal();
  }

  getInsumoSeleccionado(insumoId: string): InsumoBase | undefined {
    return this.insumosList.find((i) => i.id === insumoId);
  }

  calcularCostoTotal(): void {
    let costoTotal = 0;
    const ingredientesValues = this.ingredientesArray.value;

    for (const item of ingredientesValues) {
      if (item.insumo_id && item.cantidad_requerida) {
        const insumo = this.insumosList.find((i) => i.id === item.insumo_id);
        if (insumo) {
          costoTotal += (insumo.costo_promedio_unidad || 0) * Number(item.cantidad_requerida);
        }
      }
    }

    this.costoProduccionTotal = costoTotal;
    const precioVenta = Number(this.productoForm.get('precio_venta')?.value || 0);
    this.margenEstimado = precioVenta - this.costoProduccionTotal;
  }

  async onSubmit(): Promise<void> {
    if (this.productoForm.invalid) {
      this.productoForm.markAllAsTouched();
      return;
    }

    if (this.ingredientesArray.length === 0) {
      this.errorMessage = 'Debes agregar al menos un ingrediente a la receta.';
      return;
    }

    this.isLoadingSubmit = true;
    this.errorMessage = null;

    const formValue = this.productoForm.value;

    const productoPayload = {
      nombre: formValue.nombre,
      precio_venta: Number(formValue.precio_venta),
      categoria: formValue.categoria,
    };

    const recetaPayload = formValue.ingredientes.map((item: any) => ({
      insumo_id: item.insumo_id,
      cantidad_requerida: Number(item.cantidad_requerida),
    }));

    try {
      let response;
      if (this.productoEdit && this.productoEdit.id) {
        response = await this.productosService.actualizarProductoCompleto(
          this.productoEdit.id,
          productoPayload,
          recetaPayload
        );
      } else {
        response = await this.productosService.crearProductoCompleto(
          productoPayload,
          recetaPayload
        );
      }

      if (response.error) {
        this.errorMessage = response.error.message || 'Error al guardar el producto y su receta.';
      } else {
        this.saved.emit();
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al guardar en Supabase.';
    } finally {
      this.isLoadingSubmit = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  get nombreControl() {
    return this.productoForm.get('nombre');
  }

  get precioVentaControl() {
    return this.productoForm.get('precio_venta');
  }

  get categoriaControl() {
    return this.productoForm.get('categoria');
  }
}
