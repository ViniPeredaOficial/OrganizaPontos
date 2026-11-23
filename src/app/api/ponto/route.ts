import { NextRequest, NextResponse } from 'next/server';
import { ensureUserConfig, jsonError, requireAuth } from '@/lib/api-helpers';
import { getPontoStatus, getTodayDateString } from '@/lib/ponto-calc';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { PontoAcao, RegistroDia } from '@/types/ponto';

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const supabase = getSupabaseAdmin();
  const today = getTodayDateString();

  const [config, { data: historico, error: histError }] = await Promise.all([
    ensureUserConfig(session.userId),
    supabase
      .from('registros_dia')
      .select('*')
      .eq('user_id', session.userId)
      .order('data', { ascending: false })
      .limit(30),
  ]);

  if (histError) {
    return jsonError(histError.message, 500);
  }

  const list = (historico ?? []) as RegistroDia[];
  const hoje = list.find((r) => r.data === today) ?? null;

  return NextResponse.json({
    today,
    config,
    hoje,
    historico: list,
  });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const acao = body?.acao as PontoAcao | undefined;

  if (!acao || !['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida_final'].includes(acao)) {
    return jsonError('Ação de ponto inválida.');
  }

  const supabase = getSupabaseAdmin();
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from('registros_dia')
    .select('*')
    .eq('user_id', session.userId)
    .eq('data', today)
    .maybeSingle();

  if (fetchError) {
    return jsonError(fetchError.message, 500);
  }

  const current = (existing as RegistroDia | null) ?? null;
  const status = getPontoStatus(current);

  if (acao === 'entrada') {
    if (status !== 'nao_iniciado') {
      return jsonError('A entrada de hoje já foi registrada.');
    }
    const { data: inserted, error: insError } = await supabase
      .from('registros_dia')
      .insert({
        user_id: session.userId,
        data: today,
        entrada: nowIso,
      })
      .select()
      .single();

    if (insError) return jsonError(insError.message, 500);
    return NextResponse.json({ registro: inserted });
  }

  if (!current) {
    return jsonError('Registre a entrada primeiro.');
  }

  if (acao === 'saida_intervalo') {
    if (status !== 'trabalhando' || current.saida_intervalo) {
      return jsonError('Não é possível iniciar o intervalo neste momento.');
    }
  } else if (acao === 'retorno_intervalo') {
    if (status !== 'em_intervalo') {
      return jsonError('Você não está em intervalo no momento.');
    }
  } else if (acao === 'saida_final') {
    if (status !== 'trabalhando') {
      return jsonError(
        status === 'em_intervalo'
          ? 'Registre o retorno do intervalo antes de encerrar o expediente.'
          : 'O expediente já foi encerrado ou não foi iniciado.'
      );
    }
  }

  const { data: updated, error: updError } = await supabase
    .from('registros_dia')
    .update({
      [acao]: nowIso,
      updated_at: nowIso,
    })
    .eq('id', current.id)
    .select()
    .single();

  if (updError) return jsonError(updError.message, 500);
  return NextResponse.json({ registro: updated });
}
