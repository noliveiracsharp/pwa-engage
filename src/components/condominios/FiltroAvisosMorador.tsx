import { Filter, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { CampoData } from "./CampoData";
import { TIPOS_AVISO } from "@/lib/cond-avisos";
import { FILTRO_AVISOS_VAZIO, type FiltroAvisos } from "@/lib/avisos-filtro";

export function FiltroAvisosMorador({ f, onChange, total }: { f: FiltroAvisos; onChange: (f: FiltroAvisos) => void; total: number }) {
  const ativo = JSON.stringify(f) !== JSON.stringify(FILTRO_AVISOS_VAZIO);
  const tipos = [...TIPOS_AVISO].map((t) => ({ value: t.value, label: t.label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  return (
    <section aria-label="Filtrar avisos" className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Filter className="size-4" aria-hidden />Filtrar avisos</h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">{total} resultado(s)</span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="h-11 pl-9" value={f.texto} onChange={(e) => onChange({ ...f, texto: e.target.value })} placeholder="Buscar por título ou texto" aria-label="Buscar por título ou texto" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label>Tipo</Label><SearchSelect value={f.tipo} allowClear placeholder="— Todos —" onChange={(v) => onChange({ ...f, tipo: v })} options={tipos} /></div>
        <div className="space-y-1.5"><Label>Anexo</Label><SearchSelect value={f.anexo} onChange={(v) => onChange({ ...f, anexo: (v || "todos") as FiltroAvisos["anexo"] })} options={[{ value: "com", label: "Com anexo" }, { value: "sem", label: "Sem anexo" }, { value: "todos", label: "Todos" }]} /></div>
        <div className="space-y-1.5"><Label>Data inicial</Label><CampoData value={f.de} onChange={(v) => onChange({ ...f, de: v })} inicio={2020} /></div>
        <div className="space-y-1.5"><Label>Data final</Label><CampoData value={f.ate} onChange={(v) => onChange({ ...f, ate: v })} inicio={2020} /></div>
      </div>
      {ativo && <Button variant="ghost" size="sm" onClick={() => onChange(FILTRO_AVISOS_VAZIO)}><X className="mr-1 size-4" aria-hidden />Limpar filtros</Button>}
    </section>
  );
}
