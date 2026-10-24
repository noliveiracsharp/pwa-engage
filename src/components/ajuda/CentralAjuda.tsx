import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, BookOpen, Bot, CircleHelp, Loader2, MessageCircle, Pencil, PlayCircle, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { ARTIGOS_PADRAO, MODULOS_AJUDA, artigoTexto, buscarArtigos, mesclarArtigos, type ArtigoAjuda, type ArtigoBanco } from "@/lib/ajuda";
import { perguntarCopiloto } from "@/lib/ajuda.functions";
import { useAuth } from "@/hooks/useAuth";
import { EditorArtigoAjuda } from "./EditorArtigoAjuda";

/** Guias do banco (ajuda_artigos): personalizam os oficiais (chave) ou criam guias novos. */
function useArtigos() {
  const { data: extras = [] } = useQuery({
    queryKey: ["ajuda-artigos"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ajuda_artigos" as never).select("*").eq("publicado", true).order("ordem");
      if (error) return [];
      return (data as Record<string, unknown>[]).map((r): ArtigoBanco => ({
        id: `db-${r["id"]}`, dbId: String(r["id"]), chave: (r["chave"] as string) || undefined,
        modulo: String(r["modulo"] ?? "Primeiros passos"), titulo: String(r["titulo"] ?? ""),
        resumo: String(r["resumo"] ?? ""), rota: (r["rota"] as string) || undefined, perfil: (r["perfil"] as string) || undefined,
        passos: String(r["conteudo"] ?? "").split("\n").map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean),
        dica: (r["dica"] as string) || undefined, video: (r["video_url"] as string) || undefined,
        imagem: (r["imagem_url"] as string) || undefined,
        tags: String(r["tags"] ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      }));
    },
  });
  return useMemo(() => mesclarArtigos(ARTIGOS_PADRAO, extras), [extras]);
}

function Resposta({ texto }: { texto: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const partes = t.replace(/^#+\s*/, "").split(/\*\*(.+?)\*\*/g);
        return (
          <p key={i} className={t.startsWith("#") ? "pt-2 font-semibold" : /^(\d+\.|[-*])\s/.test(t) ? "pl-3" : ""}>
            {partes.map((p, j) => (j % 2 ? <strong key={j}>{p}</strong> : p.replace(/^[-*]\s/, "• ")))}
          </p>
        );
      })}
    </div>
  );
}

function ArtigoView({ a, voltar, fechar }: { a: ArtigoAjuda; voltar: () => void; fechar: () => void }) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={voltar}><ArrowLeft className="mr-1 h-4 w-4" /> Voltar</Button>
      <div>
        <Badge variant="secondary">{a.modulo}</Badge>
        <h2 className="mt-2 text-xl font-semibold">{a.titulo}</h2>
        <p className="text-sm text-muted-foreground">{a.resumo}</p>
        {a.perfil && <p className="mt-1 text-xs text-muted-foreground">Para quem: {a.perfil}</p>}
      </div>
      {a.imagem && (
        <a href={a.imagem} target="_blank" rel="noreferrer" title="Clique para ampliar" className="block overflow-hidden rounded-lg border border-border">
          <img src={a.imagem} alt={`Tela: ${a.titulo}`} loading="lazy" className="w-full" />
        </a>
      )}
      {a.video && (
        <a href={a.video} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted">
          <PlayCircle className="h-5 w-5 text-primary" /> Assistir vídeo curto
        </a>
      )}
      <ol className="space-y-2">
        {a.passos.map((p, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
            <span className="pt-0.5">{p}</span>
          </li>
        ))}
      </ol>
      {a.dica && <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm"><strong>Dica:</strong> {a.dica}</div>}
      {a.faq?.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Dúvidas comuns</h3>
          {a.faq.map((f, i) => (
            <div key={i} className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">{f.p}</p><p className="text-muted-foreground">{f.r}</p></div>
          ))}
        </div>
      ) : null}
      {a.rota && (
        <Button asChild className="w-full" onClick={fechar}>
          <Link to={a.rota as never}>Ir para a tela agora <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  );
}

