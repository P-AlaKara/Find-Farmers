import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "farmer" | "buyer";

export interface AuthSession {
  token: string;
  role: UserRole;
  userId: string;
  email: string;
}

export const roleHome = (role: UserRole) => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "farmer") return "/farmer/dashboard";
  return "/buyer/dashboard";
};

// Single auth path for runtime: custom api-auth + local session storage.
// Do not mix with supabase.auth sessions unless a full migration is done.
const KEY = "potatomarket_auth_session";

export const saveSession = (session: AuthSession) => localStorage.setItem(KEY, JSON.stringify(session));
export const getSession = (): AuthSession | null => {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
};
export const clearSession = () => localStorage.removeItem(KEY);

export const signOut = async () => {
  clearSession();
  await supabase.auth.signOut();
};

export const getAppBaseUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).toString();

export const getOAuthCallbackUrl = () => {
  return getAppBaseUrl();
};

export const getHashRouteUrl = (path: string) => `${getAppBaseUrl()}#${path}`;
