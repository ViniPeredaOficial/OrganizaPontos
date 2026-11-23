import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_CONFIG, jsonError, requireAdmin } from '@/lib/api-helpers';
import { getTodayDateString } from '@/lib/ponto-calc';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { UserConfig, UserRecord } from '@/types/ponto';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const days = Math.min(90, Math.max(1, Number(searchParams.get('days')) || 14));

  const endDate = getTodayDateString();
  const startObj = new Date();
  startObj.setDate(startObj.getDate() - (days - 1));
  const startDate = getTodayDateString(startObj);

  const supabase = getSupabaseAdmin();

  let regQuery = supabase
    .from('registros_dia')
    .select('*')
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: false });

  if (userId && userId !== 'all') {
    regQuery = regQuery.eq('user_id', userId);
  }

  const [{ data: registros, error: rErr }, { data: users }, { data: configs }] = await Promise.all([
    regQuery,
    supabase.from('users').select('id, nome, email, role, ativo, created_at').order('nome'),
    supabase.from('user_configs').select('*'),
  ]);

  if (rErr) return jsonError(rErr.message, 500);

  const configMap = new Map<string, UserConfig>();
  for (const c of (configs ?? []) as UserConfig[]) {
    configMap.set(c.user_id, c);
  }

  const usersWithConfig = ((users ?? []) as Omit<UserRecord, 'password_hash'>[]).map((u) => ({
    ...u,
    config: configMap.get(u.id) ?? { user_id: u.id, ...DEFAULT_USER_CONFIG },
  }));

  return NextResponse.json({
    today: endDate,
    startDate,
    endDate,
    registros: registros ?? [],
    users: usersWithConfig,
  });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const userId = String(body?.user_id || '');
  const data = String(body?.data || '');

  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return jsonError('user_id e data (YYYY-MM-DD) são obrigatórios.');
  }

  const payload = {
    user_id: userId,
    data,
    entrada: body.entrada || null,
    saida_intervalo: body.saida_intervalo || null,
    retorno_intervalo: body.retorno_intervalo || null,
    saida_final: body.saida_final || null,
    observacao: body.observacao ? String(body.observacao) : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data: saved, error: saveErr } = await supabase
    .from('registros_dia')
    .upsert(payload, { onConflict: 'user_id,data' })
    .select()
    .single();

  if (saveErr) return jsonError(saveErr.message, 500);

  return NextResponse.json({ registro: saved });
}
