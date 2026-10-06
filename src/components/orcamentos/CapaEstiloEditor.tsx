import { Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { estiloCapa, FUNDOS_CAPA, type EstiloCapa } from "@/lib/propostas";

type Props = { estilo: EstiloCapa | undefined; onChange: (e: EstiloCapa) => void };

const HEX = /^#[0-9a-f]{6}$/i;

/** Controles de aparência da capa: fundo, texto, logo, etiqueta, título e campos do rodapé. */
export function CapaEstiloEditor({ estilo, onChange }: Props) {
  const e = estiloCapa(estilo);
  const up = (patch: Partial<EstiloCapa>) => onChange({ ...(estilo ?? {}), ...patch });
  const fundoKey = estilo?.fundo ?? "azul";
  const corLivre = HEX.test(fundoKey) ? fundoKey : "#0b2545";

  return (
    <Collapsible className="rounded-md border bg-muted/30">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium">
        <Palette className="h-4 w-4" /> Aparência da página
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 px-3 pb-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Fundo</Label>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(FUNDOS_CAPA).map(([k, f]) => (
              <button
                key={k}
                type="button"
                title={f.nome}
                onClick={() => up({ fundo: k, texto: f.texto })}
                className={cn("h-8 w-8 rounded-md border-2", fundoKey === k ? "border-primary" : "border-border")}
                style={{ background: f.css }}
              />
            ))}
            <label
              title="Cor personalizada"
              className={cn(
                "relative h-8 w-8 cursor-pointer overflow-hidden rounded-md border-2",
                HEX.test(fundoKey) ? "border-primary" : "border-border",
              )}
              style={{ background: corLivre }}
            >
              <input
                type="color"
                value={corLivre}
                onChange={(ev) => up({ fundo: ev.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Cor do texto</Label>
            <Select value={e.texto} onValueChange={(v) => up({ texto: v as "claro" })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claro">Claro (branco)</SelectItem>
                <SelectItem value="escuro">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Logo</Label>
            <Select value={e.logo} onValueChange={(v) => up({ logo: v as "esquerda" })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="esquerda">À esquerda</SelectItem>
                <SelectItem value="centro">Centralizado</SelectItem>
                <SelectItem value="direita">À direita</SelectItem>
                <SelectItem value="oculto">Ocultar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alinhar textos</Label>
            <Select value={e.alinhamento} onValueChange={(v) => up({ alinhamento: v as "esquerda" })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="esquerda">À esquerda</SelectItem>
                <SelectItem value="centro">Centralizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tamanho do título</Label>
            <Input
              type="number"
              min={20}
              max={72}
              className="h-8 text-xs"
              value={e.tamanhoTitulo}
              onChange={(ev) => up({ tamanhoTitulo: Number(ev.target.value) || 40 })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cor de destaque das páginas internas</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={e.destaque}
              onChange={(ev) => up({ destaque: ev.target.value })}
              className="h-8 w-10 cursor-pointer rounded border bg-transparent"
            />
            <span className="text-muted-foreground text-xs">Linha abaixo dos títulos</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Etiqueta acima do título (vazio para ocultar)</Label>
          <Input className="h-8 text-xs" value={e.etiqueta} onChange={(ev) => up({ etiqueta: ev.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Rodapé da capa</Label>
          {e.rodape.map((c, k) => {
            const setC = (p: Partial<typeof c>) =>
              up({ rodape: e.rodape.map((x, j) => (j === k ? { ...x, ...p } : x)) });
            return (
              <div key={k} className="flex items-center gap-2">
                <Switch checked={c.ativo} onCheckedChange={(v) => setC({ ativo: v })} />
                <Input className="h-8 text-xs" value={c.rotulo} onChange={(ev) => setC({ rotulo: ev.target.value })} placeholder="Rótulo" />
                <Input className="h-8 text-xs" value={c.valor} onChange={(ev) => setC({ valor: ev.target.value })} placeholder="Valor ou {{tag}}" />
              </div>
            );
          })}
          <p className="text-muted-foreground text-[11px]">
            Use tags como {"{{data}}"}, {"{{validade}}"}, {"{{vendedor_nome}}"} ou texto livre.
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
