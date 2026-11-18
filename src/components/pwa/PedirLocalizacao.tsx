import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CHAVE = "conectcon-localizacao-adiado";
const ADIAR_MS = 3 * 864e5;
// Garante um único convite na tela, mesmo se o layout montar mais de uma vez.
let donoAtual: symbol | null = null;

/** Convite, logo ao abrir o app, para liberar a localização (interfone e portaria). */
export function PedirLocalizacao() {
  const [visivel, setVisivel] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (donoAtual) return;
    const eu = Symbol("loc");
    donoAtual = eu;
    const liberar = () => { if (donoAtual === eu) donoAtual = null; };
    if (!("geolocation" in navigator)) return liberar;
    const adiado = Number(localStorage.getItem(CHAVE) ?? 0);
    if (Date.now() - adiado < ADIAR_MS) return liberar;
    const perm = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perm?.query) { setVisivel(true); return liberar; }
    perm.query({ name: "geolocation" as PermissionName })
      .then((s) => { if (s.state === "prompt") setVisivel(true); })
      .catch(() => setVisivel(true));
    return liberar;
  }, []);

  if (!visivel) return null;
  const adiar = () => { localStorage.setItem(CHAVE, String(Date.now())); setVisivel(false); };
  const ativar = () => {
    setOcupado(true);
    navigator.geolocation.getCurrentPosition(
      () => { setOcupado(false); setVisivel(false); toast.success("Localização liberada neste aparelho."); },
      (e) => {
        setOcupado(false); adiar();
        if (e.code === 1) toast.error("Localização bloqueada. Libere nos ajustes do navegador quando quiser.");
        else toast.error("Não foi possível obter a localização agora.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div role="region" aria-label="Liberar localização" className="fixed inset-x-3 top-3 z-[93] mx-auto max-w-md rounded-xl border bg-card p-4 text-card-foreground shadow-lg" style={{ marginTop: "env(safe-area-inset-top)" }}>
      <button type="button" onClick={adiar} aria-label="Agora não" className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-10">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><MapPin className="size-5" aria-hidden /></span>
        <div className="space-y-1">
          <p className="font-semibold leading-tight">Libere sua localização</p>
          <p className="text-sm text-muted-foreground">Usamos para validar chamadas do interfone e registros da portaria com segurança. Só é consultada nesses momentos.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-11" onClick={adiar}>Agora não</Button>
        <Button className="min-h-11" disabled={ocupado} onClick={ativar}>{ocupado ? "Liberando..." : "Ativar localização"}</Button>
      </div>
    </div>
  );
}
