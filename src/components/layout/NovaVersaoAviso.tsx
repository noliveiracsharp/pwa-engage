import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SEGUNDOS = 30;
const INTERVALO = 2 * 60 * 1000;
const db = supabase as any;

async function buscarBuild(): Promise<string | null> {
  try {
    const r = await fetch(`/api/public/versao?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { versao?: string };
    return j.versao ?? null;
  } catch {
    return null;
  }
}

/** Versão marcada como "Atual" em /admin/versoes. */
async function buscarVersaoAtual(): Promise<string | null> {
  try {
    const { data } = await db.from("sistema_versoes").select("versao").eq("is_atual", true)
      .order("major", { ascending: false }).order("minor", { ascending: false }).order("patch", { ascending: false }).limit(1);
    return ((data ?? [])[0]?.versao as string) ?? null;
  } catch {
    return null;
  }
}

/** Detecta nova publicação ou nova versão cadastrada, avisa com contagem e força novo login. */
export function NovaVersaoAviso() {
  const queryClient = useQueryClient();
  const baseBuild = useRef<string | null>(null);
  const baseVersao = useRef<string | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const [nova, setNova] = useState<string | null>(null);
  const executando = useRef(false);
  const avisando = useRef(false);

  useEffect(() => {
    let ativo = true;
    const disparar = (v: string | null) => {
      if (avisando.current) return;
      avisando.current = true;
      setNova(v);
      setRestante(SEGUNDOS);
    };
    const checarVersao = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return;
      const v = await buscarVersaoAtual();
      if (!ativo || !v) return;
      if (baseVersao.current === null) baseVersao.current = v;
      else if (v !== baseVersao.current) {
        queryClient.invalidateQueries({ queryKey: ["sistema_versoes"] });
        disparar(v);
      }
    };
    const checarBuild = async () => {
      if (import.meta.env.DEV) return;
      const b = await buscarBuild();
      if (!ativo || !b) return;
      if (baseBuild.current === null) baseBuild.current = b;
      else if (b !== baseBuild.current) disparar(null);
    };
    const checar = () => { void checarVersao(); void checarBuild(); };
    checar();
    const id = window.setInterval(checar, INTERVALO);
    const onVis = () => document.visibilityState === "visible" && checar();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const canal = supabase
      .channel("atendeai-versoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sistema_versoes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["sistema_versoes"] });
        void checarVersao();
      })
      .subscribe();
    return () => {
      ativo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      supabase.removeChannel(canal);
    };
  }, [queryClient]);

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
    <div data-nova-versao className="pointer-events-none fixed inset-x-0 top-0 z-[2147483000] flex justify-center p-3" style={{ pointerEvents: "none" }}>
      <div className="pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-primary/40 bg-card p-4 shadow-lg sm:flex-row sm:items-center" style={{ pointerEvents: "auto" }}>
        <Sparkles className="h-6 w-6 shrink-0 text-primary" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-foreground">
            {nova ? `Nova versão ${nova} do Atende.ai disponível!` : "Nova versão do Atende.ai disponível!"}
          </p>
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
