-- OrganizaPontos - Schema SQL para Supabase (PostgreSQL)
-- Execute este script no SQL Editor do painel do Supabase.

create extension if not exists pgcrypto;

-- 1. Tabela de usuários
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Tabela de configurações de jornada (1 para 1 com usuário)
create table if not exists public.user_configs (
  user_id uuid primary key references public.users(id) on delete cascade,
  carga_horaria_minutos integer not null default 480 check (carga_horaria_minutos > 0 and carga_horaria_minutos <= 1440),
  intervalo_minutos integer not null default 60 check (intervalo_minutos >= 0 and intervalo_minutos <= 480),
  tipo_horario text not null default 'livre' check (tipo_horario in ('livre', 'fixo')),
  hora_entrada_fixa text not null default '09:00',
  hora_saida_fixa text not null default '18:00',
  updated_at timestamptz not null default now()
);

-- 3. Tabela de registros diários de ponto
create table if not exists public.registros_dia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  data date not null,
  entrada timestamptz,
  saida_intervalo timestamptz,
  retorno_intervalo timestamptz,
  saida_final timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registros_dia_user_data_unique unique (user_id, data)
);

create index if not exists idx_registros_dia_user_data on public.registros_dia (user_id, data desc);
create index if not exists idx_registros_dia_data on public.registros_dia (data desc);

-- Segurança: habilitar RLS sem políticas públicas, pois todo acesso passa
-- pelo backend Next.js usando a SUPABASE_SECRET_KEY.
alter table public.users enable row level security;
alter table public.user_configs enable row level security;
alter table public.registros_dia enable row level security;
