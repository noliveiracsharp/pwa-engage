import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, HardHat, Pencil, Plus, Search, ShieldCheck, Trash2, User, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { buscarColaborador, filtrarTerceirizados, formatarDocumento, liberacaoAcesso, type Colaborador, type Terceirizado } from "@/lib/cond-terceirizados";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { FotoCond } from "./FotoCond";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

/** Terceirizados: prestadores PJ/PF que atendem um ou vários condomínios, com colaboradores identificáveis na portaria. */
export function TerceirizadosPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const qc = useQueryClient();
  const [aba, setAba] = useState("ativos");
  const [busca, setBusca] = useState("");
  const [consulta, setConsulta] = useState("");
  const [editando, setEditando] = useState<Terceirizado | "novo" | null>(null);
  const chave = ["cond", "terceirizados", condominioId];

  const q = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const r = await db.rpc("cond_terc_listar", { p_cond: condominioId });
      if (r.error) throw r.error;
      const lista: Terceirizado[] = []; const colabs: (Colaborador & { empresa: string; empresaAtiva: boolean })[] = [];
      for (const t of (r.data ?? []) as (Terceirizado & { colaboradores_lista: Colaborador[] })[]) {
        const cs = t.colaboradores_lista ?? [];
        const { colaboradores_lista: _x, ...resto } = t;
        lista.push({ ...resto, colaboradores: cs.filter((c) => c.ativo).length });
        cs.forEach((c) => colabs.push({ ...c, empresa: t.titulo || t.nome, empresaAtiva: t.vinculo_ativo }));
      }
      return { lista, colabs };
    },
  });
  const lista = useMemo(() => filtrarTerceirizados(q.data?.lista ?? [], busca, aba === "ativos"), [q.data, busca, aba]);
  const achados = useMemo(() => buscarColaborador(q.data?.colabs ?? [], consulta) as (Colaborador & { empresa: string; empresaAtiva: boolean })[], [q.data, consulta]);
  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  const alternar = async (t: Terceirizado) => {
    const r = await db.from("cond_terceirizados_vinculos").update({ ativo: !t.vinculo_ativo }).eq("id", t.vinculo_id);
    if (r.error) return void toast.error(r.error.message);
    toast.success(t.vinculo_ativo ? "Terceirizado inativado neste condomínio." : "Terceirizado reativado."); recarregar();
  };
  const desvincular = async (t: Terceirizado) => {
    if (!(await confirmar({ title: "Remover deste condomínio?", description: `${t.nome} deixa de aparecer aqui. O cadastro continua nos outros condomínios.` }))) return;
    const r = await db.from("cond_terceirizados_vinculos").delete().eq("id", t.vinculo_id);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Removido do condomínio."); recarregar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <HardHat className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-muted-foreground">Cadastre e mantenha atualizados os prestadores de serviço do condomínio e seus funcionários, para facilitar a consulta da administração e da portaria.</p>
        {perms.canCreate && <Button size="sm" onClick={() => setEditando("novo")}><Plus className="size-4" /> Incluir</Button>}
      </div>

      <section aria-label="Consulta rápida da portaria" className="rounded-lg border bg-card p-3">
        <Label htmlFor="consulta-portaria" className="mb-1.5 flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Consulta rápida da portaria</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input id="consulta-portaria" placeholder="Nome, CPF ou RG do funcionário…" value={consulta} onChange={(e) => setConsulta(e.target.value)} className="pl-8" />
        </div>
        {consulta.trim() && (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {!achados.length && <li className="text-sm text-muted-foreground">Ninguém encontrado. Não libere a entrada sem confirmar com a administração.</li>}
            {achados.map((c) => { const l = liberacaoAcesso(c.empresaAtiva, c.ativo); return (
              <li key={c.id} className={cn("flex items-center gap-3 rounded-lg border-2 p-3", l.liberado ? "border-primary/60" : "border-destructive/60")}>
                {c.foto_url ? <img src={c.foto_url} alt={`Foto de ${c.nome}`} className="size-16 rounded-full object-cover" /> : <div className="flex size-16 items-center justify-center rounded-full bg-muted"><User className="size-7 text-muted-foreground" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{[c.funcao, c.empresa].filter(Boolean).join(" · ")}</p>
                  {c.cpf && <p className="text-xs text-muted-foreground">CPF {formatarDocumento(c.cpf)}</p>}
                  <Badge variant={l.liberado ? "default" : "destructive"} className="mt-1 gap-1">{l.liberado ? <BadgeCheck className="size-3" /> : <Ban className="size-3" />}{l.motivo}</Badge>
                </div>
              </li>); })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={aba} onValueChange={setAba}><TabsList><TabsTrigger value="ativos">Ativos</TabsTrigger><TabsTrigger value="inativos">Inativos</TabsTrigger></TabsList></Tabs>
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar terceirizado" placeholder="Buscar por nome, atividade, contato, CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
      </div>

      {q.error && <p className="text-sm text-destructive">Não foi possível carregar. Rode o script de Terceirizados (v2) no banco.</p>}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2.5">Nome</th><th className="p-2.5">Atividade</th><th className="p-2.5">Fone</th><th className="p-2.5">Contato</th><th className="p-2.5 text-center">Funcionários</th><th className="p-2.5 text-right">Ações</th></tr>
          </thead>
          <tbody>
            {!q.isLoading && !lista.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum terceirizado {aba === "ativos" ? "ativo" : "inativo"}.</td></tr>}
            {lista.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/30">
                <td className="p-2.5"><button type="button" className="rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditando(t)}>{t.titulo || t.nome}</button>{t.titulo && t.titulo !== t.nome && <p className="text-xs text-muted-foreground">{t.nome}</p>}{t.documento && <p className="text-xs text-muted-foreground">{formatarDocumento(t.documento)}</p>}</td>
                <td className="p-2.5">{t.atividade ?? "—"}</td>
                <td className="p-2.5">{t.telefone_contato || t.telefone || "—"}</td>
                <td className="p-2.5">{t.contato ?? "—"}</td>
                <td className="p-2.5 text-center"><button type="button" aria-label={`${t.colaboradores} funcionários ativos de ${t.titulo || t.nome}`} onClick={() => setEditando(t)} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"><Users className="size-3" />{t.colaboradores}</button></td>
                <td className="p-2.5"><div className="flex justify-end gap-1">
                  {perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEditando(t)}><Pencil className="size-4" /></AcaoIcone>}
                  {perms.canUpdate && <AcaoIcone titulo={t.vinculo_ativo ? "Inativar" : "Reativar"} onClick={() => void alternar(t)}>{(() => { const I = t.vinculo_ativo ? Ban : BadgeCheck; return <I className="size-4" />; })()}</AcaoIcone>}
                  {perms.canDelete && <AcaoIcone titulo="Remover do condomínio" destrutivo onClick={() => void desvincular(t)}><Trash2 className="size-4" /></AcaoIcone>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && <TerceirizadoSheet condominioId={condominioId} item={editando === "novo" ? null : editando} podeEditar={editando === "novo" ? perms.canCreate : perms.canUpdate}
        colaboradores={(q.data?.colabs ?? []).filter((c) => editando !== "novo" && c.empresa_id === editando.id)} onClose={() => setEditando(null)} onSalvo={recarregar} />}
    </div>
  );
}

function TerceirizadoSheet({ condominioId, item, podeEditar, colaboradores, onClose, onSalvo }: { condominioId: string; item: Terceirizado | null; podeEditar: boolean; colaboradores: Colaborador[]; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ nome: item?.nome ?? "", titulo: item?.titulo ?? "", tipo_pessoa: item?.tipo_pessoa === "Física" ? "Física" : "Jurídica", documento: item?.documento ?? "", atividade: item?.atividade ?? "", contato: item?.contato ?? "", telefone: item?.telefone ?? "", telefone_contato: item?.telefone_contato ?? "", email: item?.email ?? "", observacoes: item?.observacoes ?? "", obs_acesso: item?.obs_acesso ?? "" });
  const [id, setId] = useState<string | null>(item?.id ?? null);
  const [origem, setOrigem] = useState<"existente" | "nova">("existente");
  const [salvando, setSalvando] = useState(false);
  const [colab, setColab] = useState<Partial<Colaborador> | null>(null);
  const [buscaEmp, setBuscaEmp] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  // Empresa operadora do sistema: dados cadastrais só mudam em Empresas.
  const bloqueada = !!item?.is_tenant || (!item && !!id && origem === "existente");
  const novo = !item && !id;
  const buscaQ = useQuery({
    queryKey: ["cond", "terc-busca", condominioId, buscaEmp],
    enabled: novo && origem === "existente" && buscaEmp.trim().length >= 2,
    queryFn: async () => { const r = await db.rpc("cond_terc_buscar_empresas", { p_cond: condominioId, p_q: buscaEmp.trim() }); if (r.error) throw r.error; return (r.data ?? []) as { id: string; nome: string; titulo: string | null; documento: string | null; telefone: string | null; email: string | null }[]; },
  });
  const escolher = (e: { id: string; nome: string; titulo: string | null; documento: string | null; telefone: string | null; email: string | null }) => {
    setId(e.id); setF((x) => ({ ...x, nome: e.nome, titulo: e.titulo ?? "", documento: e.documento ?? "", telefone: e.telefone ?? "", email: e.email ?? "" }));
  };

  const salvar = async () => {
    if (!id && !f.nome.trim()) return void toast.error("Informe o nome ou escolha uma empresa cadastrada.");
    setSalvando(true);
    try {
      const r = await db.rpc("cond_terc_salvar", { p_cond: condominioId, p_empresa: id, p: { ...f, nome: bloqueada ? "" : f.nome.trim() } });
      if (r.error) throw r.error;
      setId(r.data.empresa_id);
      toast.success(r.data.reaproveitada ? "Empresa já cadastrada com este CNPJ/CPF: vinculada ao condomínio." : "Terceirizado salvo.");
      onSalvo();
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const salvarColab = async () => {
    if (!colab?.nome?.trim() || !id) return void toast.error("Informe o nome do funcionário.");
    const dados = { empresa_id: id, nome: colab.nome.trim(), funcao: colab.funcao || null, rg: colab.rg || null, cpf: colab.cpf || null, celular: colab.celular || null, foto_url: colab.foto_url || null, ativo: colab.ativo ?? true, observacoes: colab.observacoes || null };
    const r = colab.id ? await db.from("cond_terceirizados_colaboradores").update(dados).eq("id", colab.id) : await db.from("cond_terceirizados_colaboradores").insert(dados);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Funcionário salvo."); setColab(null); onSalvo();
  };
  const excluirColab = async (c: Colaborador) => {
    if (!(await confirmar({ title: "Excluir funcionário?", description: `${c.nome} será removido de todos os condomínios atendidos.` }))) return;
    const r = await db.from("cond_terceirizados_colaboradores").delete().eq("id", c.id);
    if (r.error) return void toast.error(r.error.message);
    onSalvo();
  };
  const ordenados = [...colaboradores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 p-0 sm:max-w-none md:w-full lg:w-[60vw]">
        <SheetHeader className="border-b p-4"><SheetTitle>{item ? item.titulo || item.nome : "Novo terceirizado"}</SheetTitle><SheetDescription>Dados da empresa ou pessoa e funcionários autorizados.</SheetDescription></SheetHeader>
        <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 w-fit"><TabsTrigger value="dados">Dados</TabsTrigger><TabsTrigger value="colab" disabled={!id}>Funcionários ({colaboradores.length})</TabsTrigger></TabsList>
          <TabsContent value="dados" className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {novo && (
                <div role="radiogroup" aria-label="Origem do cadastro" className="grid gap-2 sm:grid-cols-2">
                  {([["existente", "Empresa já cadastrada", "Procure em Empresas por nome ou CNPJ/CPF"], ["nova", "Nova empresa", "Cadastra o prestador em Empresas como fornecedor"]] as const).map(([v, t, d]) => (
                    <button key={v} type="button" role="radio" aria-checked={origem === v} onClick={() => setOrigem(v)}
                      className={cn("rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", origem === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                      <span className="block text-sm font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span>
                    </button>))}
                </div>
              )}
              {novo && origem === "existente" && (
                <div className="space-y-2">
                  <Label htmlFor="t-busca-emp">Buscar em Empresas</Label>
                  <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                    <Input id="t-busca-emp" autoFocus className="pl-8" placeholder="Nome, nome fantasia ou CNPJ/CPF…" value={buscaEmp} onChange={(e) => setBuscaEmp(e.target.value)} aria-describedby="t-busca-emp-ajuda" /></div>
                  <p id="t-busca-emp-ajuda" className="text-xs text-muted-foreground">Digite ao menos 2 caracteres. Não achou? Escolha “Nova empresa”.</p>
                  {buscaQ.data && (
                    <ul aria-live="polite" className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                      {!buscaQ.data.length && <li className="p-3 text-sm text-muted-foreground">Nenhuma empresa encontrada.</li>}
                      {buscaQ.data.map((e) => (
                        <li key={e.id}><button type="button" onClick={() => escolher(e)} className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{e.titulo || e.nome}</span><span className="block truncate text-xs text-muted-foreground">{[e.titulo ? e.nome : null, formatarDocumento(e.documento) || null].filter(Boolean).join(" · ")}</span></span>
                          <Plus className="size-4 shrink-0 text-primary" aria-hidden /></button></li>))}
                    </ul>)}
                </div>
              )}
              {(!novo || origem === "nova") && (
                <fieldset disabled={!podeEditar} className="space-y-3">
                  <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-semibold">Dados da empresa {bloqueada && <Badge variant="secondary">Editável apenas em Empresas</Badge>}</legend>
                  <fieldset disabled={bloqueada} className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label>Tipo</Label><SearchSelect value={f.tipo_pessoa} onChange={(v) => set("tipo_pessoa", v || "Jurídica")} options={[{ value: "Física", label: "Pessoa física (CPF)" }, { value: "Jurídica", label: "Pessoa jurídica (CNPJ)" }]} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-doc">{f.tipo_pessoa === "Física" ? "CPF" : "CNPJ"}</Label><Input id="t-doc" inputMode="numeric" value={f.documento} onChange={(e) => set("documento", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-nome">{f.tipo_pessoa === "Física" ? "Nome completo" : "Razão social"} *</Label><Input id="t-nome" required aria-required value={f.nome} onChange={(e) => set("nome", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-fant">Nome fantasia</Label><Input id="t-fant" value={f.titulo} onChange={(e) => set("titulo", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-tel">Telefone da empresa</Label><Input id="t-tel" type="tel" value={f.telefone} onChange={(e) => set("telefone", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-em">E-mail</Label><Input id="t-em" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-obs">Observações</Label><Textarea id="t-obs" value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
                  </fieldset>
                  <p className="pt-2 text-sm font-semibold">Neste condomínio</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="t-at">Atividade</Label><Input id="t-at" placeholder="Ex.: Jardinagem, Elevadores" value={f.atividade} onChange={(e) => set("atividade", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-ct">Contato responsável</Label><Input id="t-ct" value={f.contato} onChange={(e) => set("contato", e.target.value)} /></div>
                    <div className="space-y-1.5"><Label htmlFor="t-tc">Telefone do contato</Label><Input id="t-tc" type="tel" value={f.telefone_contato} onChange={(e) => set("telefone_contato", e.target.value)} /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="t-acc">Orientações para a portaria</Label><Textarea id="t-acc" placeholder="Ex.: dias e horários de visita, áreas liberadas" value={f.obs_acesso} onChange={(e) => set("obs_acesso", e.target.value)} /></div>
                  </div>
                </fieldset>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t p-4"><Button variant="outline" onClick={onClose}>Cancelar</Button>{podeEditar && (!novo || origem === "nova") && <Button onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>}</div>
          </TabsContent>
          <TabsContent value="colab" className="min-h-0 flex-1 overflow-y-auto p-4">
            {colab ? (
              <div className="space-y-3">
                <FotoCond rosto value={colab.foto_url ?? ""} onChange={(u) => setColab({ ...colab, foto_url: u })} alt="Foto do funcionário" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-nome">Nome *</Label><Input id="c-nome" value={colab.nome ?? ""} onChange={(e) => setColab({ ...colab, nome: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="c-fn">Função</Label><Input id="c-fn" value={colab.funcao ?? ""} onChange={(e) => setColab({ ...colab, funcao: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="c-cel">Celular</Label><Input id="c-cel" value={colab.celular ?? ""} onChange={(e) => setColab({ ...colab, celular: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="c-cpf">CPF</Label><Input id="c-cpf" value={colab.cpf ?? ""} onChange={(e) => setColab({ ...colab, cpf: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="c-rg">RG</Label><Input id="c-rg" value={colab.rg ?? ""} onChange={(e) => setColab({ ...colab, rg: e.target.value })} /></div>
                </div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={colab.ativo ?? true} onCheckedChange={(v) => setColab({ ...colab, ativo: v })} /> Ativo (entrada liberada)</label>
                <div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" onClick={() => setColab(null)}>Cancelar</Button><Button onClick={() => void salvarColab()}>Salvar</Button></div>
              </div>
            ) : (
              <>
                {podeEditar && <Button size="sm" className="mb-3" onClick={() => setColab({ ativo: true })}><Plus className="size-4" /> Adicionar funcionário</Button>}
                {!ordenados.length && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado.</p>}
                <ul className="grid gap-3 sm:grid-cols-2">
                  {ordenados.map((c) => (
                    <li key={c.id} className={cn("flex items-center gap-3 rounded-lg border bg-card p-3", !c.ativo && "opacity-60")}>
                      {c.foto_url ? <img src={c.foto_url} alt={`Foto de ${c.nome}`} className="size-14 rounded-full object-cover" /> : <div className="flex size-14 items-center justify-center rounded-full bg-muted"><User className="size-6 text-muted-foreground" /></div>}
                      <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.nome}</p><p className="truncate text-xs text-muted-foreground">{c.funcao ?? "—"}{c.cpf ? ` · CPF ${formatarDocumento(c.cpf)}` : ""}</p>{!c.ativo && <Badge variant="secondary">Inativo</Badge>}</div>
                      {podeEditar && <div className="flex gap-1"><AcaoIcone titulo="Editar" onClick={() => setColab(c)}><Pencil className="size-4" /></AcaoIcone><AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluirColab(c)}><Trash2 className="size-4" /></AcaoIcone></div>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
