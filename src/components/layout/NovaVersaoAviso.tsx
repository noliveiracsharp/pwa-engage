import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SEGUNDOS = 30;
const INTERVALO = 2 * 60 * 1000;

async function buscarVersao(): Promise<string | null> {
  try {
    const r = await fetch(`/api/public/versao?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { versao?: string };
    return j.versao ?? null;
  } catch {
    return null;
  }
}

/** Detecta nova publicação, avisa com contagem regressiva e força novo login. */
export function NovaVersaoAviso() {
  const queryClient = useQueryClient();
  const base = useRef<string | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const executando = useRef(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let ativo = true;
    const checar = async () => {
      if (restante !== null) return;
      const v = await buscarVersao();
      if (!ativo || !v) return;
      if (base.current === null) base.current = v;
      else if (v !== base.current) setRestante(SEGUNDOS);
    };
    void checar();
    const id = window.setInterval(checar, INTERVALO);
    const onVis = () => document.visibilityState === "visible" && void checar();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      ativo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [restante]);

  async function atualizar() {
    if (executando.current) return;
    executando.current = true;
    try {
      queryClient.clear();
      if ("caches" in window) {
        const nomes = await caches.keys();
        await Promise.allSettled(nomes.map((n) => caches.delete(n)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map((r) => r.update()));
      }
      await supabase.auth.signOut();
    } finally {
      window.location.replace(`/login?motivo=atualizacao&_r=${Date.now()}`);
    }
  }

  useEffect(() => {
    if (restante === null) return;
    if (restante <= 0) {
      void atualizar();
      return;
    }
    const t = window.setTimeout(() => setRestante((s) => (s ?? 1) - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante]);

  if (restante === null) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center p-3">
      <div className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4 shadow-lg sm:flex-row sm:items-center">
        <Sparkles className="h-6 w-6 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-foreground">Nova versão do Atende.ai disponível!</p>
          <p className="text-muted-foreground">
            Uma atualização foi publicada. O sistema será atualizado e você fará login novamente em{" "}
            <strong className="text-foreground">{Math.max(restante, 0)}s</strong>.
          </p>
        </div>
        <Button onClick={atualizar}>Atualizar agora</Button>
      </div>
    </div>
  );
}
