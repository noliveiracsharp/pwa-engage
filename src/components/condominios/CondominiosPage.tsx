import { useEffect, useMemo, useState } from "react";
import { Building, Building2, DoorOpen, Layers, Pencil, Plus, Search, Star, Trash2, Wand2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { condominioInicial } from "@/lib/cond-carteira";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { caminhoClassificacao, useClassificacoes } from "@/components/parceiros/ClassificacaoField";
import { ehCondominio } from "@/components/empresas/GestaoCondominial";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { rowId, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { ordemNatural, s, useCondRows, useCondSalvar } from "./cond-data";
import { UnidadeSheet } from "./UnidadeSheet";
import { CondominiosSidebar, useSecoesCondominio } from "./CondominiosSidebar";
import { VagasPanel } from "./VagasPanel";
import { SorteioPanel } from "./SorteioPanel";
import { PainelCondominios } from "./PainelCondominios";
import { EquipePanel } from "./EquipePanel";
import { GestaoTerceirosPanel } from "./GestaoTerceirosPanel";
import { DocumentosPanel } from "./DocumentosPanel";
import { AvisosPanel } from "./AvisosPanel";
import { useNavigate } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { condominiosGeridos, emModoUnidade, rotuloCargo } from "@/lib/ambientes";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";

/** Cores semânticas por ocupação da unidade (grade e legenda). */
const OCUP_VISUAL = [
  { value: "propria", label: "Própria (proprietário)", curto: "Própria", card: "border-success/40 bg-success/10 text-foreground", chip: "border-success/40 bg-success/10", ponto: "bg-success" },
  { value: "alugada", label: "Alugada (inquilino)", curto: "Alugada", card: "border-warning/60 bg-warning/15 text-foreground", chip: "border-warning/60 bg-warning/15", ponto: "bg-warning" },
  { value: "vazia", label: "Vazia", curto: "Vazia", card: "border-dashed bg-muted/50 text-muted-foreground", chip: "border-dashed bg-muted/50", ponto: "bg-muted-foreground/50" },
  { value: "inativa", label: "Inativa", curto: "Inativa", card: "bg-card text-muted-foreground opacity-50", chip: "bg-card opacity-70", ponto: "bg-destructive" },
];

export function CondominiosPage() {
  const perms = usePagePermissions("/condominios");
  const { data: classificacoes = [] } = useClassificacoes();
  const { data: parceiros = [] } = useTableRows("parceiros");
  // No acesso de condomínio (síndico), o escopo fica só nos condomínios que ele gere.
  const modoUnidade = emModoUnidade(lerAmbiente());
  const { data: ambientes = [] } = useAmbientes();
  const geridos = useMemo(() => new Set(condominiosGeridos(ambientes)), [ambientes]);
  const navigate = useNavigate();
  const ativa = useEmpresaAtiva();
  const condominios = useMemo(
    () =>
      parceiros
        .filter((p) => ehCondominio(classificacoes, s(p["classificacao_id"])))
        .filter((p) => !modoUnidade || geridos.has(s(rowId(p))))
        .map((p) => ({
          value: s(rowId(p)),
          label: s(pick(p, ["titulo", "nome_fantasia", "nome", "razao_social"]) ?? "—"),
          hint: caminhoClassificacao(classificacoes, p["classificacao_id"]) || undefined,
        })),
    [parceiros, classificacoes, modoUnidade, geridos],
  );

  const { user } = useAuth();
  const chavePadrao = `cond_padrao:${user?.id ?? ""}`;
  const [condId, setCondId] = useState("");
  const [padrao, setPadraoState] = useState("");
  useEffect(() => { setPadraoState(localStorage.getItem(chavePadrao) ?? ""); }, [chavePadrao]);
  useEffect(() => {
    if (condId || !condominios.length) return;
    const ini = condominioInicial(localStorage.getItem(chavePadrao), condominios.map((c) => c.value));
    if (ini) setCondId(ini);
  }, [condominios, condId, chavePadrao]);
  const alternarPadrao = (id: string) => {
    const novo = padrao === id ? "" : id;
    if (novo) localStorage.setItem(chavePadrao, novo); else localStorage.removeItem(chavePadrao);
    setPadraoState(novo);
    toast.success(novo ? "Condomínio padrão definido. Ele abrirá automaticamente." : "Condomínio padrão removido.");
  };

  const { data: blocos = [], isLoading: carregandoBlocos } = useCondRows("cond_blocos", "condominio_id", condId, "ordem");
  const { data: unidades = [] } = useCondRows("cond_unidades", "condominio_id", condId);
  const salvarBloco = useCondSalvar("cond_blocos");
  const salvarUnidade = useCondSalvar("cond_unidades");

  const [blocoId, setBlocoId] = useState("");
  useEffect(() => {
    if (blocoId && !blocos.some((b) => s(b["id"]) === blocoId)) setBlocoId("");
    if (!blocoId && blocos.length) setBlocoId(s(blocos[0]!["id"]));
  }, [blocos, blocoId]);

  const secoesBase = useSecoesCondominio(perms);
  const secoes = useMemo(
    () => (modoUnidade ? [...secoesBase, { key: "minha-unidade", label: "Minha unidade", icon: Home, canRead: true, canCreate: false, canUpdate: false, canDelete: false }] : secoesBase),
    [secoesBase, modoUnidade],
  );
  void navigate;
  const irSecao = (k: string) => setSecao(k);
  // Unidades do próprio login neste condomínio (seção "Minha unidade", sem sair do painel).
  const minhasIds = useMemo(
    () => new Set(ambientes.flatMap((a) => (a.tipo === "unidade" && a.vinculo.condominio_id === condId ? [a.vinculo.unidade_id] : []))),
    [ambientes, condId],
  );
  const minhas = unidades.filter((u) => minhasIds.has(s(u["id"])));
  const [minhaAberta, setMinhaAberta] = useState<Row | null>(null);
  const [secao, setSecao] = useState("painel");
  useEffect(() => {
    if (secoes.length && !secoes.some((x) => x.key === secao)) setSecao(secoes[0]!.key);
  }, [secoes, secao]);
  const secAtual = secoes.find((x) => x.key === secao);
  const permsUnid = secoes.find((x) => x.key === "unidades") ?? { canCreate: false, canUpdate: false, canDelete: false };
  const [busca, setBusca] = useState("");
  const [unidadeAberta, setUnidadeAberta] = useState<Row | null>(null);
  const [gerar, setGerar] = useState(false);

  const blocoAtual = blocos.find((b) => s(b["id"]) === blocoId);
  const unidadesBloco = unidades.filter((u) => s(u["cond_bloco_id"]) === blocoId);
  const termo = busca.trim().toLowerCase();
  const [filtroOcup, setFiltroOcup] = useState<string>("");
  const ocupDe = (u: Row) => (u["status"] === false ? "inativa" : s(u["ocupacao"]) || "vazia");
  const filtradas = unidadesBloco.filter((u) => (!termo || s(u["numero"]).toLowerCase().includes(termo)) && (!filtroOcup || ocupDe(u) === filtroOcup));

  // Agrupa por andar, do mais alto para o térreo (como o prédio é visto).
  const porAndar = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const u of filtradas) {
      const k = u["andar"] == null ? "—" : s(u["andar"]);
      m.set(k, [...(m.get(k) ?? []), u]);
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : Number(b) - Number(a)))
      .map(([andar, us]) => ({ andar, us: us.sort((x, y) => ordemNatural(s(x["numero"]), s(y["numero"]))) }));
  }, [filtradas]);

  async function novoBloco() {
    const nome = await perguntar({ title: "Novo bloco / torre", placeholder: "Ex.: Bloco A, Torre 1", required: true, confirmText: "Salvar" });
    if (!nome?.trim()) return;
    await salvarBloco.mutateAsync({ valores: { condominio_id: condId, nome: nome.trim(), ordem: blocos.length } });
    toast.success("Bloco criado.");
  }
  async function renomearBloco(b: Row) {
    const nome = await perguntar({ title: "Renomear bloco", defaultValue: s(b["nome"]), required: true, confirmText: "Salvar" });
    if (!nome?.trim()) return;
    await salvarBloco.mutateAsync({ id: s(b["id"]), valores: { nome: nome.trim() } });
  }
  async function excluirBloco(b: Row) {
    const ok = await confirmar({ title: `Excluir ${s(b["nome"])}?`, description: "Todas as unidades deste bloco também serão excluídas.", destructive: true, confirmText: "Excluir" });
    if (!ok) return;
    await salvarBloco.mutateAsync({ id: s(b["id"]), excluir: true });
    toast.success("Bloco excluído.");
  }
  async function novaUnidade() {
    const numero = await perguntar({ title: `Nova unidade — ${s(blocoAtual?.["nome"])}`, placeholder: "Número da unidade (ex.: 101)", required: true, confirmText: "Salvar" });
    if (!numero?.trim()) return;
    const n = numero.trim();
    const andar = /^\d{3,}$/.test(n) ? Math.floor(Number(n) / 100) : null;
    await salvarUnidade.mutateAsync({ valores: { cond_bloco_id: blocoId, condominio_id: condId, numero: n, andar } });
    toast.success("Unidade criada.");
  }

  if (!perms.loading && !perms.canRead) return <p className="p-6 text-sm text-muted-foreground">Você não tem acesso a esta tela.</p>;

  return (
    <div className="-m-4 flex min-h-[calc(100%+2rem)] flex-col sm:-m-6 sm:min-h-[calc(100%+3rem)] md:flex-row">
    <CondominiosSidebar
      secoes={secoes}
      ativa={secao}
      onChange={irSecao}
      direto={modoUnidade ? {
        nome: condominios.find((c) => c.value === condId)?.label ?? "Condomínio",
        logo: ativa.logoAtivo ?? null,
        cargo: (() => { const a = ambientes.find((x) => x.id === lerAmbiente()); return a && a.tipo === "unidade" ? rotuloCargo(a.vinculo) : null; })(),
      } : undefined}
      topo={<SearchSelect value={condId} onChange={setCondId} options={condominios} placeholder="Selecione o condomínio" emptyText="Nenhum condomínio (classifique em Clientes e Fornecedores)." />}
    />
    <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Building2 className="size-6" /> {condominios.find((c) => c.value === condId)?.label ?? "Condomínios"}</h1>
          <p className="text-sm text-muted-foreground">{secoes.find((x) => x.key === secao)?.label ?? "Painel"}</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-80">
          <div className="min-w-0 flex-1">
            <SearchSelect value={condId} onChange={setCondId} options={condominios} placeholder="Selecione o condomínio" emptyText="Nenhum condomínio (classifique em Clientes e Fornecedores)." />
          </div>
          <Button size="icon" variant="outline" disabled={!condId} aria-label={condId && padrao === condId ? "Remover condomínio padrão" : "Definir como condomínio padrão"} onClick={() => alternarPadrao(condId)}>
            <Star className={cn("size-4", condId && padrao === condId ? "fill-warning text-warning" : "text-muted-foreground")} />
          </Button>
        </div>
      </div>

      {secao === "painel" ? (
        <PainelCondominios escopoSindico={modoUnidade} condominios={condominios} condId={condId} podeConfigurar={perms.canUpdate} onAbrir={(id) => { setCondId(id); setSecao("unidades"); }} padrao={padrao} onPadrao={alternarPadrao} />
      ) : !condId ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Building className="mx-auto mb-2 size-8 opacity-60" />
          Selecione um condomínio para ver os blocos e unidades.
        </div>
      ) : secao === "vagas" && secAtual ? (
        <VagasPanel condominioId={condId} blocos={blocos} unidades={unidades} perms={secAtual} />
      ) : secao === "sorteio" && secAtual ? (
        <SorteioPanel condominioId={condId} blocos={blocos} unidades={unidades} perms={secAtual} />
      ) : secao === "equipe" && secAtual ? (
        <EquipePanel condominioId={condId} blocos={blocos} unidades={unidades} perms={secAtual} />
      ) : secao === "documentos" && secAtual ? (
        <DocumentosPanel condominioId={condId} perms={secAtual} condominios={condominios} blocos={blocos} unidades={unidades} />
      ) : secao === "avisos" && secAtual ? (
        <AvisosPanel condominioId={condId} condominios={condominios} blocos={blocos} unidades={unidades} perms={secAtual} />
      ) : secao === "gestao" && secAtual ? (
        <GestaoTerceirosPanel condominioId={condId} podeEditar={secAtual.canUpdate} />
      ) : secao === "minha-unidade" ? (
        minhas.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Você não tem unidade vinculada neste condomínio.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {minhas.map((u) => {
              const amb = ambientes.find((a) => a.tipo === "unidade" && a.vinculo.unidade_id === s(u["id"]));
              return (
                <button key={s(u["id"])} type="button" onClick={() => setMinhaAberta(u)} className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="text-xs text-muted-foreground">{s(blocos.find((b) => s(b["id"]) === s(u["cond_bloco_id"]))?.["nome"])}</p>
                  <p className="text-lg font-semibold">Unidade {s(u["numero"])}</p>
                  {amb?.tipo === "unidade" && <p className="text-sm text-muted-foreground">{amb.subtitulo.split(" · ")[0]}</p>}
                </button>
              );
            })}
          </div>
        )
      ) : !secAtual ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Seu perfil não tem acesso a esta área.</div>
      ) : (
        <>
          {/* Passo 2: blocos */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><Layers className="size-4" /> Blocos</h2>
              {permsUnid.canCreate && <Button size="sm" variant="outline" className="ml-auto" onClick={novoBloco}><Plus className="size-4" /> Novo bloco</Button>}
            </div>
            {carregandoBlocos ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : blocos.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum bloco cadastrado. Crie o primeiro bloco ou torre.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                {blocos.map((b) => {
                  const id = s(b["id"]);
                  const qtd = unidades.filter((u) => s(u["cond_bloco_id"]) === id).length;
                  const ativo = id === blocoId;
                  return (
                    <div key={id} className={cn("group relative rounded-lg border bg-card p-3 text-left transition", ativo ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50")}>
                      <button type="button" className="w-full text-left" onClick={() => setBlocoId(id)} aria-pressed={ativo}>
                        <p className="font-semibold">{s(b["nome"])}</p>
                        <p className="text-xs text-muted-foreground">{qtd} {qtd === 1 ? "unidade" : "unidades"}</p>
                      </button>
                      {(permsUnid.canUpdate || permsUnid.canDelete) && (
                        <div className="absolute right-1 top-1 flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          {permsUnid.canUpdate && <Button size="icon" variant="ghost" className="size-7" aria-label="Renomear bloco" onClick={() => renomearBloco(b)}><Pencil className="size-3.5" /></Button>}
                          {permsUnid.canDelete && <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Excluir bloco" onClick={() => excluirBloco(b)}><Trash2 className="size-3.5" /></Button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Passo 3: unidades do bloco, por andar */}
          {blocoAtual && (
            <section className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto flex items-center gap-2 font-semibold"><DoorOpen className="size-5" /> Unidades — {s(blocoAtual["nome"])}</h2>
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar unidade" className="pl-8" aria-label="Buscar unidade" />
                </div>
                {permsUnid.canCreate && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setGerar(true)}><Wand2 className="size-4" /> Gerar em lote</Button>
                    <Button size="sm" onClick={novaUnidade}><Plus className="size-4" /> Nova unidade</Button>
                  </>
                )}
              </div>
              {unidadesBloco.length > 0 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Legenda e filtro por ocupação">
                  <span className="text-xs font-medium text-muted-foreground">Legenda:</span>
                  {OCUP_VISUAL.map((o) => {
                    const qtd = unidadesBloco.filter((u) => ocupDe(u) === o.value).length;
                    if (o.value === "inativa" && qtd === 0) return null;
                    const ativo = filtroOcup === o.value;
                    return (
                      <button key={o.value} type="button" aria-pressed={ativo} onClick={() => setFiltroOcup(ativo ? "" : o.value)}
                        className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", o.chip, ativo && "ring-2 ring-primary/40")}>
                        <span className={cn("size-2 rounded-full", o.ponto)} /> {o.label} <span className="tabular-nums opacity-80">{qtd}</span>
                      </button>
                    );
                  })}
                  {filtroOcup && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFiltroOcup("")}>Limpar filtro</Button>}
                </div>
              )}
              {porAndar.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{termo ? "Nenhuma unidade encontrada." : "Nenhuma unidade neste bloco. Use “Gerar em lote” para criar todas de uma vez."}</p>
              ) : (
                <div className="space-y-2">
                  {porAndar.map(({ andar, us }) => (
                    <div key={andar} className="flex gap-3">
                      <div className="w-16 shrink-0 pt-2 text-right text-xs font-medium text-muted-foreground">{andar === "—" ? "Sem andar" : andar === "0" ? "Térreo" : `${andar}º andar`}</div>
                      <div className="flex flex-1 flex-wrap gap-2 border-l pl-3">
                        {us.map((u) => {
                          const o = OCUP_VISUAL.find((x) => x.value === ocupDe(u)) ?? OCUP_VISUAL[0]!;
                          return (
                            <button
                              key={s(u["id"])}
                              type="button"
                              onClick={() => setUnidadeAberta(u)}
                              aria-label={`Unidade ${s(u["numero"])} — ${o.label}`}
                              title={o.label}
                              className={cn("flex min-w-20 flex-col items-center gap-0.5 rounded-md border px-3 py-1.5 text-center transition hover:shadow-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", o.card)}
                            >
                              <span className="text-sm font-semibold">{s(u["numero"])}</span>
                              <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{o.curto}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {gerar && blocoAtual && (
        <GerarUnidadesDialog
          existentes={new Set(unidadesBloco.map((u) => s(u["numero"])))}
          onClose={() => setGerar(false)}
          onGerar={async (linhas) => {
            await salvarUnidade.mutateAsync({ valores: linhas.map((l) => ({ ...l, cond_bloco_id: blocoId, condominio_id: condId })) as unknown as Row });
            toast.success(`${linhas.length} unidades criadas.`);
            setGerar(false);
          }}
        />
      )}

      {unidadeAberta && (
        <UnidadeSheet
          unidade={unidadeAberta}
          condominioId={condId}
          blocoNome={s(blocoAtual?.["nome"])}
          perms={permsUnid}
          onClose={() => setUnidadeAberta(null)}
        />
      )}
      {minhaAberta && (
        <UnidadeSheet
          unidade={minhaAberta}
          condominioId={condId}
          blocoNome={s(blocos.find((b) => s(b["id"]) === s(minhaAberta["cond_bloco_id"]))?.["nome"])}
          perms={{ canCreate: true, canUpdate: true, canDelete: permsUnid.canDelete }}
          onClose={() => setMinhaAberta(null)}
        />
      )}
    </div>
    </div>
  );
}

function GerarUnidadesDialog({ existentes, onClose, onGerar }: { existentes: Set<string>; onClose: () => void; onGerar: (l: Row[]) => Promise<void> }) {
  const [de, setDe] = useState("1");
  const [ate, setAte] = useState("10");
  const [porAndar, setPorAndar] = useState("4");
  const [salvando, setSalvando] = useState(false);
  const linhas = useMemo(() => {
    const out: Row[] = [];
    const a = Number(de), b = Number(ate), n = Number(porAndar);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(n > 0) || b < a || (b - a + 1) * n > 2000) return out;
    for (let f = a; f <= b; f++) for (let i = 1; i <= n; i++) {
      const numero = String(f * 100 + i);
      if (!existentes.has(numero)) out.push({ numero, andar: f });
    }
    return out;
  }, [de, ate, porAndar, existentes]);
  const exemplo = linhas.slice(0, 4).map((l) => s(l["numero"])).join(", ");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerar unidades em lote</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div><Label htmlFor="g-de">Andar inicial</Label><Input id="g-de" type="number" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label htmlFor="g-ate">Andar final</Label><Input id="g-ate" type="number" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <div><Label htmlFor="g-n">Unidades por andar</Label><Input id="g-n" type="number" value={porAndar} onChange={(e) => setPorAndar(e.target.value)} /></div>
        </div>
        <p className="text-sm text-muted-foreground">
          Serão criadas <strong>{linhas.length}</strong> unidades{exemplo ? ` (ex.: ${exemplo}…)` : ""}. Unidades já existentes são ignoradas.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!linhas.length || salvando} onClick={async () => { setSalvando(true); try { await onGerar(linhas); } finally { setSalvando(false); } }}>
            {salvando ? "Gerando…" : "Gerar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
