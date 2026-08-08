import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InsumoBase } from '../../../core/models/insumo.model';

@Component({
  selector: 'app-compra-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './compra-modal.component.html',
  styleUrl: './compra-modal.component.scss',
})
export class CompraModalComponent implements OnInit {
  private fb = inject(FormBuilder);

  @Input() insumo: InsumoBase | null = null;
  @Output() confirmed = new EventEmitter<{ cantidadComprada: number; costoTotal: number }>();
  @Output() cancelled = new EventEmitter<void>();

  compraForm!: FormGroup;
  isSubmitting = false;

  ngOnInit(): void {
    this.compraForm = this.fb.group({
      cantidadComprada: [null, [Validators.required, Validators.min(0.0001)]],
      costoTotal: [null, [Validators.required, Validators.min(0)]],
    });
  }

  onSubmit(): void {
    if (this.compraForm.invalid) {
      this.compraForm.markAllAsTouched();
      return;
    }

    const { cantidadComprada, costoTotal } = this.compraForm.value;
    this.isSubmitting = true;

    this.confirmed.emit({
      cantidadComprada: Number(cantidadComprada),
      costoTotal: Number(costoTotal),
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
