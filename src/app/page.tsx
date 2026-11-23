'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Play,
  Shield,
  Square,
  Calendar,
  Timer,
} from 'lucide-react';
import {
  calculateJornadaResumo,
  formatDuration,
  formatMinutesShort,
  formatTimeBR,
  getBreakMs,
  getWorkedMs,
} from '@/lib/ponto-calc';
import type { PontoAcao, RegistroDia, UserConfig, UserRecord } from '@/types/ponto';

const STATUS_LABELS = {
  nao_iniciado: { label: 'Não iniciado', cls: 'bg-slate-800 text-slate-300 border-slate-700' },
  trabalhando: { label: 'Trabalhando', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  em_intervalo: { label: 'Em almoço / janta', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  encerrado: { label: 'Expediente encerrado', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<Omit<UserRecord, 'password_hash'> | null>(null);
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [hoje, setHoje] = useState<RegistroDia | null>(null);
  const [historico, setHistorico] = useState<RegistroDia[]>([]);
  const [nowMs, setNowMs] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [meRes, pontoRes] = await Promise.all([fetch('/api/auth/me'), fetch('/api/ponto')]);
      if (meRes.status === 401 || pontoRes.status === 401) {
        router.push('/login');
        return;
      }
      const meData = await meRes.json();
      const pontoData = await pontoRes.json();
      setUser(meData.user);
      setConfig(pontoData.config);
      setHoje(pontoData.hoje);
      setHistorico(pontoData.historico ?? []);
    } catch {
      setError('Erro ao carregar dados do ponto.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  useEffect(() => {
    const t = setTimeout(() => setNowMs(Date.now()), 0);
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  async function registrarPonto(acao: PontoAcao) {
    setError(null);
    setActionLoading(true);
    try {
      const res = await fetch('/api/ponto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Não foi possível registrar.');
        return;
      }
      await loadData();
    } catch {
      setError('Erro de conexão ao registrar ponto.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  if (loading || !config || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        <div className="animate-pulse text-sm">Carregando seu ponto...</div>
      </div>
    );
  }

  const resumo = calculateJornadaResumo(hoje, config, nowMs);
  const badge = STATUS_LABELS[resumo.status];
  const currentTimeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(nowMs));

  const currentDateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(nowMs));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">OrganizaPontos</h1>
              <p className="text-xs text-slate-400">Olá, {user.nome}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Shield className="w-3.5 h-3.5" />
                Painel Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Card Principal */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 capitalize">{currentDateStr}</p>
                <div className="text-4xl font-mono font-bold tracking-tight mt-1">{currentTimeStr}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-indigo-400" />
                  {resumo.overtimeMs > 0 ? 'Hora extra' : 'Falta para sair'}
                </p>
                <p
                  className={`text-2xl font-mono font-bold mt-1.5 ${
                    resumo.overtimeMs > 0 ? 'text-emerald-400' : 'text-slate-100'
                  }`}
                >
                  {resumo.status === 'nao_iniciado'
                    ? formatDuration(resumo.targetWorkMs)
                    : resumo.overtimeMs > 0
                    ? `+${formatDuration(resumo.overtimeMs)}`
                    : formatDuration(resumo.remainingMs)}
                </p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
                <p className="text-xs text-slate-400">Previsão de saída</p>
                <p className="text-2xl font-mono font-bold mt-1.5 text-indigo-300">
                  {resumo.expectedExit ? formatTimeBR(resumo.expectedExit) : '--:--'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {config.tipo_horario === 'fixo'
                    ? `Fixo (${config.hora_entrada_fixa} - ${config.hora_saida_fixa})`
                    : 'Horário livre'}
                </p>
              </div>

              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4">
                <p className="text-xs text-slate-400">Trabalhado hoje</p>
                <p className="text-2xl font-mono font-bold mt-1.5 text-slate-100">
                  {formatDuration(resumo.workedMs)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Meta: {formatMinutesShort(config.carga_horaria_minutos)} • Intervalo:{' '}
                  {formatMinutesShort(config.intervalo_minutos)}
                </p>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-wrap gap-3">
              {resumo.status === 'nao_iniciado' && (
                <button
                  onClick={() => registrarPonto('entrada')}
                  disabled={actionLoading}
                  className="flex-1 min-w-[200px] py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  Registrar Entrada
                </button>
              )}

              {resumo.status === 'trabalhando' && (
                <>
                  {!hoje?.saida_intervalo && (
                    <button
                      onClick={() => registrarPonto('saida_intervalo')}
                      disabled={actionLoading}
                      className="flex-1 min-w-[180px] py-3 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Coffee className="w-4 h-4" />
                      Sair para Almoço / Janta
                    </button>
                  )}
                  <button
                    onClick={() => registrarPonto('saida_final')}
                    disabled={actionLoading}
                    className="flex-1 min-w-[180px] py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    Encerrar Expediente
                  </button>
                </>
              )}

              {resumo.status === 'em_intervalo' && (
                <button
                  onClick={() => registrarPonto('retorno_intervalo')}
                  disabled={actionLoading}
                  className="flex-1 min-w-[200px] py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  Retornar do Almoço / Janta
                </button>
              )}

              {resumo.status === 'encerrado' && (
                <div className="w-full py-3 px-4 rounded-xl bg-slate-800/70 border border-slate-700 text-center text-sm text-slate-300">
                  Ponto de hoje finalizado. Bom descanso!
                </div>
              )}
            </div>
          </div>

          {/* Batidas de Hoje */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Registros de Hoje
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Entrada</span>
                <span className="font-mono font-semibold">{formatTimeBR(hoje?.entrada ?? null)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Saída Almoço/Janta</span>
                <span className="font-mono font-semibold">
                  {formatTimeBR(hoje?.saida_intervalo ?? null)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Retorno Intervalo</span>
                <span className="font-mono font-semibold">
                  {formatTimeBR(hoje?.retorno_intervalo ?? null)}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-slate-400">Saída Final</span>
                <span className="font-mono font-semibold">{formatTimeBR(hoje?.saida_final ?? null)}</span>
              </div>
            </div>

            {hoje?.saida_intervalo && (
              <p className="text-xs text-slate-400 mt-4">
                Duração do intervalo:{' '}
                <span className="font-mono text-slate-200">
                  {formatMinutesShort(getBreakMs(hoje, nowMs) / 60_000)}
                </span>
              </p>
            )}
          </div>
        </section>

        {/* Histórico Pessoal */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Histórico Recente (30 dias)</h2>
          {historico.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum registro encontrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 pr-4">Data</th>
                    <th className="py-2.5 px-3">Entrada</th>
                    <th className="py-2.5 px-3">Saída Int.</th>
                    <th className="py-2.5 px-3">Retorno Int.</th>
                    <th className="py-2.5 px-3">Saída</th>
                    <th className="py-2.5 px-3">Trabalhado</th>
                    <th className="py-2.5 pl-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {historico.map((reg) => {
                    const workedMin = getWorkedMs(reg, nowMs) / 60_000;
                    const saldoMin = reg.saida_final
                      ? workedMin - config.carga_horaria_minutos
                      : null;

                    return (
                      <tr key={reg.id} className="hover:bg-slate-800/30">
                        <td className="py-3 pr-4 font-mono text-xs text-slate-300">{reg.data}</td>
                        <td className="py-3 px-3 font-mono">{formatTimeBR(reg.entrada)}</td>
                        <td className="py-3 px-3 font-mono">{formatTimeBR(reg.saida_intervalo)}</td>
                        <td className="py-3 px-3 font-mono">{formatTimeBR(reg.retorno_intervalo)}</td>
                        <td className="py-3 px-3 font-mono">{formatTimeBR(reg.saida_final)}</td>
                        <td className="py-3 px-3 font-mono text-slate-200">
                          {formatMinutesShort(workedMin)}
                        </td>
                        <td className="py-3 pl-3 text-right font-mono">
                          {saldoMin === null ? (
                            <span className="text-slate-500">--</span>
                          ) : (
                            <span className={saldoMin >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {saldoMin >= 0 ? '+' : ''}
                              {formatMinutesShort(saldoMin)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