export function CentralAjuda() {
  const [aberto, setAberto] = useState(false);
  const artigos = useArtigos();
  const [busca, setBusca] = useState("");
  const [modulo, setModulo] = useState<string>("");
  const [atual, setAtual] = useState<ArtigoAjuda | null>(null);
  const [resposta, setResposta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const perguntar = useServerFn(perguntarCopiloto);
  const { isMaster } = useAuth();
  const [editando, setEditando] = useState<ArtigoAjuda | "novo" | null>(null);

  const lista = useMemo(() => {
    if (busca.trim().length > 2) return buscarArtigos(artigos, busca, 8);
    return modulo ? artigos.filter((a) => a.modulo === modulo) : artigos;
  }, [artigos, busca, modulo]);

  async function perguntarIa() {
    const q = busca.trim();
    if (q.length < 3) { toast.error("Escreva sua dúvida no campo de busca."); return; }
    setCarregando(true); setResposta("");
    try {
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) { toast.error("Sessão expirada. Entre novamente."); return; }
      const contexto = buscarArtigos(artigos, q, 4).map(artigoTexto).join("\n\n");
      const r = await perguntar({ data: { pergunta: q, contexto, token } });
      if (r.erro) toast.error(r.erro); else setResposta(r.texto);
    } catch {
      toast.error("Não foi possível falar com o Copiloto agora.");
    } finally { setCarregando(false); }
  }

  const modulos = [...new Set([...MODULOS_AJUDA, ...artigos.map((a) => a.modulo)])];

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setAberto(true)} aria-label="Ajuda e suporte" title="Ajuda e suporte">
        <CircleHelp className="h-5 w-5" />
      </Button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" data-no-guard className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> {editando ? (editando === "novo" ? "Novo guia" : "Editar guia") : "Central de Ajuda"}
              {isMaster && !editando && (
                <span className="ml-auto mr-6 flex gap-1">
                  {atual && <Button size="sm" variant="outline" onClick={() => setEditando(atual)}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>}
                  {!atual && <Button size="sm" variant="outline" onClick={() => setEditando("novo")}><Plus className="mr-1 h-4 w-4" /> Novo guia</Button>}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          {editando ? (
            <div className="min-h-0 flex-1">
              <EditorArtigoAjuda key={editando === "novo" ? "novo" : editando.id} artigo={editando === "novo" ? null : editando} modulos={modulos}
                fechar={() => { setEditando(null); setAtual(null); }} />
            </div>
          ) : (<>
          <div className="flex-1 overflow-y-auto p-4">
            {atual ? (
              <ArtigoView a={atual} voltar={() => setAtual(null)} fechar={() => setAberto(false)} />
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Qual é sua dúvida? Ex.: como lançar despesa no cartão" value={busca}
                      onChange={(e) => { setBusca(e.target.value); setResposta(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") perguntarIa(); }} />
                  </div>
                  <Button onClick={perguntarIa} disabled={carregando} title="Perguntar ao Copiloto">
                    {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                {(resposta || carregando) && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" /> Copiloto Atende.ai</p>
                    {carregando ? <p className="text-sm text-muted-foreground">Consultando os guias…</p> : <Resposta texto={resposta} />}
                  </div>
                )}

                {busca.trim().length <= 2 && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={modulo ? "outline" : "default"} className="cursor-pointer" onClick={() => setModulo("")}>Todos</Badge>
                    {modulos.map((m) => (
                      <Badge key={m} variant={modulo === m ? "default" : "outline"} className="cursor-pointer" onClick={() => setModulo(m)}>{m}</Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {lista.length === 0 && <p className="text-sm text-muted-foreground">Nenhum guia encontrado. Clique no botão de enviar para perguntar ao Copiloto.</p>}
                  {lista.map((a) => (
                    <button key={a.id} onClick={() => setAtual(a)} className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted">
                      {a.video ? <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{a.titulo}</p>
                        <p className="text-xs text-muted-foreground">{a.modulo} · {a.resumo}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border p-4">
            <Button asChild variant="outline" className="w-full" onClick={() => setAberto(false)}>
              <Link to={"/atendimentos" as never}><MessageCircle className="mr-2 h-4 w-4" /> Falar com o suporte humano</Link>
            </Button>
          </div>
          </>)}
        </SheetContent>
      </Sheet>
    </>
  );
}
