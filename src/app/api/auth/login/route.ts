import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, signSession, verifyPassword } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonError } from '@/lib/api-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return jsonError('E-mail e senha são obrigatórios.');
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, nome, email, password_hash, role, ativo')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      return jsonError('Credenciais inválidas.', 401);
    }

    if (!user.ativo) {
      return jsonError('Usuário desativado. Contate o administrador.', 403);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return jsonError('Credenciais inválidas.', 401);
    }

    const token = await signSession({
      userId: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role === 'admin' ? 'admin' : 'user',
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao autenticar.';
    return jsonError(message, 500);
  }
}
