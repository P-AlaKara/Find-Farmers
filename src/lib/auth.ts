export type UserRole = "admin" | "farmer" | "buyer";

export interface AuthSession {
  token: string;
  role: UserRole;
  userId: string;
  email: string;
}

const KEY = "potatomarket_auth_session";

export const saveSession = (session: AuthSession) => localStorage.setItem(KEY, JSON.stringify(session));
export const getSession = (): AuthSession | null => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
};
export const clearSession = () => localStorage.removeItem(KEY);
