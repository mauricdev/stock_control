import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProductoFinal } from '../../../core/models/producto.model';

@Component({
  selector: 'app-opciones-pedido-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './opciones-pedido-modal.component.html',
  styleUrl: './opciones-pedido-modal.component.scss',
})
export class OpcionesPedidoModalComponent implements OnInit {
  @Input() producto: ProductoFinal | any = null;
  @Output() confirmed = new EventEmitter<{
    producto: any;
    cantidad: number;
    modificadores: string;
  }>();
  @Output() cancelled = new EventEmitter<void>();

  selectedOpciones: Set<string> = new Set<string>();
  notasExtra: string = '';
  cantidad: number = 1;

  ngOnInit(): void {
    this.selectedOpciones.clear();
    this.notasExtra = '';
    this.cantidad = 1;
  }

  toggleOpcion(opcion: string): void {
    if (this.selectedOpciones.has(opcion)) {
      this.selectedOpciones.delete(opcion);
    } else {
      this.selectedOpciones.add(opcion);
    }
  }

  isOpcionSelected(opcion: string): boolean {
    return this.selectedOpciones.has(opcion);
  }

  incrementarCantidad(): void {
    this.cantidad++;
  }

  decrementarCantidad(): void {
    if (this.cantidad > 1) {
      this.cantidad--;
    }
  }

  onConfirm(): void {
    const opcionesArray = Array.from(this.selectedOpciones);
    const notas = this.notasExtra.trim();
    let modificadoresConsolidados = '';

    if (opcionesArray.length > 0 && notas) {
      modificadoresConsolidados = `${opcionesArray.join(', ')} | ${notas}`;
    } else if (opcionesArray.length > 0) {
      modificadoresConsolidados = opcionesArray.join(', ');
    } else if (notas) {
      modificadoresConsolidados = notas;
    }

    this.confirmed.emit({
      producto: this.producto,
      cantidad: this.cantidad,
      modificadores: modificadoresConsolidados,
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
