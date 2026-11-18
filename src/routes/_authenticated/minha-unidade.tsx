import { DocumentosPanel } from "@/components/condominios/DocumentosPanel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, Gavel, Home, Loader2, Megaphone, LayoutDashboard, MapPinned, Users, HardHat, MessageSquareText, Vote, Wallet, ArrowRight, DoorOpen, ChevronRight, Phone } from "lucide-react";
import { MeuCondominioPanel } from "@/components/condominios/MeuCondominioPanel";
import { EquipePanel } from "@/components/condominios/EquipePanel";
import { ObrasPanel } from "@/components/condominios/ObrasPanel";
import { AtendimentosPanel } from "@/components/condominios/AtendimentosPanel";
import { EnquetesPanel } from "@/components/condominios/EnquetesPanel";
import { useAuth } from "@/hooks/useAuth";
import { ASSEMBLEIA_ATIVA, chamadoAberto, entraNaGestao, permsFichaMorador, permsMorador, SOMENTE_LEITURA, visibilidadesDocumento } from "@/lib/morador-acesso";
import { AssembleiasMorador } from "@/components/condominios/AssembleiasPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CondominiosSidebar, type Secao } from "@/components/condominios/CondominiosSidebar";
import { supabase } from "@/integrations/supabase/client";
import { gravarAmbiente, lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { ehGestor, rotuloCargo } from "@/lib/ambientes";
import { htmlParaTexto } from "@/lib/html-texto";
import { useCondRows } from "@/components/condominios/cond-data";
import { UnidadeSheet } from "@/components/condominios/UnidadeSheet";
import { DiscadorInterno } from "@/components/condominios/DiscadorInterno";
import { InterfoneTocando } from "@/components/condominios/InterfoneTocando";
import { CardAviso, LeituraAvisoDialog } from "@/components/condominios/LeituraAvisoDialog";
import { FiltroAvisosMorador } from "@/components/condominios/FiltroAvisosMorador";
import { FILTRO_AVISOS_VAZIO, filtrarAvisos } from "@/lib/avisos-filtro";

export const Route = createFileRoute("/_authenticated/minha-unidade")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Minha unidade — ConectCon HUB" },
      { name: "description", content: "Dados da sua unidade no condomínio." },
      { property: "og:title", content: "Minha unidade — ConectCon HUB" },
      { property: "og:description", content: "Dados da sua unidade no condomínio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhaUnidade,
});

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const dataBR = (v: unknown) => (v ? new Date(s(v)).toLocaleDateString("pt-BR") : "");

