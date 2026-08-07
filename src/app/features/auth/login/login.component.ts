import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    const { email, password } = this.loginForm.value;

    try {
      const { data, error } = await this.supabaseService.signInWithPassword({
        email,
        password,
      });

      if (error) {
        this.errorMessage = error.message;
      } else if (data.session) {
        this.successMessage = '¡Inicio de sesión exitoso! Redirigiendo...';
        setTimeout(() => {
          this.router.navigate(['/']);
        }, 1000);
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Ocurrió un error inesperado al iniciar sesión.';
    } finally {
      this.isLoading = false;
    }
  }

  // Getters auxiliares para validación en la plantilla
  get emailControl() {
    return this.loginForm.get('email');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}
