import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Ncm = { codigo: string; descricao: string };

/** NCMs mais comuns em segurança eletrônica, redes e automação. */
export const NCM_FREQUENTES: Ncm[] = [
  { codigo: "85258929", descricao: "Câmeras de vídeo / CFTV" },
  { codigo: "85219090", descricao: "Gravadores DVR / NVR" },
  { codigo: "85176259", descricao: "Switches de rede" },
  { codigo: "85176277", descricao: "Roteadores / Access Points" },
  { codigo: "85444900", descricao: "Cabos elétricos / de rede (UTP)" },
  { codigo: "85447010", descricao: "Cabos de fibra óptica" },
  { codigo: "85044090", descricao: "Fontes de alimentação" },
  { codigo: "85311090", descricao: "Centrais e sensores de alarme" },
  { codigo: "83014000", descricao: "Fechaduras eletrônicas" },
  { codigo: "85176239", descricao: "Interfones / Vídeo porteiros" },
  { codigo: "84717012", descricao: "HDs / Discos rígidos" },
  { codigo: "85285200", descricao: "Monitores" },
  { codigo: "85365090", descricao: "Interruptores / Relés" },
  { codigo: "85078000", descricao: "Baterias / Nobreaks (acumuladores)" },
];

export function NcmBusca({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Ncm[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const termo = q.trim();
    if (termo.length < 3) { setRes([]); return; }
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await fetch(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(termo)}`);
        const data = (r.ok ? await r.json() : []) as Ncm[];
        setRes(data.filter((n) => n.codigo.replace(/\D/g, "").length === 8).slice(0, 50));
      } catch { setRes([]); }
      setCarregando(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const escolher = (c: string) => { onChange(c.replace(/\D/g, "")); setOpen(false); };
  const lista = q.trim().length >= 3 ? res : NCM_FREQUENTES;

  return (
    <div className="flex gap-2">
      <Input id="ncm" placeholder="8 dígitos" maxLength={10} value={value} onChange={(e) => onChange(e.target.value)} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Buscar NCM"><Search className="size-4" /></Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(28rem,90vw)] p-2">
          <Input autoFocus placeholder="Buscar por nome ou código (ex.: câmera, 8525)" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="text-muted-foreground px-1 pt-2 text-xs">
            {q.trim().length >= 3 ? (carregando ? "Buscando na tabela oficial…" : `${res.length} resultado(s)`) : "Mais usados"}
          </p>
          <div className="mt-1 max-h-72 overflow-y-auto">
            {lista.map((n) => (
              <button key={n.codigo} type="button" onClick={() => escolher(n.codigo)} className="hover:bg-accent w-full rounded px-2 py-1.5 text-left text-sm">
                <span className="font-mono font-medium">{n.codigo}</span>
                <span className="text-muted-foreground ml-2 line-clamp-2 text-xs">{n.descricao}</span>
              </button>
            ))}
            {!carregando && q.trim().length >= 3 && res.length === 0 && <p className="text-muted-foreground p-2 text-xs">Nenhum NCM encontrado.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