function MinhaUnidade() {
  const { data: ambientes, isLoading } = useAmbientes();
  const { user, usuario } = useAuth();
  const unidades = (ambientes ?? []).filter((a) => a.tipo === "unidade");
  const atual = unidades.find((a) => a.id === lerAmbiente()) ?? unidades[0];
  const v = atual && atual.tipo === "unidade" ? atual.vinculo : null;
  const condId = v?.condominio_id ?? "";
  const db = supabase as any;
  const [fichaAberta, setFichaAberta] = useState(false);
  const { data: cfgCond = [] } = useCondRows("cond_config", "condominio_id", condId || undefined);
  // Perfil Morador é o teto da plataforma; quem decide é o switch do condomínio ativo.
  const permsFicha = permsFichaMorador(true, cfgCond[0]?.["morador_edita_dados"]);
  const unidadeQ = useQuery({
    queryKey: ["portal", "unidade", v?.unidade_id],
    enabled: !!v?.unidade_id,
    queryFn: async () => {
      const { data } = await db.from("cond_unidades").select("*").eq("id", v!.unidade_id).maybeSingle();
      return (data ?? null) as Row | null;
    },
  });
  const unidadeRow = unidadeQ.data ?? null;

  const avisos = useQuery({
    queryKey: ["portal", "avisos", condId],
    enabled: !!condId,
    queryFn: async () => {
      const { data } = await db.from("cond_avisos").select("*").eq("condominio_id", condId).order("created_at", { ascending: false }).limit(100);
      const agora = Date.now();
      return ((data ?? []) as Row[]).filter((a) => ["enviado", "enviando"].includes(s(a["status"])) && !a["arquivado_em"] && (!a["expira_em"] || new Date(s(a["expira_em"])).getTime() > agora));
    },
  });
  const docs = useQuery({
    queryKey: ["portal", "docs", condId, v?.papel],
    enabled: !!condId,
    queryFn: async () => {
      const { data } = await db.from("cond_documentos").select("*").eq("condominio_id", condId).order("created_at", { ascending: false });
      const vis = visibilidadesDocumento(v?.papel);
      return ((data ?? []) as Row[]).filter((d) => vis.includes(s(d["visibilidade"])));
    },
  });
  const chamados = useQuery({
    queryKey: ["portal", "chamados", condId, user?.id],
    enabled: !!condId && !!user,
    queryFn: async () => {
      const { data } = await db.from("cond_atendimentos").select("*").eq("condominio_id", condId).order("created_at", { ascending: false }).limit(50);
      return ((data ?? []) as Row[]).filter((a) => (s(a["aberto_por"]) === user!.id || s(a["aberto_para"]) === user!.id) && chamadoAberto(a["status"]));
    },
  });
  const assembleias = useQuery({
    queryKey: ["portal", "assembleias", condId],
    enabled: !!condId,
    queryFn: async () => {
      const { data } = await db.from("cond_assembleias").select("id,titulo,status,data_primeira").eq("condominio_id", condId).in("status", ASSEMBLEIA_ATIVA);
      return (data ?? []) as Row[];
    },
  });
  const navigate = useNavigate();
  // Só o vínculo decide: síndico/subsíndico entra na gestão; morador fica aqui mesmo com login Master.
  useEffect(() => {
    if (!atual || !v) return;
    if (entraNaGestao(ehGestor(v))) {
      gravarAmbiente(atual.id, "/condominios");
      navigate({ to: "/condominios", replace: true });
    }
  }, [atual, v, navigate]);
  const [secao, setSecao] = useState("painel");
  const [filtroAvisos, setFiltroAvisos] = useState(FILTRO_AVISOS_VAZIO);
  const [avisoAberto, setAvisoAberto] = useState<Row | null>(null);
  const sec = (key: string, label: string, icon: Secao["icon"]): Secao => ({ key, label, icon, ...permsMorador(key) });
  const secoes: Secao[] = [
    sec("painel", "Painel", LayoutDashboard),
    sec("unidade", "Minha unidade", Home),
    sec("meu", "Meu Condomínio", MapPinned),
    sec("interfone", "Interfone", Phone),
    sec("avisos", "Avisos & Comunicados", Megaphone),
    sec("assembleias", "Assembleias", Gavel),
    sec("atendimentos", "Atendimentos", MessageSquareText),
    sec("enquetes", "Enquetes", Vote),
    sec("equipe", "Equipe & Diretoria", Users),
    sec("obras", "Obras", HardHat),
    sec("docs", "Documentos", FileText),
  ];


  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;
  if (!v) return <div className="py-12 text-center text-muted-foreground">Você não tem unidade vinculada. <Link to="/acesso" className="text-primary underline">Voltar</Link></div>;

  const primeiroNome = s(usuario?.["nome"]).split(" ")[0] || "morador";
  const local = [v.bloco, `Unidade ${v.numero}`].filter(Boolean).join(" · ");
  const p = (k: string) => permsMorador(k);
  const listaAvisos = (lim?: number) => (avisos.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Carregando" /> : (avisos.data ?? []).length === 0
    ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum aviso ativo.</p>
    : (lim ? avisos.data!.slice(0, lim) : avisos.data!).map((a) => (
      <CardAviso key={s(a["id"])} aviso={a} onAbrir={() => setAvisoAberto(a)} />
    )));
  const kpis = [
    { k: "avisos", l: "Avisos ativos", n: avisos.data?.length ?? 0, i: Megaphone },
    { k: "atendimentos", l: "Chamados em aberto", n: chamados.data?.length ?? 0, i: MessageSquareText },
    { k: "assembleias", l: "Assembleias ativas", n: assembleias.data?.length ?? 0, i: Gavel },
    { k: "docs", l: "Documentos", n: docs.data?.length ?? 0, i: FileText },
  ];

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <InterfoneTocando nome={primeiroNome || "Morador"} />
      <CondominiosSidebar secoes={secoes} ativa={secao} onChange={setSecao} chatCondominioId={condId || undefined} />
      <div className="w-full min-w-0 flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{v.condominio_nome}</p>
          <h1 className="text-2xl font-bold text-foreground">{secao === "painel" ? `Olá, ${primeiroNome}!` : secoes.find((x) => x.key === secao)?.label}</h1>
          <p className="text-sm text-muted-foreground">{local} · {rotuloCargo(v)}</p>
        </div>
        {(ambientes?.length ?? 0) > 1 && <Button variant="outline" asChild><Link to="/acesso">Trocar acesso</Link></Button>}
      </div>
        {secao === "painel" && (<div className="space-y-4">
          {(assembleias.data ?? []).length > 0 && (
            <button type="button" onClick={() => setSecao("assembleias")} className="flex w-full items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15">
              <Gavel className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="flex-1"><span className="block font-medium">{s(assembleias.data![0]!["titulo"]) || "Assembleia em andamento"}</span><span className="text-sm text-muted-foreground">Participe do debate e vote nas pautas.</span></span>
              <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((c) => (
              <button key={c.k} type="button" onClick={() => setSecao(c.k)} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <c.i className="mb-2 size-5 text-primary" aria-hidden />
                <p className="text-2xl font-bold">{c.n}</p>
                <p className="text-xs text-muted-foreground">{c.l}</p>
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Avisos recentes</CardTitle><Button size="sm" variant="ghost" onClick={() => setSecao("avisos")}>Ver todos</Button></CardHeader>
              <CardContent className="space-y-2">{listaAvisos(3)}</CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Seus atendimentos</CardTitle><Button size="sm" onClick={() => setSecao("atendimentos")}>Abrir chamado</Button></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {(chamados.data ?? []).length === 0 ? <p className="text-muted-foreground">Nenhum chamado em aberto.</p>
                    : chamados.data!.slice(0, 3).map((c) => (
                      <button key={s(c["id"])} type="button" onClick={() => setSecao("atendimentos")} className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-accent">
                        <span className="truncate">{s(c["titulo"] || c["assunto"]) || "Chamado"}</span>
                        <Badge variant="secondary">{dataBR(c["created_at"])}</Badge>
                      </button>
                    ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" aria-hidden /> Financeiro da unidade</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">Em breve: cota do mês, 2ª via do boleto e Pix direto por aqui.</CardContent>
              </Card>
            </div>
          </div>
        </div>)}
        {secao === "unidade" && (<div>
          <button type="button" disabled={!unidadeRow} onClick={() => setFichaAberta(true)} aria-label={`Abrir ficha da unidade ${v.numero}`}
            className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><DoorOpen className="size-5" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              {v.bloco && <span className="block text-xs text-muted-foreground">{v.bloco}</span>}
              <span className="block text-lg font-semibold">Unidade {v.numero}</span>
              <Badge variant="secondary" className="mt-1">{rotuloCargo(v)}</Badge>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
          {fichaAberta && unidadeRow && condId && (
            <UnidadeSheet unidade={unidadeRow} condominioId={condId} blocoNome={v.bloco ?? ""} perms={SOMENTE_LEITURA} permsDados={permsFicha} onClose={() => setFichaAberta(false)} />
          )}
        </div>)}
        {secao === "meu" && <MeuCondominioPanel condominioId={condId} perms={p("meu")} />}
        {secao === "equipe" && <EquipePanel condominioId={condId} blocos={[]} unidades={[]} perms={p("equipe")} publico />}
        {secao === "obras" && <ObrasPanel condominioId={condId} perms={p("obras")} />}
        {secao === "atendimentos" && <AtendimentosPanel condominioId={condId} nomeCondominio={v.condominio_nome} blocos={[]} unidades={[]} perms={p("atendimentos")} />}
        {secao === "enquetes" && <EnquetesPanel condominioId={condId} blocos={[]} perms={p("enquetes")} />}
        {secao === "assembleias" && condId && <AssembleiasMorador condominioId={condId} />}
        {secao === "interfone" && condId && <DiscadorInterno condominioId={condId} />}
        {secao === "avisos" && (() => {
          const filtrados = filtrarAvisos(avisos.data ?? [], filtroAvisos);
          return (
            <div className="space-y-3">
              <FiltroAvisosMorador f={filtroAvisos} onChange={setFiltroAvisos} total={filtrados.length} />
              <div className="space-y-2">
                {avisos.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Carregando" />
                  : filtrados.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum aviso encontrado.</p>
                  : filtrados.map((a) => <CardAviso key={s(a["id"])} aviso={a} onAbrir={() => setAvisoAberto(a)} />)}
              </div>
            </div>
          );
        })()}
        <LeituraAvisoDialog aviso={avisoAberto} usuarioId={s(usuario?.["id"]) || undefined} onClose={() => setAvisoAberto(null)} />
        {secao === "docs" && condId && <DocumentosPanel condominioId={condId} perms={p("docs")} condominios={[{ value: condId, label: v.condominio_nome ?? "" }]} blocos={[]} unidades={[]} visibilidades={visibilidadesDocumento(v.papel)} />}
      </div>
    </div>
  );
}
