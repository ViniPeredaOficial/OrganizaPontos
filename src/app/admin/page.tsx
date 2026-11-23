'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Edit3,
  Plus,
  Save,
  Shield,
  Users,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  formatMinutesShort,
  formatTimeBR,
  getBreakMs,
  getPontoStatus,
  getWorkedMs,
} from '@/lib/ponto-calc';
import type { RegistroDia, TipoHorario, UserRole, UserWithConfig } from '@/types/ponto';

type AdminTab = 'graficos' | 'usuarios' | 'pontos';

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AdminTab>('graficos');
  const [users, setUsers] = useState<UserWithConfig[]>([]);
  const [registros, setRegistros] = useState<RegistroDia[]>([]);
  const [today, setToday] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [days, setDays] = useState<number>(14);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal de criar usuário
  const [showNewUser, setShowNewUser] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [newCarga, setNewCarga] = useState(480);
  const [newIntervalo, setNewIntervalo] = useState(60);
  const [newTipo, setNewTipo] = useState<TipoHorario>('livre');
  const [newEntFixa, setNewEntFixa] = useState('09:00');
  const [newSaiFixa, setNewSaiFixa] = useState('18:00');

  // Edição de usuário + config
  const [editingUser, setEditingUser] = useState<UserWithConfig | null>(null);
  const [editPassword, setEditPassword] = useState('');

  // Edição de registro de ponto
  const [editingReg, setEditingReg] = useState<{
    user_id: string;
    data: string;
    entrada: string;
    saida_intervalo: string;
    retorno_intervalo: string;
    saida_final: string;
    observacao: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/registros?userId=${encodeURIComponent(selectedUserId)}&days=${days}`
      );
      if (res.status === 401 || res.status === 403) {
        router.push('/');
        return;
      }
      const data = await res.json();
      setUsers(data.users ?? []);
      setRegistros(data.registros ?? []);
      setToday(data.today ?? '');
    } catch {
      setFeedback({ type: 'err', text: 'Erro ao carregar dados administrativos.' });
    } finally {
      setLoading(false);
    }
  }, [days, router, selectedUserId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(t);
  }, [loadAll]);

  const userMap = useMemo(() => {
    const m = new Map<string, UserWithConfig>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  // Dados para gráficos
  const chartData = useMemo(() => {
    const byDate = new Map<
      string,
      { data: string; trabalhadoH: number; metaH: number; saldoH: number; intervaloMin: number; count: number }
    >();

    for (const r of registros) {
      const u = userMap.get(r.user_id);
      const metaMin = u?.config.carga_horaria_minutos ?? 480;
      const workedMin = getWorkedMs(r) / 60_000;
      const breakMin = getBreakMs(r) / 60_000;

      const cur = byDate.get(r.data) ?? {
        data: r.data.slice(5), // MM-DD
        trabalhadoH: 0,
        metaH: 0,
        saldoH: 0,
        intervaloMin: 0,
        count: 0,
      };
      cur.trabalhadoH += workedMin / 60;
      cur.metaH += metaMin / 60;
      cur.saldoH += r.saida_final ? (workedMin - metaMin) / 60 : 0;
      cur.intervaloMin += breakMin;
      cur.count += 1;
      byDate.set(r.data, cur);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        data: v.data,
        trabalhadoH: Number(v.trabalhadoH.toFixed(2)),
        metaH: Number(v.metaH.toFixed(2)),
        saldoH: Number(v.saldoH.toFixed(2)),
        intervaloMedioMin: v.count > 0 ? Math.round(v.intervaloMin / v.count) : 0,
      }));
  }, [registros, userMap]);

  const resumoGeral = useMemo(() => {
    let totalWorkedMin = 0;
    let totalSaldoMin = 0;
    let finishedCount = 0;
    for (const r of registros) {
      const u = userMap.get(r.user_id);
      const meta = u?.config.carga_horaria_minutos ?? 480;
      const worked = getWorkedMs(r) / 60_000;
      totalWorkedMin += worked;
      if (r.saida_final) {
        totalSaldoMin += worked - meta;
        finishedCount += 1;
      }
    }
    return { totalWorkedMin, totalSaldoMin, finishedCount };
  }, [registros, userMap]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: newNome,
        email: newEmail,
        password: newPassword,
        role: newRole,
        config: {
          carga_horaria_minutos: newCarga,
          intervalo_minutos: newIntervalo,
          tipo_horario: newTipo,
          hora_entrada_fixa: newEntFixa,
          hora_saida_fixa: newSaiFixa,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: data.error || 'Erro ao criar usuário.' });
      return;
    }
    setShowNewUser(false);
    setNewNome('');
    setNewEmail('');
    setNewPassword('');
    setFeedback({ type: 'ok', text: 'Usuário criado com sucesso!' });
    await loadAll();
  }

  async function handleSaveUserEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setFeedback(null);
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: editingUser.nome,
        email: editingUser.email,
        role: editingUser.role,
        ativo: editingUser.ativo,
        password: editPassword || undefined,
        config: editingUser.config,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: data.error || 'Erro ao atualizar usuário.' });
      return;
    }
    setEditingUser(null);
    setEditPassword('');
    setFeedback({ type: 'ok', text: 'Configurações e usuário atualizados!' });
    await loadAll();
  }

  function isoToLocalHHMM(iso: string | null): string {
    if (!iso) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  function hhmmToIsoOnDate(dateStr: string, hhmm: string): string | null {
    if (!hhmm.trim()) return null;
    return `${dateStr}T${hhmm.trim()}:00-03:00`;
  }

  async function handleSaveRegistro(e: React.FormEvent) {
    e.preventDefault();
    if (!editingReg) return;
    setFeedback(null);

    const res = await fetch('/api/admin/registros', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: editingReg.user_id,
        data: editingReg.data,
        entrada: hhmmToIsoOnDate(editingReg.data, editingReg.entrada),
        saida_intervalo: hhmmToIsoOnDate(editingReg.data, editingReg.saida_intervalo),
        retorno_intervalo: hhmmToIsoOnDate(editingReg.data, editingReg.retorno_intervalo),
        saida_final: hhmmToIsoOnDate(editingReg.data, editingReg.saida_final),
        observacao: editingReg.observacao,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'err', text: data.error || 'Erro ao salvar ponto.' });
      return;
    }
    setEditingReg(null);
    setFeedback({ type: 'ok', text: 'Registro de ponto atualizado!' });
    await loadAll();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center">
        <div className="animate-pulse text-sm">Carregando painel administrativo...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">Administração — OrganizaPontos</h1>
              <p className="text-xs text-slate-400">Gráficos, jornadas e gestão de colaboradores</p>
            </div>
          </div>

          <Link
            href="/"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao Meu Ponto
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-sm border ${
              feedback.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.text}
          </div>
        )}

        {/* Navegação de Abas */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setTab('graficos')}
            className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition cursor-pointer ${
              tab === 'graficos'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Gráficos e Controle
          </button>
          <button
            onClick={() => setTab('usuarios')}
            className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition cursor-pointer ${
              tab === 'usuarios'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Usuários e Configurações
          </button>
          <button
            onClick={() => setTab('pontos')}
            className={`px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition cursor-pointer ${
              tab === 'pontos'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            Ajuste de Pontos
          </button>
        </div>

        {/* ABA 1: GRÁFICOS */}
        {tab === 'graficos' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  <option value="all">Todos os colaboradores</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>

                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  <option value={7}>Últimos 7 dias</option>
                  <option value={14}>Últimos 14 dias</option>
                  <option value={30}>Últimos 30 dias</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-slate-400 text-xs block">Total trabalhado</span>
                  <span className="font-mono font-bold">
                    {formatMinutesShort(resumoGeral.totalWorkedMin)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block">Saldo (dias fechados)</span>
                  <span
                    className={`font-mono font-bold ${
                      resumoGeral.totalSaldoMin >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {resumoGeral.totalSaldoMin >= 0 ? '+' : ''}
                    {formatMinutesShort(resumoGeral.totalSaldoMin)}
                  </span>
                </div>
              </div>
            </div>

            {/* Status ao vivo hoje */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold mb-3">Status Hoje ({today})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {users
                  .filter((u) => u.ativo)
                  .map((u) => {
                    const reg = registros.find((r) => r.user_id === u.id && r.data === today) ?? null;
                    const st = getPontoStatus(reg);
                    const labelMap = {
                      nao_iniciado: 'Não iniciou',
                      trabalhando: 'Trabalhando',
                      em_intervalo: 'Em intervalo',
                      encerrado: 'Encerrado',
                    };
                    return (
                      <div
                        key={u.id}
                        className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">{u.nome}</p>
                          <p className="text-xs text-slate-400">
                            Entrada: {formatTimeBR(reg?.entrada ?? null)} •{' '}
                            {u.config.tipo_horario === 'fixo'
                              ? `${u.config.hora_entrada_fixa}-${u.config.hora_saida_fixa}`
                              : `${u.config.carga_horaria_minutos / 60}h livre`}
                          </p>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-200">
                          {labelMap[st]}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Gráficos Recharts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold mb-4">Horas Trabalhadas vs. Meta Diária</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} unit="h" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="trabalhadoH" name="Trabalhado (h)" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="metaH" name="Meta (h)" fill="#334155" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold mb-4">Saldo Diário (Horas) e Intervalo Médio</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="data" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="saldoH" name="Saldo (h)" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar
                        dataKey="intervaloMedioMin"
                        name="Intervalo Médio (min)"
                        fill="#f59e0b"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: USUÁRIOS E CONFIGURAÇÕES */}
        {tab === 'usuarios' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-400">
                Gerencie usuários e defina a carga horária, intervalo e modo (livre ou fixo) de cada pessoa.
              </p>
              <button
                onClick={() => setShowNewUser(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Novo Usuário
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{u.nome}</h3>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            u.role === 'admin'
                              ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                        {!u.ativo && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300">
                            Inativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        setEditingUser(JSON.parse(JSON.stringify(u)));
                        setEditPassword('');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
                    <div>
                      <span className="text-slate-500 block">Carga</span>
                      <span className="font-mono font-semibold">
                        {formatMinutesShort(u.config.carga_horaria_minutos)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Almoço/Janta</span>
                      <span className="font-mono font-semibold">
                        {formatMinutesShort(u.config.intervalo_minutos)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Regime</span>
                      <span className="font-mono font-semibold">
                        {u.config.tipo_horario === 'fixo'
                          ? `${u.config.hora_entrada_fixa}-${u.config.hora_saida_fixa}`
                          : 'Livre'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 3: AJUSTE DE PONTOS */}
        {tab === 'pontos' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Registros de Ponto ({registros.length})</h2>
              <button
                onClick={() => {
                  const firstUser = users[0]?.id ?? '';
                  setEditingReg({
                    user_id: firstUser,
                    data: today,
                    entrada: '09:00',
                    saida_intervalo: '12:00',
                    retorno_intervalo: '13:00',
                    saida_final: '18:00',
                    observacao: 'Ajuste manual',
                  });
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Lançar / Corrigir Dia
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 pr-3">Colaborador</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-3">Entrada</th>
                    <th className="py-2.5 px-3">Saída Int.</th>
                    <th className="py-2.5 px-3">Retorno</th>
                    <th className="py-2.5 px-3">Saída</th>
                    <th className="py-2.5 pl-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {registros.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-3 font-medium">
                        {userMap.get(r.user_id)?.nome ?? 'Usuário'}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">{r.data}</td>
                      <td className="py-3 px-3 font-mono">{formatTimeBR(r.entrada)}</td>
                      <td className="py-3 px-3 font-mono">{formatTimeBR(r.saida_intervalo)}</td>
                      <td className="py-3 px-3 font-mono">{formatTimeBR(r.retorno_intervalo)}</td>
                      <td className="py-3 px-3 font-mono">{formatTimeBR(r.saida_final)}</td>
                      <td className="py-3 pl-3 text-right">
                        <button
                          onClick={() =>
                            setEditingReg({
                              user_id: r.user_id,
                              data: r.data,
                              entrada: isoToLocalHHMM(r.entrada),
                              saida_intervalo: isoToLocalHHMM(r.saida_intervalo),
                              retorno_intervalo: isoToLocalHHMM(r.retorno_intervalo),
                              saida_final: isoToLocalHHMM(r.saida_final),
                              observacao: r.observacao ?? '',
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs cursor-pointer"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: NOVO USUÁRIO */}
      {showNewUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateUser}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Novo Usuário</h3>
              <button type="button" onClick={() => setShowNewUser(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input
                  required
                  value={newNome}
                  onChange={(e) => setNewNome(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cargo</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  <option value="user">Colaborador (user)</option>
                  <option value="admin">Administrador (admin)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Senha inicial</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
            </div>

            <hr className="border-slate-800" />
            <p className="text-xs font-semibold text-indigo-300">Configuração de Jornada</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Carga horária (minutos)</label>
                <input
                  type="number"
                  min={60}
                  max={1440}
                  value={newCarga}
                  onChange={(e) => setNewCarga(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setNewCarga(360)}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    6h (360m)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCarga(480)}
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    8h (480m)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Almoço / Janta (minutos)</label>
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={newIntervalo}
                  onChange={(e) => setNewIntervalo(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo de Horário</label>
              <select
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value as TipoHorario)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              >
                <option value="livre">Horário Livre (entra quando quiser)</option>
                <option value="fixo">Horário Fixo (entrada e saída definidas)</option>
              </select>
            </div>

            {newTipo === 'fixo' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Entrada Fixa</label>
                  <input
                    type="time"
                    value={newEntFixa}
                    onChange={(e) => setNewEntFixa(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Saída Fixa</label>
                  <input
                    type="time"
                    value={newSaiFixa}
                    onChange={(e) => setNewSaiFixa(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm cursor-pointer"
            >
              Criar Usuário
            </button>
          </form>
        </div>
      )}

      {/* MODAL: EDITAR USUÁRIO + CONFIGURAÇÕES */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveUserEdit}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Editar: {editingUser.nome}</h3>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input
                  required
                  value={editingUser.nome}
                  onChange={(e) => setEditingUser({ ...editingUser, nome: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cargo</label>
                <select
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, role: e.target.value as UserRole })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  <option value="user">Colaborador (user)</option>
                  <option value="admin">Administrador (admin)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nova senha (opcional)</label>
                <input
                  type="password"
                  placeholder="Deixe vazio para manter"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.ativo}
                    onChange={(e) => setEditingUser({ ...editingUser, ativo: e.target.checked })}
                  />
                  Usuário ativo
                </label>
              </div>
            </div>

            <hr className="border-slate-800" />
            <p className="text-xs font-semibold text-indigo-300">Configurações de Jornada</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Carga horária (minutos)</label>
                <input
                  type="number"
                  min={30}
                  max={1440}
                  value={editingUser.config.carga_horaria_minutos}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      config: {
                        ...editingUser.config,
                        carga_horaria_minutos: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingUser({
                        ...editingUser,
                        config: { ...editingUser.config, carga_horaria_minutos: 360 },
                      })
                    }
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    6h
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingUser({
                        ...editingUser,
                        config: { ...editingUser.config, carga_horaria_minutos: 480 },
                      })
                    }
                    className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
                  >
                    8h
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Almoço / Janta (minutos)</label>
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={editingUser.config.intervalo_minutos}
                  onChange={(e) =>
                    setEditingUser({
                      ...editingUser,
                      config: {
                        ...editingUser.config,
                        intervalo_minutos: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Tipo de Horário</label>
              <select
                value={editingUser.config.tipo_horario}
                onChange={(e) =>
                  setEditingUser({
                    ...editingUser,
                    config: {
                      ...editingUser.config,
                      tipo_horario: e.target.value as TipoHorario,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              >
                <option value="livre">Horário Livre</option>
                <option value="fixo">Horário Fixo</option>
              </select>
            </div>

            {editingUser.config.tipo_horario === 'fixo' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Entrada Fixa</label>
                  <input
                    type="time"
                    value={editingUser.config.hora_entrada_fixa}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        config: { ...editingUser.config, hora_entrada_fixa: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Saída Fixa</label>
                  <input
                    type="time"
                    value={editingUser.config.hora_saida_fixa}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        config: { ...editingUser.config, hora_saida_fixa: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Salvar Alterações
            </button>
          </form>
        </div>
      )}

      {/* MODAL: EDITAR PONTO */}
      {editingReg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveRegistro}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Ajustar Ponto</h3>
              <button type="button" onClick={() => setEditingReg(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Colaborador</label>
                <select
                  value={editingReg.user_id}
                  onChange={(e) => setEditingReg({ ...editingReg, user_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={editingReg.data}
                  onChange={(e) => setEditingReg({ ...editingReg, data: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Entrada</label>
                <input
                  type="time"
                  value={editingReg.entrada}
                  onChange={(e) => setEditingReg({ ...editingReg, entrada: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Saída Almoço/Janta</label>
                <input
                  type="time"
                  value={editingReg.saida_intervalo}
                  onChange={(e) => setEditingReg({ ...editingReg, saida_intervalo: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Retorno Intervalo</label>
                <input
                  type="time"
                  value={editingReg.retorno_intervalo}
                  onChange={(e) =>
                    setEditingReg({ ...editingReg, retorno_intervalo: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Saída Final</label>
                <input
                  type="time"
                  value={editingReg.saida_final}
                  onChange={(e) => setEditingReg({ ...editingReg, saida_final: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Observação</label>
              <input
                value={editingReg.observacao}
                onChange={(e) => setEditingReg({ ...editingReg, observacao: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm cursor-pointer"
            >
              Salvar Ponto
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
