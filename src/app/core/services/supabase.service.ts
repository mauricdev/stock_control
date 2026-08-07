import { Injectable } from '@angular/core';
import {
  createClient,
  Session,
  SignInWithPasswordCredentials,
  SupabaseClient,
} from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  /**
   * Obtiene la instancia del cliente oficial de Supabase.
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Inicia sesión con correo electrónico y contraseña.
   */
  async signInWithPassword(credentials: SignInWithPasswordCredentials) {
    return await this.supabase.auth.signInWithPassword(credentials);
  }

  /**
   * Obtiene la sesión actual activa en Supabase.
   */
  async getSession(): Promise<Session | null> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) {
      console.error('Error al obtener la sesión de Supabase:', error.message);
      return null;
    }
    return data.session;
  }

  /**
   * Cierra la sesión activa del usuario.
   */
  async signOut() {
    return await this.supabase.auth.signOut();
  }
}
