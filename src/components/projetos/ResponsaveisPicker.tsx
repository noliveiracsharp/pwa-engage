import { UserPlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { rowId } from "@/lib/crud";
import type { Row } from "@/lib/row";

/** Iniciais do nome: "Maria Souza" → "MS". */
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return ((p[0]![0] ?? "") + (p.length > 1 ? p[p.length - 1]![0] ?? "" : "")).toUpperCase();
}

/** Lista de responsáveis da tarefa (coluna array ou a coluna antiga de um só). */
export function responsaveisDe(t: Row | null | undefined, colAntiga: string): string[] {
  if (!t) return [];
  const arr = t["responsaveis"];
  if (Array.isArray(arr) && arr.length) return arr.map(String);
  const um = t[colAntiga];
  return um ? [String(um)] : [];
}

export function IniciaisResponsaveis({ ids, usuarios }: { ids: string[]; usuarios: Row[] }) {
  const nomes = ids.map((id) => String(usuarios.find((u) => String(rowId(u)) === id)?.["nome"] ?? "?"));
  if (nomes.length === 0) return <span className="text-xs text-muted-foreground">Sem responsável</span>;
  return (
    <div className="flex -space-x-1.5">
      {nomes.map((n, i) => (
        <span key={i} title={n} className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground">
          {iniciais(n)}
        </span>
      ))}
    </div>
  );
}

export function ResponsaveisPicker({ value, onChange, usuarios, disabled }: {
  value: string[]; onChange: (v: string[]) => void; usuarios: Row[]; disabled?: boolean;
}) {
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="h-9 justify-start gap-2 px-2">
          <IniciaisResponsaveis ids={value} usuarios={usuarios} />
          <UserPlus className="ml-auto h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        <div className="max-h-72 overflow-y-auto">
          {usuarios.map((u) => {
            const id = String(rowId(u));
            return (
              <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox checked={value.includes(id)} onCheckedChange={(v) => toggle(id, v === true)} />
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{iniciais(String(u["nome"] ?? ""))}</span>
                <span className="flex-1 truncate">{String(u["nome"] ?? "")}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
