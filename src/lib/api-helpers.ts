import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { SessionPayload, UserConfig } from '@/types/ponto';

export function jsonError(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireAuth(): Promise<
  { session: SessionPayload; error: null } | { session: null; error: NextResponse }
> {
  const session = await getSessionFromCookies();
  if (!session) {
    return { session: null, error: jsonError('Não autenticado.', 401) };
  }
  return { session, error: null };
}

export async function requireAdmin(): Promise<
  { session: SessionPayload; error: null } | { session: null; error: NextResponse }
> {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (auth.session.role !== 'admin') {
    return { session: null, error: jsonError('Acesso restrito a administradores.', 403) };
  }
  return auth;
}

export const DEFAULT_USER_CONFIG: Omit<UserConfig, 'user_id'> = {
  carga_horaria_minutos: 480,
  intervalo_minutos: 60,
  tipo_horario: 'livre',
  hora_entrada_fixa: '09:00',
  hora_saida_fixa: '18:00',
};

export async function ensureUserConfig(userId: string): Promise<UserConfig> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (data) return data as UserConfig;

  const { data: inserted, error } = await supabase
    .from('user_configs')
    .insert({ user_id: userId, ...DEFAULT_USER_CONFIG })
    .select()
    .single();

  if (error || !inserted) {
    return { user_id: userId, ...DEFAULT_USER_CONFIG };
  }
  return inserted as UserConfig;
}
