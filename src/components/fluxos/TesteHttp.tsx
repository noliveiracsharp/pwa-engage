import { useEffect, useMemo, useState } from "react";
import { lerDadosTeste, salvarDadosTeste } from "@/components/fluxos/dados-teste";
import { Copy, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { testarHttpFluxo } from "@/lib/fluxos-http.functions";
import { cn } from "@/lib/utils";

type Resultado = { ok: boolean; status: number; ms: number; corpo: string; erro: string | null };

const NOMES: Record<number, string> = { 200: "OK", 201: "Criado", 204: "Sem conteúdo", 400: "Requisição inválida", 401: "Não autorizado", 403: "Proibido", 404: "Não encontrado", 405: "Método não permitido", 422: "Dados inválidos", 429: "Muitas requisições", 500: "Erro no servidor", 502: "Gateway inválido", 503: "Indisponível" };

/** Achata o JSON em caminhos {{var.a.0.b}} para a tabela. */
export function achatar(v: unknown, base: string, out: { caminho: string; valor: string }[], limite = 300) {
  if (out.length >= limite) return;
  if (v && typeof v === "object") {
    const ents = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
    if (!ents.length) out.push({ caminho: base, valor: Array.isArray(v) ? "[]" : "{}" });
    for (const [k, x] of ents) achatar(x, `${base}.${k}`, out, limite);
  } else out.push({ caminho: base, valor: v === null ? "null" : String(v) });
}

function tipoDe(v: unknown) { return v === null ? "null" : Array.isArray(v) ? "lista" : typeof v === "object" ? "objeto" : typeof v === "number" ? "número" : typeof v === "boolean" ? "booleano" : "texto"; }

export function Schema({ v, nome, nivel = 0 }: { v: unknown; nome: string; nivel?: number }) {
  const t = tipoDe(v);
  const filhos: [string, unknown][] = Array.isArray(v) ? (v.length ? [["[item]", v[0]]] : []) : v && typeof v === "object" ? Object.entries(v) : [];
  return (
    <div style={{ paddingLeft: nivel * 14 }}>
      <div className="flex gap-2 py-0.5 font-mono text-xs">
        <span>{nome}</span>
        <span className="text-muted-foreground">{t}{Array.isArray(v) ? ` (${v.length} itens)` : ""}</span>
      </div>
      {nivel < 6 && filhos.map(([k, x]) => <Schema key={k} v={x} nome={k} nivel={nivel + 1} />)}
    </div>
  );
}

export function TesteHttp({ d, variavel }: { d: Record<string, unknown>; variavel: string }) {
  const testar = useServerFn(testarHttpFluxo);
  const [carregando, setCarregando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [vals, setValsRaw] = useState<Record<string, string>>({});
  useEffect(() => { setValsRaw(lerDadosTeste()); }, []);
  const setVals = (f: (p: Record<string, string>) => Record<string, string>) => setValsRaw((p) => { const n = f(p); salvarDadosTeste({ ...lerDadosTeste(), ...n }); return n; });
  const texto = `${d["url"] ?? ""}\n${d["cabecalhos"] ?? ""}\n${d["corpo"] ?? ""}`;
  const vars = useMemo(() => [...new Set([...texto.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]!.split(".")[0]!))], [texto]);
  const json = useMemo(() => { try { return res?.corpo ? (JSON.parse(res.corpo) as unknown) : undefined; } catch { return undefined; } }, [res]);
  const linhas = useMemo(() => { const o: { caminho: string; valor: string }[] = []; if (json !== undefined) achatar(json, variavel, o); return o; }, [json, variavel]);

  const rodar = async () => {
    setCarregando(true);
    try {
      setRes(await testar({ data: { metodo: String(d["metodo"] || "GET"), url: String(d["url"] ?? ""), cabecalhos: String(d["cabecalhos"] ?? ""), corpo: String(d["corpo"] ?? ""), vars: vals } }));
    } catch (e) {
      setRes({ ok: false, status: 0, ms: 0, corpo: "", erro: e instanceof Error ? e.message : String(e) });
    } finally { setCarregando(false); }
  };
  const copiar = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copiado"); };

  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Resposta</span>
        <Button size="sm" onClick={rodar} disabled={carregando}>
          {carregando ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Testar requisição
        </Button>
      </div>
      {vars.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Valores de teste (ficam salvos para os próximos testes e nunca são usados nas conversas reais):</p>
          {vars.map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-28 shrink-0 truncate font-mono text-xs">{`{{${v}}}`}</span>
              <Input className="h-8" value={vals[v] ?? ""} onChange={(e) => setVals((p) => ({ ...p, [v]: e.target.value }))} />
            </div>
          ))}
        </div>
      )}
      {!res && !carregando && <p className="py-6 text-center text-xs text-muted-foreground">Clique em "Testar requisição" para ver o retorno da API.</p>}
      {res && (
        <>
          <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium", res.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive")}>
            <span className={cn("size-2.5 rounded-full", res.ok ? "bg-success" : "bg-destructive")} />
            {res.ok ? "Conexão OK" : "Falhou"}
            {res.status > 0 && <span>• {res.status} {NOMES[res.status] ?? ""}</span>}
            {res.ms > 0 && <span className="ml-auto text-xs opacity-80">{res.ms} ms</span>}
          </div>
          {res.erro && <p className="text-xs text-destructive">{res.erro}</p>}
          {res.corpo && (
            <Tabs defaultValue="json" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="w-fit">
                <TabsTrigger value="json">JSON</TabsTrigger>
                <TabsTrigger value="tabela" disabled={json === undefined}>Tabela</TabsTrigger>
                <TabsTrigger value="schema" disabled={json === undefined}>Schema</TabsTrigger>
              </TabsList>
              <TabsContent value="json" className="relative">
                <Button size="icon" variant="ghost" className="absolute right-1 top-1 size-7" onClick={() => copiar(res.corpo)}><Copy className="size-3.5" /></Button>
                <pre className="max-h-[55vh] overflow-auto rounded-md bg-background p-3 font-mono text-xs">{json !== undefined ? JSON.stringify(json, null, 2) : res.corpo}</pre>
              </TabsContent>
              <TabsContent value="tabela">
                <div className="max-h-[55vh] overflow-auto rounded-md bg-background">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Variável</th><th className="p-2">Valor</th></tr></thead>
                    <tbody>
                      {linhas.map((l) => (
                        <tr key={l.caminho} className="border-b last:border-0">
                          <td className="p-2"><button type="button" className="font-mono text-primary hover:underline" onClick={() => copiar(`{{${l.caminho}}}`)}>{`{{${l.caminho}}}`}</button></td>
                          <td className="max-w-[16rem] truncate p-2" title={l.valor}>{l.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Clique na variável para copiar.</p>
              </TabsContent>
              <TabsContent value="schema">
                <div className="max-h-[55vh] overflow-auto rounded-md bg-background p-3"><Schema v={json} nome={variavel} /></div>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}
