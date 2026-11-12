import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Copy, KeyRound, LogIn, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { PRAZOS_CHAVE, previstoPara, situacaoPrazo, textoPrazo, type SituacaoPrazo } from "@/lib/chaves";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { s } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type Opcao = { value: string; label: string };

const dataBr = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const VISUAL: Record<SituacaoPrazo | "disponivel", { label: string; cls: string; Icon: typeof Clock }> = {
  disponivel: { label: "Disponível", cls: "border-success/40 bg-success/10", Icon: CheckCircle2 },
  sem_prazo: { label: "Em uso", cls: "border-primary/40 bg-primary/10", Icon: Clock },
  no_prazo: { label: "No prazo", cls: "border-primary/40 bg-primary/10", Icon: Clock },
  atencao: { label: "Atenção", cls: "border-warning/60 bg-warning/15", Icon: AlertTriangle },
  atrasada: { label: "Atrasada", cls: "border-destructive/60 bg-destructive/10", Icon: AlertTriangle },
};

function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30_000); return () => clearInterval(t); }, []);
  return agora;
}

/** Chaves (Claviculário Online): cadastro, retirada com prazo e devolução por qualquer pessoa. */
export function ChavesPanel({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const agora = useAgora();
  const chavesQ = useQuery({
    queryKey: ["cond", "chaves", condominioId],
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_chaves").select("*").eq("condominio_id", condominioId).order("nome");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const movQ = useQuery({
    queryKey: ["cond", "chaves-mov", condominioId],
    queryFn: async (): Promise<Row[]> => {
      const r = await db.from("cond_chaves_movimentos").select("*").eq("condominio_id", condominioId).order("retirada_em", { ascending: false }).limit(500);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const recarregar = () => { void qc.invalidateQueries({ queryKey: ["cond", "chaves", condominioId] }); void qc.invalidateQueries({ queryKey: ["cond", "chaves-mov", condominioId] }); };

  const unidadesOpc: Opcao[] = useMemo(() => unidades.map((u) => {
    const b = blocos.find((x) => s(x["id"]) === s(u["cond_bloco_id"]));
    return { value: s(u["id"]), label: `${b ? s(b["nome"]) + " · " : ""}Unidade ${s(u["numero"])}` };
  }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { numeric: true })), [blocos, unidades]);
  const rotuloUnidade = (id: unknown) => unidadesOpc.find((o) => o.value === s(id))?.label ?? "";

  const chaves = chavesQ.data ?? [];
  const movs = movQ.data ?? [];
  const abertas = useMemo(() => new Map(movs.filter((m) => !m["devolvida_em"]).map((m) => [s(m["chave_id"]), m])), [movs]);
  const situacao = (c: Row): SituacaoPrazo | "disponivel" => {
    const m = abertas.get(s(c["id"]));
    return m ? situacaoPrazo(m["previsto_em"] ? new Date(String(m["previsto_em"])) : null, agora) : "disponivel";
  };

  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [retirar, setRetirar] = useState<Row | null>(null);
  const [devolver, setDevolver] = useState<Row | null>(null);
  const [editar, setEditar] = useState<Row | "nova" | null>(null);

  const ativas = chaves.filter((c) => c["ativo"] !== false);
  const cont = {
    todas: ativas.length,
    disponiveis: ativas.filter((c) => situacao(c) === "disponivel").length,
    uso: ativas.filter((c) => situacao(c) !== "disponivel").length,
    atrasadas: ativas.filter((c) => situacao(c) === "atrasada").length,
  };
  const visiveis = ativas.filter((c) => {
    const st = situacao(c);
    if (filtro === "disponiveis" && st !== "disponivel") return false;
    if (filtro === "uso" && st === "disponivel") return false;
    if (filtro === "atrasadas" && st !== "atrasada") return false;
    const t = busca.trim().toLowerCase();
    const m = abertas.get(s(c["id"]));
    return !t || [c["nome"], c["codigo"], m?.["retirada_nome"]].some((x) => s(x).toLowerCase().includes(t));
  }).sort((a, b) => s(a["codigo"] || a["nome"]).localeCompare(s(b["codigo"] || b["nome"]), "pt-BR", { numeric: true }));

  return (
    <Tabs defaultValue="painel" className="space-y-3">
      <TabsList>
        <TabsTrigger value="painel">Claviculário</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
        {(perms.canCreate || perms.canUpdate) && <TabsTrigger value="cadastro">Cadastro de chaves</TabsTrigger>}
      </TabsList>

      <TabsContent value="painel" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar chaves">
          {([["todas", "Todas"], ["disponiveis", "Disponíveis"], ["uso", "Em uso"], ["atrasadas", "Atrasadas"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={filtro === k ? "default" : "outline"} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
              {l} <Badge variant="secondary" className="ml-1">{cont[k]}</Badge>
            </Button>
          ))}
          <Input placeholder="Buscar chave, gancho ou pessoa…" aria-label="Buscar chaves" value={busca} onChange={(e) => setBusca(e.target.value)} className="ml-auto max-w-xs" />
        </div>
        {cont.atrasadas > 0 && (
          <p role="status" className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="size-4 text-destructive" aria-hidden /> {cont.atrasadas} chave(s) com devolução atrasada.
          </p>
        )}
        {chavesQ.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : visiveis.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            <KeyRound className="mx-auto mb-2 size-8 opacity-60" aria-hidden />
            {ativas.length === 0 ? "Nenhuma chave cadastrada. Use a aba Cadastro de chaves." : "Nenhuma chave neste filtro."}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visiveis.map((c) => {
              const st = situacao(c); const v = VISUAL[st]; const m = abertas.get(s(c["id"]));
              return (
                <li key={s(c["id"])} className={cn("flex flex-col gap-2 rounded-lg border p-3", v.cls)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {s(c["codigo"]) && <p className="text-xs text-muted-foreground">Gancho {s(c["codigo"])}</p>}
                      <p className="truncate font-semibold">{s(c["nome"])}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
                      <v.Icon className="size-3.5" aria-hidden /> {v.label}
                    </span>
                  </div>
                  {c["possui_copia"] === true && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Copy className="size-3" aria-hidden /> Possui cópia</p>}
                  {m ? (
                    <div className="text-sm">
                      <p><span className="text-muted-foreground">Com:</span> {s(m["retirada_nome"])}{m["retirada_unidade_id"] ? ` (${rotuloUnidade(m["retirada_unidade_id"])})` : ""}</p>
                      <p className="text-xs text-muted-foreground">Retirada {dataBr(m["retirada_em"])}</p>
                      <p className={cn("text-xs font-medium", st === "atrasada" && "text-destructive")}>{textoPrazo(m["previsto_em"] ? new Date(String(m["previsto_em"])) : null, agora)}</p>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Na portaria</p>}
                  {perms.canUpdate || perms.canCreate ? (
                    m ? <Button size="sm" className="mt-auto" onClick={() => setDevolver(m)}><LogIn className="size-4" aria-hidden /> Registrar devolução</Button>
                      : <Button size="sm" variant="outline" className="mt-auto" onClick={() => setRetirar(c)}><LogOut className="size-4" aria-hidden /> Entregar chave</Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="historico"><Historico movs={movs} chaves={chaves} rotuloUnidade={rotuloUnidade} /></TabsContent>

      {(perms.canCreate || perms.canUpdate) && (
        <TabsContent value="cadastro" className="space-y-3">
          {perms.canCreate && <Button onClick={() => setEditar("nova")}><Plus className="size-4" aria-hidden /> Nova chave</Button>}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr><th className="p-2">Gancho</th><th className="p-2">Chave</th><th className="p-2">Cópia</th><th className="p-2">Prazo padrão</th><th className="p-2">Situação</th><th className="p-2 text-right">Ações</th></tr></thead>
              <tbody>
                {[...chaves].sort((a, b) => s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR", { numeric: true })).map((c) => (
                  <tr key={s(c["id"])} className="border-t">
                    <td className="p-2">{s(c["codigo"]) || "—"}</td>
                    <td className="p-2 font-medium">{s(c["nome"])}</td>
                    <td className="p-2">{c["possui_copia"] ? "Sim" : "Não"}</td>
                    <td className="p-2">{PRAZOS_CHAVE.find((p) => p.minutos === Number(c["prazo_padrao_minutos"]))?.label ?? (c["prazo_padrao_minutos"] ? `${c["prazo_padrao_minutos"]} min` : "Sem prazo")}</td>
                    <td className="p-2">{c["ativo"] === false ? "Inativa" : "Ativa"}</td>
                    <td className="p-2 text-right">
                      {perms.canUpdate && <AcaoIcone titulo="Editar chave" onClick={() => setEditar(c)}><Pencil className="size-4" /></AcaoIcone>}
                      {perms.canDelete && <AcaoIcone titulo="Excluir chave" destrutivo onClick={async () => {
                        if (abertas.has(s(c["id"]))) return void toast.error("Esta chave está em uso. Registre a devolução antes.");
                        if (!(await confirmar({ title: `Excluir "${s(c["nome"])}"?`, description: "O histórico desta chave também será apagado. Para manter, prefira inativar.", destructive: true }))) return;
                        const r = await db.from("cond_chaves").delete().eq("id", c["id"]);
                        if (r.error) return void toast.error(r.error.message);
                        recarregar();
                      }}><Trash2 className="size-4" /></AcaoIcone>}
                    </td>
                  </tr>
                ))}
                {chaves.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma chave cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      )}

      {retirar && <RetirarDialog chave={retirar} condominioId={condominioId} unidades={unidadesOpc} onClose={() => setRetirar(null)} onOk={recarregar} />}
      {devolver && <DevolverDialog mov={devolver} chave={chaves.find((c) => s(c["id"]) === s(devolver["chave_id"]))} unidades={unidadesOpc} rotuloUnidade={rotuloUnidade} onClose={() => setDevolver(null)} onOk={recarregar} />}
      {editar && <ChaveDialog chave={editar === "nova" ? null : editar} condominioId={condominioId} onClose={() => setEditar(null)} onOk={recarregar} />}
    </Tabs>
  );
}

/** Seletor de pessoa: morador de uma unidade ou terceiro (ex.: Zelador). */
function Pessoa({ idp, tipo, setTipo, unidade, setUnidade, nome, setNome, unidades }: { idp: string; tipo: "unidade" | "terceiro"; setTipo: (t: "unidade" | "terceiro") => void; unidade: string; setUnidade: (v: string) => void; nome: string; setNome: (v: string) => void; unidades: Opcao[] }) {
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Tipo de pessoa</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {([["unidade", "Morador de unidade"], ["terceiro", "Terceiro / funcionário"]] as const).map(([k, l]) => (
          <Button key={k} type="button" role="radio" aria-checked={tipo === k} variant={tipo === k ? "default" : "outline"} onClick={() => setTipo(k)}>{l}</Button>
        ))}
      </div>
      {tipo === "unidade" && (
        <div className="space-y-1">
          <Label htmlFor={`${idp}-un`}>Unidade *</Label>
          <SearchSelect id={`${idp}-un`} value={unidade} onChange={(v) => setUnidade(v ?? "")} options={unidades} placeholder="Selecione a torre e unidade" />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${idp}-nome`}>{tipo === "unidade" ? "Nome de quem está com a chave *" : "Nome e função *"}</Label>
        <Input id={`${idp}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === "unidade" ? "Ex.: Maria Silva" : "Ex.: João — Zelador"} />
      </div>
    </fieldset>
  );
}

function RetirarDialog({ chave, condominioId, unidades, onClose, onOk }: { chave: Row; condominioId: string; unidades: Opcao[]; onClose: () => void; onOk: () => void }) {
  const padrao = Number(chave["prazo_padrao_minutos"]) || 0;
  const [tipo, setTipo] = useState<"unidade" | "terceiro">("unidade");
  const [unidade, setUnidade] = useState("");
  const [nome, setNome] = useState("");
  const [prazo, setPrazo] = useState<string>(padrao ? String(padrao) : "0");
  const [personalizado, setPersonalizado] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (tipo === "unidade" && !unidade) return void toast.error("Selecione a unidade.");
    if (!nome.trim()) return void toast.error("Informe o nome de quem está retirando.");
    const agora = new Date();
    let previsto: Date | null; let minutos: number | null;
    if (prazo === "custom") {
      if (!personalizado) return void toast.error("Informe a data e hora de devolução.");
      previsto = new Date(personalizado);
      if (previsto <= agora) return void toast.error("A devolução precisa ser no futuro.");
      minutos = Math.round((previsto.getTime() - agora.getTime()) / 60_000);
    } else { minutos = Number(prazo) || null; previsto = previstoPara(agora, minutos); }
    setSalvando(true);
    const r = await db.from("cond_chaves_movimentos").insert({
      condominio_id: condominioId, chave_id: chave["id"], retirada_em: agora.toISOString(),
      retirada_unidade_id: tipo === "unidade" ? unidade : null, retirada_nome: nome.trim(),
      prazo_minutos: minutos, previsto_em: previsto?.toISOString() ?? null, observacoes: obs.trim() || null,
    });
    setSalvando(false);
    if (r.error) return void toast.error(r.error.code === "23505" ? "Esta chave já está em uso." : r.error.message);
    toast.success(`Chave "${s(chave["nome"])}" entregue.`);
    onOk(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Entregar chave · {s(chave["nome"])}</DialogTitle>
          <DialogDescription>Registre quem está retirando e até quando deve devolver.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Pessoa idp="ret" tipo={tipo} setTipo={setTipo} unidade={unidade} setUnidade={setUnidade} nome={nome} setNome={setNome} unidades={unidades} />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Prazo para devolver</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prazo para devolver">
              {[...PRAZOS_CHAVE.map((p) => [String(p.minutos), p.label] as const), ["0", "Sem prazo"] as const, ["custom", "Outra data/hora"] as const].map(([k, l]) => (
                <Button key={k} type="button" size="sm" role="radio" aria-checked={prazo === k} variant={prazo === k ? "default" : "outline"} onClick={() => setPrazo(k)}>{l}</Button>
              ))}
            </div>
            {prazo === "custom" && (
              <div className="space-y-1">
                <Label htmlFor="ret-dt">Devolver até</Label>
                <Input id="ret-dt" type="datetime-local" value={personalizado} onChange={(e) => setPersonalizado(e.target.value)} />
              </div>
            )}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="ret-obs">Observação</Label>
            <Textarea id="ret-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Entregar chave"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DevolverDialog({ mov, chave, unidades, rotuloUnidade, onClose, onOk }: { mov: Row; chave: Row | undefined; unidades: Opcao[]; rotuloUnidade: (id: unknown) => string; onClose: () => void; onOk: () => void }) {
  const [mesma, setMesma] = useState(true);
  const [tipo, setTipo] = useState<"unidade" | "terceiro">("unidade");
  const [unidade, setUnidade] = useState("");
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!mesma) {
      if (tipo === "unidade" && !unidade) return void toast.error("Selecione a unidade de quem está devolvendo.");
      if (!nome.trim()) return void toast.error("Informe quem está devolvendo.");
    }
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const extra = [s(mov["observacoes"]), obs.trim()].filter(Boolean).join(" · ");
    const r = await db.from("cond_chaves_movimentos").update({
      devolvida_em: new Date().toISOString(),
      devolvida_unidade_id: mesma ? mov["retirada_unidade_id"] ?? null : tipo === "unidade" ? unidade : null,
      devolvida_nome: mesma ? mov["retirada_nome"] : nome.trim(),
      recebido_por: u.user?.id ?? null, observacoes: extra || null,
    }).eq("id", mov["id"]);
    setSalvando(false);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Devolução registrada.");
    onOk(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Registrar devolução · {s(chave?.["nome"])}</DialogTitle>
          <DialogDescription>
            Retirada por {s(mov["retirada_nome"])}{mov["retirada_unidade_id"] ? ` (${rotuloUnidade(mov["retirada_unidade_id"])})` : ""} em {dataBr(mov["retirada_em"])}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <Label htmlFor="dev-mesma" className="cursor-pointer">Devolvida pela mesma pessoa que retirou</Label>
            <Switch id="dev-mesma" checked={mesma} onCheckedChange={setMesma} />
          </div>
          {!mesma && <Pessoa idp="dev" tipo={tipo} setTipo={setTipo} unidade={unidade} setUnidade={setUnidade} nome={nome} setNome={setNome} unidades={unidades} />}
          <div className="space-y-1">
            <Label htmlFor="dev-obs">Observação</Label>
            <Textarea id="dev-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: devolvida sem o chaveiro" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Confirmar devolução"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChaveDialog({ chave, condominioId, onClose, onOk }: { chave: Row | null; condominioId: string; onClose: () => void; onOk: () => void }) {
  const [codigo, setCodigo] = useState(s(chave?.["codigo"]));
  const [nome, setNome] = useState(s(chave?.["nome"]));
  const [copia, setCopia] = useState(chave?.["possui_copia"] === true);
  const [ativo, setAtivo] = useState(chave ? chave["ativo"] !== false : true);
  const [prazo, setPrazo] = useState(chave?.["prazo_padrao_minutos"] ? String(chave["prazo_padrao_minutos"]) : "");
  const [obs, setObs] = useState(s(chave?.["observacoes"]));
  const salvar = async () => {
    if (!nome.trim()) return void toast.error("Informe a descrição da chave.");
    const v = { condominio_id: condominioId, codigo: codigo.trim() || null, nome: nome.trim(), possui_copia: copia, ativo, prazo_padrao_minutos: Number(prazo) || null, observacoes: obs.trim() || null };
    const t = db.from("cond_chaves");
    const r = chave ? await t.update(v).eq("id", chave["id"]) : await t.insert(v);
    if (r.error) return void toast.error(r.error.code === "23505" ? "Já existe uma chave com esse nome." : r.error.message);
    onOk(); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{chave ? "Editar chave" : "Nova chave"}</DialogTitle><DialogDescription>Ex.: Academia, Área técnica, Salão de festas.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label htmlFor="ch-cod">Gancho</Label><Input id="ch-cod" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: 36" /></div>
            <div className="col-span-2 space-y-1"><Label htmlFor="ch-nome">Descrição *</Label><Input id="ch-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Academia" /></div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ch-prazo">Prazo padrão de devolução</Label>
            <SearchSelect id="ch-prazo" value={prazo} onChange={(v) => setPrazo(v ?? "")} placeholder="Sem prazo" options={PRAZOS_CHAVE.map((p) => ({ value: String(p.minutos), label: p.label }))} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3"><Label htmlFor="ch-copia">Possui cópia</Label><Switch id="ch-copia" checked={copia} onCheckedChange={setCopia} /></div>
          <div className="flex items-center justify-between rounded-md border p-3"><Label htmlFor="ch-ativo">Ativa</Label><Switch id="ch-ativo" checked={ativo} onCheckedChange={setAtivo} /></div>
          <div className="space-y-1"><Label htmlFor="ch-obs">Observações</Label><Textarea id="ch-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Historico({ movs, chaves, rotuloUnidade }: { movs: Row[]; chaves: Row[]; rotuloUnidade: (id: unknown) => string }) {
  const [busca, setBusca] = useState("");
  const nomeChave = (id: unknown) => s(chaves.find((c) => s(c["id"]) === s(id))?.["nome"]);
  const t = busca.trim().toLowerCase();
  const lista = movs.filter((m) => !t || [nomeChave(m["chave_id"]), m["retirada_nome"], m["devolvida_nome"]].some((x) => s(x).toLowerCase().includes(t)));
  const pessoa = (nome: unknown, un: unknown) => `${s(nome)}${un ? ` (${rotuloUnidade(un)})` : ""}`;
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar chave ou pessoa…" aria-label="Buscar no histórico" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Chave</th><th className="p-2">Retirada</th><th className="p-2">Prazo</th><th className="p-2">Devolução</th><th className="p-2">Situação</th></tr></thead>
          <tbody>
            {lista.map((m) => {
              const atrasou = m["previsto_em"] && new Date(String(m["devolvida_em"] ?? new Date())) > new Date(String(m["previsto_em"]));
              return (
                <tr key={s(m["id"])} className="border-t align-top">
                  <td className="p-2 font-medium">{nomeChave(m["chave_id"])}</td>
                  <td className="p-2">{pessoa(m["retirada_nome"], m["retirada_unidade_id"])}<br /><span className="text-xs text-muted-foreground">{dataBr(m["retirada_em"])}</span></td>
                  <td className="p-2">{m["previsto_em"] ? dataBr(m["previsto_em"]) : "Sem prazo"}</td>
                  <td className="p-2">{m["devolvida_em"] ? <>{pessoa(m["devolvida_nome"], m["devolvida_unidade_id"])}<br /><span className="text-xs text-muted-foreground">{dataBr(m["devolvida_em"])}</span></> : "—"}</td>
                  <td className="p-2">{!m["devolvida_em"] ? <Badge variant="secondary">Em uso</Badge> : atrasou ? <Badge variant="destructive">Devolvida com atraso</Badge> : <Badge variant="outline">Devolvida</Badge>}</td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma movimentação.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
