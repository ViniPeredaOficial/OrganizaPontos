import type { PontoStatus, RegistroDia, UserConfig } from '@/types/ponto';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Retorna a data local (YYYY-MM-DD) no fuso horário de Brasília. */
export function getTodayDateString(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getPontoStatus(registro: RegistroDia | null): PontoStatus {
  if (!registro || !registro.entrada) return 'nao_iniciado';
  if (registro.saida_final) return 'encerrado';
  if (registro.saida_intervalo && !registro.retorno_intervalo) return 'em_intervalo';
  return 'trabalhando';
}

/** Calcula os milissegundos efetivamente trabalhados até `nowMs`. */
export function getWorkedMs(registro: RegistroDia | null, nowMs: number = Date.now()): number {
  if (!registro || !registro.entrada) return 0;

  const entradaMs = new Date(registro.entrada).getTime();
  const saidaIntMs = registro.saida_intervalo ? new Date(registro.saida_intervalo).getTime() : null;
  const retornoIntMs = registro.retorno_intervalo ? new Date(registro.retorno_intervalo).getTime() : null;
  const saidaFinalMs = registro.saida_final ? new Date(registro.saida_final).getTime() : null;

  if (saidaFinalMs) {
    const breakMs = saidaIntMs && retornoIntMs ? Math.max(0, retornoIntMs - saidaIntMs) : 0;
    return Math.max(0, saidaFinalMs - entradaMs - breakMs);
  }

  if (saidaIntMs && !retornoIntMs) {
    return Math.max(0, saidaIntMs - entradaMs);
  }

  if (saidaIntMs && retornoIntMs) {
    const firstShift = Math.max(0, saidaIntMs - entradaMs);
    const secondShift = Math.max(0, nowMs - retornoIntMs);
    return firstShift + secondShift;
  }

  return Math.max(0, nowMs - entradaMs);
}

/** Calcula a duração do intervalo em ms (ou em andamento se estiver em intervalo). */
export function getBreakMs(registro: RegistroDia | null, nowMs: number = Date.now()): number {
  if (!registro || !registro.saida_intervalo) return 0;
  const start = new Date(registro.saida_intervalo).getTime();
  const end = registro.retorno_intervalo ? new Date(registro.retorno_intervalo).getTime() : nowMs;
  return Math.max(0, end - start);
}

/**
 * Constrói um Date para um horário `HH:MM` em uma data `YYYY-MM-DD` (fuso -03:00 padrão).
 */
export function parseTimeOnDate(dateStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10) || 0);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00-03:00`);
}

export interface JornadaResumo {
  status: PontoStatus;
  workedMs: number;
  breakMs: number;
  targetWorkMs: number;
  remainingMs: number;
  overtimeMs: number;
  expectedExit: Date | null;
}

export function calculateJornadaResumo(
  registro: RegistroDia | null,
  config: UserConfig,
  nowMs: number = Date.now()
): JornadaResumo {
  const status = getPontoStatus(registro);
  const workedMs = getWorkedMs(registro, nowMs);
  const breakMs = getBreakMs(registro, nowMs);
  const targetWorkMs = config.carga_horaria_minutos * 60_000;
  const plannedBreakMs = config.intervalo_minutos * 60_000;

  if (config.tipo_horario === 'fixo') {
    const dateStr = registro?.data ?? getTodayDateString(new Date(nowMs));
    const entryFixed = parseTimeOnDate(dateStr, config.hora_entrada_fixa);
    let exitFixed = parseTimeOnDate(dateStr, config.hora_saida_fixa);
    if (exitFixed.getTime() <= entryFixed.getTime()) {
      exitFixed = new Date(exitFixed.getTime() + 24 * 3600_000);
    }

    const expectedExit = exitFixed;
    if (status === 'encerrado') {
      const remainingMs = Math.max(0, targetWorkMs - workedMs);
      const overtimeMs = Math.max(0, workedMs - targetWorkMs);
      return { status, workedMs, breakMs, targetWorkMs, remainingMs, overtimeMs, expectedExit };
    }

    const diffMs = expectedExit.getTime() - nowMs;
    const remainingMs = Math.max(0, diffMs);
    const overtimeMs = diffMs < 0 ? Math.abs(diffMs) : 0;
    return { status, workedMs, breakMs, targetWorkMs, remainingMs, overtimeMs, expectedExit };
  }

  // Modo 'livre'
  let expectedExit: Date | null = null;
  if (registro?.entrada) {
    const entradaMs = new Date(registro.entrada).getTime();
    if (registro.retorno_intervalo) {
      expectedExit = new Date(entradaMs + targetWorkMs + breakMs);
    } else if (registro.saida_intervalo) {
      const effectiveBreakMs = Math.max(plannedBreakMs, breakMs);
      expectedExit = new Date(entradaMs + targetWorkMs + effectiveBreakMs);
    } else {
      expectedExit = new Date(entradaMs + targetWorkMs + plannedBreakMs);
    }
  }

  const remainingMs = Math.max(0, targetWorkMs - workedMs);
  const overtimeMs = Math.max(0, workedMs - targetWorkMs);

  return {
    status,
    workedMs,
    breakMs,
    targetWorkMs,
    remainingMs,
    overtimeMs,
    expectedExit,
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatMinutesShort(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${String(m).padStart(2, '0')}m`;
}

export function formatTimeBR(iso: string | Date | null): string {
  if (!iso) return '--:--';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: DEFAULT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
