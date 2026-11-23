import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { DEFAULT_USER_CONFIG, jsonError, requireAdmin } from '@/lib/api-helpers';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { UserConfig, UserRecord } from '@/types/ponto';

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const supabase = getSupabaseAdmin();
  const [{ data: users, error: uErr }, { data: configs, error: cErr }] = await Promise.all([
    supabase
      .from('users')
      .select('id, nome, email, role, ativo, created_at')
      .order('created_at', { ascending: true }),
    supabase.from('user_configs').select('*'),
  ]);

  if (uErr || cErr) {
    return jsonError(uErr?.message || cErr?.message || 'Erro ao buscar usuários.', 500);
  }

  const configMap = new Map<string, UserConfig>();
  for (const c of (configs ?? []) as UserConfig[]) {
    configMap.set(c.user_id, c);
  }

  const result = ((users ?? []) as Omit<UserRecord, 'password_hash'>[]).map((u) => ({
    ...u,
    config: configMap.get(u.id) ?? { user_id: u.id, ...DEFAULT_USER_CONFIG },
  }));

  return NextResponse.json({ users: result });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const role = body?.role === 'admin' ? 'admin' : 'user';

  if (!nome || !email || password.length < 6) {
    return jsonError('Nome, e-mail válido e senha (mín. 6 caracteres) são obrigatórios.');
  }

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    return jsonError('Já existe um usuário com este e-mail.', 409);
  }

  const password_hash = await hashPassword(password);

  const { data: user, error: insertError } = await supabase
    .from('users')
    .insert({ nome, email, password_hash, role, ativo: true })
    .select('id, nome, email, role, ativo, created_at')
    .single();

  if (insertError || !user) {
    return jsonError(insertError?.message || 'Erro ao criar usuário.', 500);
  }

  const cfgInput = body?.config ?? {};
  const configPayload: UserConfig = {
    user_id: user.id,
    carga_horaria_minutos: Number(cfgInput.carga_horaria_minutos) || DEFAULT_USER_CONFIG.carga_horaria_minutos,
    intervalo_minutos:
      cfgInput.intervalo_minutos !== undefined
        ? Number(cfgInput.intervalo_minutos)
        : DEFAULT_USER_CONFIG.intervalo_minutos,
    tipo_horario: cfgInput.tipo_horario === 'fixo' ? 'fixo' : 'livre',
    hora_entrada_fixa: String(cfgInput.hora_entrada_fixa || DEFAULT_USER_CONFIG.hora_entrada_fixa),
    hora_saida_fixa: String(cfgInput.hora_saida_fixa || DEFAULT_USER_CONFIG.hora_saida_fixa),
  };

  const { data: config } = await supabase
    .from('user_configs')
    .insert(configPayload)
    .select()
    .single();

  return NextResponse.json({
    user: { ...user, config: config ?? configPayload },
  });
}
