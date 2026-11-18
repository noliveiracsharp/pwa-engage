import { useQuery } from "@tanstack/react-query";
import { Loader2, PhoneOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Discador interno: reaproveita o mesmo discador/motor do QR do portão (um só caminho de chamada). */
export function DiscadorInterno({ condominioId }: { condominioId: string }) {
  const q = useQuery({
    queryKey: ["cond", "interfone_slug", condominioId],
    enabled: !!condominioId,
    queryFn: async () => { const r = await db.rpc("cond_interfone_slug", { p_condominio: condominioId }); if (r.error) throw r.error; return (r.data ?? "") as string; },
  });
  if (q.isLoading) return <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando discador" /></div>;
  if (q.error || !q.data) return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
      <PhoneOff className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">Interfone indisponível</p>
      <p className="max-w-sm text-sm text-muted-foreground">{q.error ? "Não foi possível abrir o discador agora. Tente novamente em instantes." : "A administração ainda não ativou o Interfone Virtual neste condomínio."}</p>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border bg-card">
      <iframe title="Discador do interfone" src={`/interfone/${q.data}`} allow="camera; microphone; geolocation; autoplay" className="h-[min(78dvh,760px)] w-full border-0" />
    </div>
  );
}
