import { NextResponse } from 'next/server';
import { ensureUserConfig, jsonError, requireAuth } from '@/lib/api-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const supabase = getSupabaseAdmin();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, nome, email, role, ativo, created_at')
    .eq('id', session.userId)
    .maybeSingle();

  if (userError || !user || !user.ativo) {
    return jsonError('Usuário não encontrado ou inativo.', 401);
  }

  const config = await ensureUserConfig(user.id);

  return NextResponse.json({ user, config });
}
