import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";

const CTX_KEY = "atendeai.empresaContexto";
/** Mude este valor a cada atualização publicada: força novo login de todos. */
const APP_RELEASE = "2026-10-30-gravacao-chamadas";
const RELEASE_KEY = "atendeai.release";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  usuario: Row | null;
  /** Empresa efetiva: para o Master, a escolhida no "Contexto da Empresa". */
  empresa: Row | null;
  /** Empresa original do usuário logado. */
  empresaOriginal: Row | null;
  isMaster: boolean;
  empresaContextoId: string | null;
  setEmpresaContexto: (id: string | null) => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUsuario: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  usuario: null,
  empresa: null,
  empresaOriginal: null,
  isMaster: false,
  empresaContextoId: null,
  setEmpresaContexto: () => {},
  loading: true,
  signOut: async () => {},
  refreshUsuario: () => {},
});

/** Busca o cadastro do usuário logado. Lança erro em falha de rede (para não "perder" o usuário). */
export async function loadUsuario(user: User) {
  const byId = await supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle();
  if (byId.data) return byId.data as Row;
  if (user.email) {
    const byEmail = await supabase.from("usuarios").select("*").eq("email", user.email).maybeSingle();
    if (byEmail.data) return byEmail.data as Row;
    if (byEmail.error && byId.error) throw byEmail.error;
  } else if (byId.error) throw byId.error;
  return null;
}
const USUARIO_CACHE = "atendeai.usuarioCache";

/** Master = perfil com ordem 0 (ou descrição contendo "Master"). */
export async function isPerfilMaster(perfilId: unknown): Promise<boolean> {
  if (perfilId === undefined || perfilId === null || String(perfilId) === "") return false;
  const { data } = await supabase.from("perfil").select("*").eq("id", perfilId as never).maybeSingle();
  if (!data) return false;
  const p = data as Row;
  return Number(p["ordem"]) === 0 || /master/i.test(String(p["descricao"] ?? ""));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [usuario, setUsuario] = useState<Row | null>(null);
  const [empresaOriginal, setEmpresaOriginal] = useState<Row | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [ctxId, setCtxId] = useState<string | null>(null);
  const [ctxEmpresa, setCtxEmpresa] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setCtxId(localStorage.getItem(CTX_KEY));
    if (localStorage.getItem(RELEASE_KEY) !== APP_RELEASE) {
      localStorage.setItem(RELEASE_KEY, APP_RELEASE);
      void supabase.auth.getSession().then(async ({ data }) => {
        if (data.session) {
          await supabase.auth.signOut();
          window.location.replace((await import("@/lib/marca-publica")).urlLogin("motivo=atualizacao"));
        }
      });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (_event === "SIGNED_IN" || _event === "SIGNED_OUT" || _event === "USER_UPDATED") {
        void import("@/lib/access").then((m) => m.clearAccessCache());
      }
      if (!nextSession) {
        sessionStorage.removeItem(USUARIO_CACHE);
        setUsuario(null);
        setEmpresaOriginal(null);
        setIsMaster(false);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    let cancelled = false;
    // Restaura o último cadastro conhecido deste usuário enquanto recarrega.
    try {
      const c = JSON.parse(sessionStorage.getItem(USUARIO_CACHE) ?? "null") as { uid: string; u: Row; m: boolean } | null;
      if (c && c.uid === user.id) { setUsuario((prev) => prev ?? c.u); setIsMaster((prev) => prev || c.m); }
    } catch { /* ignore */ }
    (async () => {
      let u: Row | null = null;
      for (let tentativa = 0; tentativa < 4 && !cancelled; tentativa++) {
        try { u = await loadUsuario(user); break; }
        catch { await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1))); }
      }
      if (cancelled || !u) return; // falha temporária: mantém o usuário atual em vez de zerar
      try {
        setUsuario(u);
        const master = await isPerfilMaster(pick(u, ["perfil_id", "id_perfil"]));
        if (!cancelled) {
          setIsMaster(master);
          sessionStorage.setItem(USUARIO_CACHE, JSON.stringify({ uid: user.id, u, m: master }));
        }
        const empresaId = pick<string | number>(u, ["empresa_id", "id_empresa", "empresaid"]);
        if (empresaId !== undefined) {
          const { data } = await supabase.from("empresas").select("*").eq("id", empresaId).maybeSingle();
          if (!cancelled) setEmpresaOriginal((data as Row) ?? null);
        } else {
          const { data } = await supabase.from("empresas").select("*").limit(1).maybeSingle();
          if (!cancelled) setEmpresaOriginal((data as Row) ?? null);
        }
      } catch {
        /* schema tolerante: segue sem dados complementares */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, version]);

  useEffect(() => {
    if (!isMaster || !ctxId) {
      setCtxEmpresa(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("empresas")
      .select("*")
      .eq("id", ctxId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCtxEmpresa((data as Row) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [isMaster, ctxId]);

  const setEmpresaContexto = useCallback((id: string | null) => {
    setCtxId(id);
    if (id) localStorage.setItem(CTX_KEY, id);
    else localStorage.removeItem(CTX_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      usuario,
      empresa: (isMaster && ctxEmpresa) || empresaOriginal,
      empresaOriginal,
      isMaster,
      empresaContextoId: isMaster ? ctxId : null,
      setEmpresaContexto,
      refreshUsuario: () => setVersion((v) => v + 1),
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, usuario, empresaOriginal, isMaster, ctxEmpresa, ctxId, setEmpresaContexto, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
