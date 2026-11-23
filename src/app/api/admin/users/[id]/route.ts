import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { jsonError, requireAdmin } from '@/lib/api-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return jsonError('Corpo da requisição inválido.');

  const supabase = getSupabaseAdmin();

  const userUpdates: Record<string, unknown> = {};
  if (typeof body.nome === 'string' && body.nome.trim()) {
    userUpdates.nome = body.nome.trim();
  }
  if (typeof body.email === 'string' && body.email.trim()) {
    userUpdates.email = body.email.trim().toLowerCase();
  }
  if (body.role === 'admin' || body.role === 'user') {
    if (id === session.userId && body.role !== 'admin') {
      return jsonError('Você não pode remover seu próprio acesso de administrador.');
    }
    userUpdates.role = body.role;
  }
  if (typeof body.ativo === 'boolean') {
    if (id === session.userId && !body.ativo) {
      return jsonError('Você não pode desativar seu próprio usuário.');
    }
    userUpdates.ativo = body.ativo;
  }
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return jsonError('A nova senha deve ter pelo menos 6 caracteres.');
    }
    userUpdates.password_hash = await hashPassword(body.password);
  }

  if (Object.keys(userUpdates).length > 0) {
    const { error: uErr } = await supabase.from('users').update(userUpdates).eq('id', id);
    if (uErr) return jsonError(uErr.message, 500);
  }

  if (body.config && typeof body.config === 'object') {
    const cfg = body.config;
    const carga = Math.max(30, Math.min(1440, Number(cfg.carga_horaria_minutos) || 480));
    const intervalo = Math.max(0, Math.min(480, Number(cfg.intervalo_minutos) ?? 60));
    const tipo = cfg.tipo_horario === 'fixo' ? 'fixo' : 'livre';

    const { error: cErr } = await supabase.from('user_configs').upsert({
      user_id: id,
      carga_horaria_minutos: carga,
      intervalo_minutos: intervalo,
      tipo_horario: tipo,
      hora_entrada_fixa: String(cfg.hora_entrada_fixa || '09:00'),
      hora_saida_fixa: String(cfg.hora_saida_fixa || '18:00'),
      updated_at: new Date().toISOString(),
    });

    if (cErr) return jsonError(cErr.message, 500);
  }

  const [{ data: user }, { data: config }] = await Promise.all([
    supabase
      .from('users')
      .select('id, nome, email, role, ativo, created_at')
      .eq('id', id)
      .single(),
    supabase.from('user_configs').select('*').eq('user_id', id).maybeSingle(),
  ]);

  return NextResponse.json({ user: { ...user, config } });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const { id } = await context.params;
  if (id === session.userId) {
    return jsonError('Você não pode excluir sua própria conta.');
  }

  const supabase = getSupabaseAdmin();
  const { error: delErr } = await supabase.from('users').delete().eq('id', id);
  if (delErr) return jsonError(delErr.message, 500);

  return NextResponse.json({ ok: true });
}
