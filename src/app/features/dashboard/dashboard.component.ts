import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, registerables } from 'chart.js';
import {
  DashboardService,
  parseISOToLocalDate,
  ResumenDashboardCompleto,
} from '../../core/services/dashboard.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { InsumoBase } from '../../core/models/insumo.model';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  isLoading = true;
  errorMessage: string | null = null;

  // Filtro Temporal
  filtroTiempo: 'hoy' | 'mes' | 'anio' = 'mes';

  // Métricas Financieras Completas
  resumen: ResumenDashboardCompleto = {
    ingresosTotales: 0,
    costoProduccionVentas: 0,
    costoTotalMermas: 0,
    egresosTotales: 0,
    gananciaNeta: 0,
    mermasCount: 0,
    movimientos: [],
  };

  // Valor Monetario Acumulado en Bodega
  costoTotalInsumosBodega = 0;

  insumosCriticos: InsumoBase[] = [];

  // Configuración del Gráfico de Líneas (Line Chart)
  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: '#cbd5e1',
          font: { family: 'ui-sans-serif, system-ui', size: 12, weight: 'bold' },
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#38bdf8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
      },
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(51, 65, 85, 0.2)' },
      },
      y: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
      },
    },
  };

  public lineChartType = 'line' as const;
  public lineChartData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Ingresos ($)',
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#10b981',
      },
      {
        data: [],
        label: 'Egresos ($)',
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#f43f5e',
      },
    ],
  };

  async ngOnInit(): Promise<void> {
    await this.cargarDashboard();
  }

  setFiltroTiempo(filtro: 'hoy' | 'mes' | 'anio'): void {
    if (this.filtroTiempo === filtro) return;
    this.filtroTiempo = filtro;
    this.cargarDashboard();
  }

  obtenerRangoFechas(): { fechaInicio: Date; fechaFin: Date } {
    const ahora = new Date();
    let fechaInicio: Date;
    let fechaFin: Date;

    if (this.filtroTiempo === 'hoy') {
      fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
      fechaFin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    } else if (this.filtroTiempo === 'mes') {
      fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
      fechaFin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // 'anio'
      fechaInicio = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0, 0);
      fechaFin = new Date(ahora.getFullYear(), 11, 31, 23, 59, 59, 999);
    }

    return { fechaInicio, fechaFin };
  }

  async cargarDashboard(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    const { fechaInicio, fechaFin } = this.obtenerRangoFechas();

    try {
      // 1. Obtener datos financieros avanzados de movimientos enviando límites locales en formato ISO UTC
      const { data: resumenData, error: resumenError } =
        await this.dashboardService.getResumenDashboard(fechaInicio, fechaFin);

      if (resumenError) {
        this.errorMessage = resumenError.message || 'Error al obtener datos financieros del Dashboard.';
      } else if (resumenData) {
        this.resumen = resumenData;
        this.actualizarDatosGrafico();
      }

      // 2. Obtener el Costo Total de Insumos en Bodega (Valor Informativo de Inventario)
      const { data: bodegaData, error: bodegaError } =
        await this.dashboardService.getCostoTotalInsumos();

      if (bodegaError) {
        console.warn('Error al obtener costo total de bodega:', bodegaError.message);
      } else {
        this.costoTotalInsumosBodega = bodegaData || 0;
      }

      // 3. Obtener insumos críticos
      const { data: criticosData, error: criticosError } =
        await this.dashboardService.getInsumosCriticos();

      if (criticosError) {
        console.warn('Error al obtener insumos críticos:', criticosError.message);
      } else {
        this.insumosCriticos = criticosData || [];
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Error inesperado al cargar el Dashboard.';
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  actualizarDatosGrafico(): void {
    let labels: string[] = [];
    let ingresosData: number[] = [];
    let egresosData: number[] = [];

    const movimientos = this.resumen.movimientos || [];

    if (this.filtroTiempo === 'hoy') {
      // Agrupar por horas del día (00:00 a 23:00) en la zona horaria local del navegador
      const horas = Array.from({ length: 24 }, (_, i) => i);
      labels = horas.map((h) => `${h.toString().padStart(2, '0')}:00`);

      const ingMap = new Map<number, number>();
      const egrMap = new Map<number, number>();

      for (const mov of movimientos) {
        const fechaMov = parseISOToLocalDate(mov.fecha || mov.created_at);
        const hora = fechaMov.getHours();

        ingMap.set(hora, (ingMap.get(hora) || 0) + (mov.ingreso || 0));
        egrMap.set(hora, (egrMap.get(hora) || 0) + (mov.egreso || 0));
      }

      ingresosData = horas.map((h) => ingMap.get(h) || 0);
      egresosData = horas.map((h) => egrMap.get(h) || 0);
    } else if (this.filtroTiempo === 'mes') {
      // Agrupar por días del mes en la zona horaria local del navegador
      const { fechaFin } = this.obtenerRangoFechas();
      const diasEnMes = fechaFin.getDate();
      const dias = Array.from({ length: diasEnMes }, (_, i) => i + 1);
      labels = dias.map((d) => `Día ${d}`);

      const ingMap = new Map<number, number>();
      const egrMap = new Map<number, number>();

      for (const mov of movimientos) {
        const fechaMov = parseISOToLocalDate(mov.fecha || mov.created_at);
        const dia = fechaMov.getDate();

        ingMap.set(dia, (ingMap.get(dia) || 0) + (mov.ingreso || 0));
        egrMap.set(dia, (egrMap.get(dia) || 0) + (mov.egreso || 0));
      }

      ingresosData = dias.map((d) => ingMap.get(d) || 0);
      egresosData = dias.map((d) => egrMap.get(d) || 0);
    } else {
      // Agrupar por meses del año en la zona horaria local del navegador
      labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const meses = Array.from({ length: 12 }, (_, i) => i);

      const ingMap = new Map<number, number>();
      const egrMap = new Map<number, number>();

      for (const mov of movimientos) {
        const fechaMov = parseISOToLocalDate(mov.fecha || mov.created_at);
        const mes = fechaMov.getMonth();

        ingMap.set(mes, (ingMap.get(mes) || 0) + (mov.ingreso || 0));
        egrMap.set(mes, (egrMap.get(mes) || 0) + (mov.egreso || 0));
      }

      ingresosData = meses.map((m) => ingMap.get(m) || 0);
      egresosData = meses.map((m) => egrMap.get(m) || 0);
    }

    this.lineChartData = {
      labels,
      datasets: [
        {
          data: ingresosData,
          label: 'Ingresos ($)',
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#10b981',
        },
        {
          data: egresosData,
          label: 'Egresos ($)',
          borderColor: '#f43f5e',
          backgroundColor: 'rgba(244, 63, 94, 0.15)',
          fill: true,
          tension: 0.3,
          pointBackgroundColor: '#f43f5e',
        },
      ],
    };
  }

  async onSignOut(): Promise<void> {
    await this.supabaseService.signOut();
    this.router.navigate(['/login']);
  }
}
