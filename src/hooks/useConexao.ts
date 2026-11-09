import { useCallback, useEffect, useRef, useState } from "react";
import { estadoConexao, type EstadoConexao } from "@/lib/conexao";

const INTERVALO_MS = 30_000;
const INTERVALO_OFFLINE_MS = 10_000;
const TIMEOUT_MS = 4_000;

async function ping(): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health` : "/";
    await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, {
      method: "GET", cache: "no-store", signal: ctrl.signal, mode: "no-cors",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function useConexao(): { estado: EstadoConexao; reconectar: () => void } {
  const [nav, setNav] = useState(true);
  const [pingOk, setPingOk] = useState<boolean | null>(true);
  const [checando, setChecando] = useState(false);
  const rodando = useRef(false);

  const verificar = useCallback(async () => {
    if (rodando.current) return;
    rodando.current = true;
    setChecando(true);
    const ok = typeof navigator !== "undefined" && navigator.onLine ? await ping() : false;
    setPingOk(ok);
    setChecando(false);
    rodando.current = false;
  }, []);

  useEffect(() => {
    setNav(navigator.onLine);
    const on = () => { setNav(true); void verificar(); };
    const off = () => { setNav(false); setPingOk(false); };
    const vis = () => { if (document.visibilityState === "visible") void verificar(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    void verificar();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [verificar]);

  const estado = estadoConexao(nav, pingOk, checando);
  useEffect(() => {
    const id = setInterval(() => void verificar(), estado === "online" ? INTERVALO_MS : INTERVALO_OFFLINE_MS);
    return () => clearInterval(id);
  }, [estado, verificar]);

  return { estado, reconectar: () => void verificar() };
}
