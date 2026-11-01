import { useMemo } from "react";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { valorVar } from "@/lib/fluxos-motor";
import { achatar, Schema } from "@/components/fluxos/TesteHttp";

/** Dados que chegaram a este bloco no último teste (estilo n8n). Arraste ou clique para inserir {{variável}}. */
export function PainelEntrada({ vars }: { vars: Record<string, string> | undefined }) {
  const obj = useMemo(() => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(vars ?? {})) o[k] = valorVar(v);
    return o;
  }, [vars]);
  const linhas = useMemo(() => {
    const out: { caminho: string; valor: string }[] = [];
    for (const [k, v] of Object.entries(obj)) achatar(v, k, out);
    return out;
  }, [obj]);
  const copiar = (c: string) => { void navigator.clipboard.writeText(`{{${c}}}`); toast.success(`{{${c}}} copiado`); };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <span className="text-sm font-semibold">Entrada (etapa anterior)</span>
      {!vars ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Rode "Testar fluxo" até este bloco para ver os dados que chegam aqui.</p>
      ) : (
        <Tabs defaultValue="tabela" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="tabela">Tabela</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>
          <TabsContent value="tabela" className="min-h-0 flex-1 overflow-auto">
            <p className="mb-1 text-[11px] text-muted-foreground">Arraste uma linha para um campo ou clique para copiar.</p>
            <table className="w-full text-xs">
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.caminho} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", `{{${l.caminho}}}`); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => copiar(l.caminho)}
                    className="cursor-grab border-b align-top hover:bg-accent"
                  >
                    <td className="py-1 pr-1"><GripVertical className="size-3 text-muted-foreground" /></td>
                    <td className="py-1 pr-2 font-mono font-medium">{l.caminho}</td>
                    <td className="break-all py-1 font-mono text-muted-foreground">{l.valor.length > 200 ? `${l.valor.slice(0, 200)}…` : l.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabsContent>
          <TabsContent value="json" className="min-h-0 flex-1 overflow-auto">
            <pre className="whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(obj, null, 2)}</pre>
          </TabsContent>
          <TabsContent value="schema" className="min-h-0 flex-1 overflow-auto">
            {Object.entries(obj).map(([k, v]) => <Schema key={k} v={v} nome={k} />)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
