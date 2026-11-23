import bcrypt from 'bcryptjs';

export {
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
  getSessionFromCookies,
} from '@/lib/session';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
