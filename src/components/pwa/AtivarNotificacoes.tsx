import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ativarPush, estadoPush, sincronizarPush, type EstadoPush } from "@/lib/push";

const CHAVE = "conectcon-push-adiado";
const ADIAR_MS = 3 * 864e5;

/** Convite para ligar as notificações do aparelho (interfone, atendimentos, avisos da equipe). */
export function AtivarNotificacoes() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    void estadoPush().then((e) => {
      if (!vivo) return;
      if (e === "ativo") { void sincronizarPush(); return; }
      const adiado = Number(localStorage.getItem(CHAVE) ?? 0);
      if ((e === "pendente" || e === "instalar_ios") && Date.now() - adiado > ADIAR_MS) setEstado(e);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);

  if (!estado) return null;
  const adiar = () => { localStorage.setItem(CHAVE, String(Date.now())); setEstado(null); };
  const ativar = async () => {
    setOcupado(true);
    try {
      const e = await ativarPush();
      if (e === "ativo") { toast.success("Notificações ligadas neste aparelho."); setEstado(null); }
      else if (e === "negado") { toast.error("As notificações foram bloqueadas. Libere nos ajustes do navegador."); adiar(); }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ligar as notificações.");
    } finally { setOcupado(false); }
  };

  return (
    <div role="region" aria-label="Ativar notificações" className="fixed inset-x-3 bottom-3 z-[94] mx-auto max-w-md rounded-xl border bg-card p-4 text-card-foreground shadow-lg sm:bottom-4">
      <button type="button" onClick={adiar} aria-label="Agora não" className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-8">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><BellRing className="size-5" aria-hidden /></span>
        <div className="space-y-1">
          <p className="font-semibold leading-tight">Receba avisos mesmo com o app fechado</p>
          {estado === "instalar_ios" ? (
            <p className="text-sm text-muted-foreground">No iPhone, primeiro adicione o app à Tela de Início: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>. Abra pelo ícone e ligue as notificações.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Interfone tocando, respostas de atendimentos e avisos da equipe chegam direto no seu aparelho.</p>
          )}
        </div>
      </div>
      {estado === "pendente" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={adiar}>Agora não</Button>
          <Button className="min-h-11" disabled={ocupado} onClick={() => void ativar()}>{ocupado ? "Ligando..." : "Ligar notificações"}</Button>
        </div>
      )}
    </div>
  );
}
