import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  usuario: Row | null;
  empresa: Row | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  usuario: null,
  empresa: null,
  loading: true,
  signOut: async () => {},
});

async function loadUsuario(user: User) {
  const byAuth = await supabase.from("usuarios").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (byAuth.data) return byAuth.data as Row;
  const byId = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  if (byId.data) return byId.data as Row;
  const byEmail = await supabase
    .from("usuarios")
    .select("*")
    .eq("email", user.email ?? "")
    .maybeSingle();
  return (byEmail.data as Row) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Row | null>(null);
  const [empresa, setEmpresa] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setUsuario(null);
        setEmpresa(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await loadUsuario(user);
        if (cancelled) return;
        setUsuario(u);
        const empresaId = pick<string | number>(u, ["empresa_id", "id_empresa", "empresaid"]);
        if (empresaId !== undefined) {
          const { data } = await supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle();
          if (!cancelled) setEmpresa((data as Row) ?? null);
        } else {
          const { data } = await supabase.from("empresas").select("*").limit(1).maybeSingle();
          if (!cancelled) setEmpresa((data as Row) ?? null);
        }
      } catch {
        /* schema tolerante: segue sem dados complementares */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      usuario,
      empresa,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, usuario, empresa, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
