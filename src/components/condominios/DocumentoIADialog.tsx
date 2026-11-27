import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircleQuestion, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { lerDocumentoIA, perguntarRegimento } from "@/lib/cond-documentos-ia.functions";
import type { Row } from "@/lib/row";
import { s } from "./cond-data";
import { tabelaLeitura } from "@/lib/procedures-lista";

const ORIGEM: Record<string, string> = { convencao: "Convenção", regimento: "Regimento", outro: "Outro" };
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Conteúdo da convenção/regimento lido pela IA: leitura, busca por artigo e perguntas. */
export function DocumentoIADialog({ doc, gestao, onClose }: { doc: Row; gestao: boolean; onClose: () => void }) {
  const docId = s(doc["id"]);
  const qc = useQueryClient();
  const ler = useServerFn(lerDocumentoIA);
  const [progresso, setProgresso] = useState("");
  const perguntar = useServerFn(perguntarRegimento);
  const [lendo, setLendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [pensando, setPensando] = useState(false);

  const { data: artigos = [], isLoading, error } = useQuery({
    queryKey: ["cond", "cond_documentos_artigos", docId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await tabelaLeitura("cond_documentos_artigos").eq("documento_id", docId).order("ordem");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const lista = useMemo(() => {
    const t = norm(busca.trim());
    return t ? artigos.filter((a) => norm(`${s(a["numero"])} ${s(a["titulo"])} ${s(a["tema"])} ${s(a["capitulo"])} ${s(a["texto"])}`).includes(t)) : artigos;
  }, [artigos, busca]);

  async function processar() {
    if (artigos.length && !(await confirmar({ title: "Ler o documento de novo?", description: "Os artigos lidos antes serão substituídos.", confirmText: "Ler de novo" }))) return;
    setLendo(true);
    try {
      const { data: url } = await supabase.storage.from("cond-documentos").createSignedUrl(s(doc["arquivo_path"]), 1800);
      if (!url) throw new Error("Não foi possível acessar o arquivo.");
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const todos: Awaited<ReturnType<typeof ler>>["artigos"] = [];
      let depois: string | undefined;
      for (let passo = 0; passo < 20; passo++) {
        setProgresso(passo ? `Lendo… ${todos.length} artigos até agora` : "Lendo o documento…");
        const parte = await ler({ data: { url: url.signedUrl, token, depois } });
        if (parte.erro) { if (todos.length) break; throw new Error(parte.erro); }
        todos.push(...parte.artigos);
        const ult = parte.artigos[parte.artigos.length - 1];
        if (parte.fim || !ult) break;
        depois = `${ult.numero ?? ""} ${ult.titulo ?? ""} ${ult.texto.slice(-200)}`.trim().slice(0, 590);
      }
      const r = { artigos: todos };
      const del = await db.from("cond_documentos_artigos").delete().eq("documento_id", docId);
      if (del.error) throw del.error;
      const linhas = r.artigos.map((a, i) => ({ ...a, documento_id: docId, condominio_id: s(doc["condominio_id"]), ordem: i }));
      for (let i = 0; i < linhas.length; i += 200) {
        const ins = await db.from("cond_documentos_artigos").insert(linhas.slice(i, i + 200));
        if (ins.error) throw ins.error;
      }
      await qc.invalidateQueries({ queryKey: ["cond", "cond_documentos_artigos", docId] });
      toast.success(`${linhas.length} artigos lidos e guardados.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na leitura.");
    } finally { setLendo(false); setProgresso(""); }
  }

  async function enviarPergunta() {
    if (pergunta.trim().length < 3) return;
    setPensando(true); setResposta("");
    try {
      const contexto = artigos.map((a) => `[${ORIGEM[s(a["origem"])] ?? ""} ${s(a["numero"])}${a["titulo"] ? ` – ${s(a["titulo"])}` : ""}] ${s(a["texto"])}`).join("\n").slice(0, 400000);
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const r = await perguntar({ data: { pergunta: pergunta.trim(), contexto, token } });
      if (r.erro) throw new Error(r.erro);
      setResposta(r.resposta);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui responder.");
    } finally { setPensando(false); }
  }

  const semTabela = !!error;
  return (
    <Dialog open onOpenChange={(o) => !o && !lendo && onClose()}>
      <DialogContent className="flex h-[100dvh] max-w-3xl flex-col sm:h-[85vh]">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-lg"><Sparkles className="size-5 text-primary" aria-hidden /> {s(doc["titulo"])} · leitura por IA</DialogTitle></DialogHeader>
        {semTabela ? (
          <p className="rounded-lg border border-dashed p-4 text-base text-muted-foreground">Para usar a leitura por IA, rode no SQL Editor o script <strong>conectcon-documentos-ia.sql</strong>.</p>
        ) : isLoading ? (
          <p className="flex items-center gap-2 text-base"><Loader2 className="size-5 animate-spin" /> Carregando…</p>
        ) : (
          <Tabs defaultValue="artigos" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="h-auto w-full justify-start">
              <TabsTrigger value="artigos" className="min-h-11 text-[15px]">Artigos ({artigos.length})</TabsTrigger>
              <TabsTrigger value="perguntar" className="min-h-11 text-[15px]" disabled={!artigos.length}>Perguntar</TabsTrigger>
            </TabsList>
            <TabsContent value="artigos" className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input aria-label="Buscar nos artigos" className="h-11 pl-9 text-base" placeholder="Buscar: animais, mudança, silêncio…" value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
                {gestao && <Button className="min-h-11" onClick={processar} disabled={lendo}>{lendo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {artigos.length ? "Ler de novo" : "Ler com IA"}</Button>}
              </div>
              {lendo && <p role="status" className="rounded-lg bg-muted p-3 text-base">Lendo todas as páginas, inclusive as escaneadas. Documentos grandes levam alguns minutos; não feche esta janela.{progresso && <strong className="mt-1 block">{progresso}</strong>}</p>}
              {!artigos.length && !lendo ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-base text-muted-foreground">{gestao ? "Este documento ainda não foi lido. Clique em Ler com IA para transformar o PDF em artigos pesquisáveis." : "Este documento ainda não foi lido pela administração."}</p>
              ) : (
                <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {lista.map((a) => (
                    <li key={s(a["id"])} className="rounded-xl border p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{ORIGEM[s(a["origem"])] ?? s(a["origem"])}</Badge>
                        {a["tema"] ? <Badge variant="outline">{s(a["tema"])}</Badge> : null}
                        {a["capitulo"] ? <span className="text-sm text-muted-foreground">{s(a["capitulo"])}</span> : null}
                      </div>
                      <h3 className="text-base font-semibold">{s(a["numero"])}{a["titulo"] ? ` – ${s(a["titulo"])}` : ""}</h3>
                      <p className="mt-1 whitespace-pre-line text-base leading-relaxed">{s(a["texto"])}</p>
                    </li>
                  ))}
                  {busca && !lista.length && <li className="text-base text-muted-foreground">Nada encontrado para “{busca}”.</li>}
                </ul>
              )}
            </TabsContent>
            <TabsContent value="perguntar" className="flex min-h-0 flex-1 flex-col gap-3">
              <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void enviarPergunta(); }}>
                <Input aria-label="Sua pergunta" className="h-11 min-w-0 flex-1 text-base" placeholder="Ex.: Posso fazer mudança no domingo?" value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
                <Button type="submit" className="min-h-11" disabled={pensando || pergunta.trim().length < 3}>{pensando ? <Loader2 className="size-4 animate-spin" /> : <MessageCircleQuestion className="size-4" />} Perguntar</Button>
              </form>
              <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
                {resposta && <p className="whitespace-pre-line rounded-xl bg-muted p-4 text-base leading-relaxed">{resposta}</p>}
                <p className="mt-2 text-sm text-muted-foreground">A resposta usa somente os artigos deste documento. Em caso de dúvida, confira o texto original.</p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
