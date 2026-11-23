import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { DEFAULT_USER_CONFIG, jsonError } from '@/lib/api-helpers';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json(
        { needsSetup: false, dbError: 'Tabela users não encontrada. Execute o schema.sql no Supabase.' },
        { status: 200 }
      );
    }

    return NextResponse.json({ needsSetup: (count ?? 0) === 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao verificar banco.';
    return jsonError(message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error: countError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      return jsonError('Erro ao acessar tabela users. Execute o schema.sql no Supabase.', 500);
    }

    if ((count ?? 0) > 0) {
      return jsonError('O sistema já possui usuários cadastrados.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const nome = String(body.nome || process.env.ADMIN_INIT_NAME || 'Administrador').trim();
    const email = String(body.email || process.env.ADMIN_INIT_EMAIL || 'admin@organizapontos.local')
      .trim()
      .toLowerCase();
    const password = String(body.password || process.env.ADMIN_INIT_PASSWORD || '');

    if (!email || password.length < 6) {
      return jsonError('Informe um e-mail válido e senha com pelo menos 6 caracteres.');
    }

    const password_hash = await hashPassword(password);

    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert({
        nome,
        email,
        password_hash,
        role: 'admin',
        ativo: true,
      })
      .select('id, nome, email, role, ativo, created_at')
      .single();

    if (insertError || !user) {
      return jsonError(insertError?.message || 'Falha ao criar administrador.', 500);
    }

    await supabase.from('user_configs').insert({
      user_id: user.id,
      ...DEFAULT_USER_CONFIG,
    });

    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro interno no setup.';
    return jsonError(message, 500);
  }
}
