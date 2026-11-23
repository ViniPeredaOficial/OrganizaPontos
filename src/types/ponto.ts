export type UserRole = 'admin' | 'user';
export type TipoHorario = 'livre' | 'fixo';
export type PontoStatus = 'nao_iniciado' | 'trabalhando' | 'em_intervalo' | 'encerrado';
export type PontoAcao = 'entrada' | 'saida_intervalo' | 'retorno_intervalo' | 'saida_final';

export interface UserRecord {
  id: string;
  nome: string;
  email: string;
  password_hash?: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
}

export interface UserConfig {
  user_id: string;
  carga_horaria_minutos: number;
  intervalo_minutos: number;
  tipo_horario: TipoHorario;
  hora_entrada_fixa: string;
  hora_saida_fixa: string;
  updated_at?: string;
}

export interface UserWithConfig extends Omit<UserRecord, 'password_hash'> {
  config: UserConfig;
}

export interface RegistroDia {
  id: string;
  user_id: string;
  data: string; // YYYY-MM-DD
  entrada: string | null;
  saida_intervalo: string | null;
  retorno_intervalo: string | null;
  saida_final: string | null;
  observacao: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  nome: string;
  role: UserRole;
}
