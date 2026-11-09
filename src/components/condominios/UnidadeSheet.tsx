import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PainelUnidade } from "./PainelUnidade";
import { podeAtivarVeiculo } from "@/lib/cond-unidade";
import { LayoutDashboard } from "lucide-react";
import { ArrowRightLeft, Car, DoorOpen, FileText, KeyRound, Loader2, Mail, PawPrint, Phone, Pencil, Plus, Search, Settings2, ShieldOff, Trash2, UserRound, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import type { Row } from "@/lib/row";
import { consultarPlaca } from "@/lib/placa.functions";
import { normalizarPlaca } from "@/lib/sorteio-vagas";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCpfCnpj } from "@/lib/input-masks";
import { FotoCond } from "./FotoCond";
import { PessoaDialog, type Pessoa } from "./PessoaDialog";
import { TransferenciaDialog } from "./TransferenciaDialog";
import { AcaoIcone } from "./AcaoIcone";
import { cn } from "@/lib/utils";
import { OCUPACOES, PAPEIS, TIPOS_UNIDADE, s, useCatalogo, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type Props = { unidade: Row; condominioId: string; blocoNome: string; perms: Perms; onClose: () => void };

const rpc = (fn: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase as any).rpc(fn, args) as Promise<{ data: unknown; error: { message: string } | null }>;

function usePessoas(unidadeId: string) {
  return useQuery({
    queryKey: ["cond", "cond_unidades_vinculos", "pessoas", unidadeId],
    queryFn: async (): Promise<Pessoa[]> => {
      const { data, error } = await rpc("cond_unidade_pessoas", { p_unidade: unidadeId });
      if (error) throw new Error(error.message);
      return (data ?? []) as Pessoa[];
    },
  });
}

export function UnidadeSheet({ unidade, condominioId, blocoNome, perms, onClose }: Props) {
  const id = s(unidade["id"]);
  const [ocupacao, setOcupacao] = useState(s(unidade["ocupacao"]) || "vazia");
  const [aba, setAba] = useState("painel");
  const abas = [
    { v: "painel", l: "Painel", i: LayoutDashboard },
    { v: "dados", l: "Dados", i: DoorOpen },
    { v: "proprietario", l: "Proprietário", i: UserRound },
    ...(ocupacao === "alugada" ? [{ v: "inquilino", l: "Inquilino", i: KeyRound }] : []),
    { v: "familia", l: "Família", i: Users },
    { v: "visitantes", l: "Visitantes", i: UserRound },
    { v: "prestadores", l: "Prestadores", i: Wrench },
    { v: "veiculos", l: "Veículos", i: Car },
    { v: "pets", l: "Pets", i: PawPrint },
    { v: "documentos", l: "Documentos", i: FileText },
    { v: "emergencia", l: "Emergência", i: Phone },
  ];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><DoorOpen className="size-5" /> {blocoNome} · Unidade {s(unidade["numero"])}</SheetTitle>
        </SheetHeader>
        <Tabs value={aba} onValueChange={setAba} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 h-auto w-fit flex-wrap justify-start">
            {abas.map((a) => <TabsTrigger key={a.v} value={a.v}><a.i className="mr-1 size-4" /> {a.l}</TabsTrigger>)}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="painel"><PainelUnidade unidadeId={id} condominioId={condominioId} ocupacao={ocupacao} perms={perms} onOcupacao={setOcupacao} onIr={setAba} /></TabsContent>
            <TabsContent value="dados"><DadosUnidade unidade={unidade} condominioId={condominioId} perms={perms} onClose={onClose} onOcupacao={setOcupacao} /></TabsContent>
            <TabsContent value="proprietario"><Pessoas unidadeId={id} condominioId={condominioId} perms={perms} lado="proprietario" papeis={["proprietario", "preposto"]} titulo="Proprietários e procuradores" /></TabsContent>
            <TabsContent value="inquilino"><Pessoas unidadeId={id} condominioId={condominioId} perms={perms} lado="inquilino" papeis={["inquilino"]} titulo="Inquilinos (locatários)" /></TabsContent>
            <TabsContent value="familia"><Pessoas unidadeId={id} condominioId={condominioId} perms={perms} lado={ocupacao === "alugada" ? "inquilino" : "proprietario"} papeis={s(unidade["tipo"]) === "comercial" || s(unidade["tipo"]) === "sala" || s(unidade["tipo"]) === "loja" ? ["colaborador"] : ["familiar"]} titulo="Família da unidade (pai, mãe, filhos, avós…)" /></TabsContent>
            <TabsContent value="visitantes"><Pessoas unidadeId={id} condominioId={condominioId} perms={perms} lado={ocupacao === "alugada" ? "inquilino" : "proprietario"} papeis={["visitante"]} titulo="Visitantes autorizados (acesso temporário)" /></TabsContent>
            <TabsContent value="prestadores"><Pessoas unidadeId={id} condominioId={condominioId} perms={perms} lado={ocupacao === "alugada" ? "inquilino" : "proprietario"} papeis={["prestador"]} titulo="Prestadores de serviço da unidade" /></TabsContent>
            <TabsContent value="veiculos"><Veiculos unidadeId={id} condominioId={condominioId} perms={perms} /></TabsContent>
            <TabsContent value="pets"><Pets unidadeId={id} perms={perms} /></TabsContent>
            <TabsContent value="documentos"><Documentos unidadeId={id} perms={perms} /></TabsContent>
            <TabsContent value="emergencia"><Contatos unidadeId={id} perms={perms} /></TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function DadosUnidade({ unidade, condominioId, perms, onClose, onOcupacao }: { unidade: Row; condominioId: string; perms: Perms; onClose: () => void; onOcupacao: (o: string) => void }) {
  const salvar = useCondSalvar("cond_unidades");
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const minhas = vagas.filter((v) => s(v["cond_unidade_id"]) === s(unidade["id"]));
  const [v, setV] = useState({
    numero: s(unidade["numero"]),
    andar: s(unidade["andar"]),
    tipo: s(unidade["tipo"]) || "apartamento",
    ocupacao: s(unidade["ocupacao"]) || "vazia",
    area_privativa: s(unidade["area_privativa"]),
    fracao_ideal: s(unidade["fracao_ideal"]),
    observacoes: s(unidade["observacoes"]),
    status: unidade["status"] !== false,
  });
  const ro = !perms.canUpdate;
  const [excluindo, setExcluindo] = useState(false);
  const num = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
  const { data: pessoas = [] } = usePessoas(s(unidade["id"]));
  const { data: veiculos = [] } = useCondRows("cond_unidades_veiculos", "cond_unidade_id", s(unidade["id"]));
  const { data: pets = [] } = useCondRows("cond_unidades_pets", "cond_unidade_id", s(unidade["id"]));
  const tipoL = TIPOS_UNIDADE.find((x) => x.value === v.tipo)?.label ?? v.tipo;
  const ocupL = OCUPACOES.find((x) => x.value === v.ocupacao)?.label.split(" (")[0] ?? v.ocupacao;
  const ocupCor = v.ocupacao === "alugada" ? "bg-warning/15 text-warning border-warning/30" : v.ocupacao === "vazia" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary border-primary/20";
  const stats = [
    { i: Users, l: "Pessoas", n: pessoas.length },
    { i: Car, l: "Veículos", n: veiculos.length },
    { i: PawPrint, l: "Pets", n: pets.length },
    { i: KeyRound, l: "Vagas", n: minhas.length },
  ];
  const Secao = ({ titulo, desc, children }: { titulo: string; desc: string; children: React.ReactNode }) => (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="mb-4"><h3 className="text-sm font-semibold">{titulo}</h3><p className="text-xs text-muted-foreground">{desc}</p></header>
      {children}
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      {excluindo && <TransferenciaDialog modo="excluir" unidade={unidade} condominioId={condominioId} onClose={() => setExcluindo(false)} onConcluido={onClose} />}
      <div className="overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 via-card to-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <span className="text-[10px] uppercase opacity-80">Unid.</span>
            <span className="text-xl font-bold leading-none tabular-nums">{v.numero || "—"}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">{tipoL}{v.andar ? ` · ${v.andar}º andar` : ""}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="outline" className={ocupCor}>{ocupL}</Badge>
              <Badge variant="outline" className={v.status ? "border-success/30 bg-success/10 text-success" : "bg-muted text-muted-foreground"}>{v.status ? "Ativa" : "Inativa"}</Badge>
              {v.area_privativa && <Badge variant="outline">{v.area_privativa} m²</Badge>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t bg-card/60 sm:grid-cols-4">
          {stats.map((x, k) => (
            <div key={x.l} className={cn("flex items-center gap-3 p-3", k > 0 && "sm:border-l", k % 2 === 1 && "border-l")}>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><x.i className="size-4" /></span>
              <div><p className="text-lg font-bold leading-none tabular-nums">{x.n}</p><p className="text-xs text-muted-foreground">{x.l}</p></div>
            </div>
          ))}
        </div>
      </div>

      <Secao titulo="Identificação" desc="Como a unidade é localizada no condomínio.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="u-num" className="mb-1.5 block">Número *</Label><Input id="u-num" disabled={ro} value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} /></div>
          <div><Label htmlFor="u-andar" className="mb-1.5 block">Andar</Label><Input id="u-andar" type="number" disabled={ro} value={v.andar} onChange={(e) => setV({ ...v, andar: e.target.value })} /></div>
          <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={v.tipo} disabled={ro} allowClear={false} options={TIPOS_UNIDADE} onChange={(x) => setV({ ...v, tipo: x })} /></div>
        </div>
      </Secao>

      <Secao titulo="Ocupação e medidas" desc="Quem reside e a participação da unidade no rateio.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label className="mb-1.5 block">Ocupação</Label><SearchSelect value={v.ocupacao} disabled={ro} allowClear={false} options={OCUPACOES} onChange={(x) => setV({ ...v, ocupacao: x })} /></div>
          <div><Label htmlFor="u-area" className="mb-1.5 block">Área privativa</Label><div className="relative"><Input id="u-area" inputMode="decimal" className="pr-10" disabled={ro} value={v.area_privativa} onChange={(e) => setV({ ...v, area_privativa: e.target.value })} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">m²</span></div></div>
          <div><Label htmlFor="u-fr" className="mb-1.5 block">Fração ideal</Label><Input id="u-fr" inputMode="decimal" disabled={ro} value={v.fracao_ideal} onChange={(e) => setV({ ...v, fracao_ideal: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          <div><Label htmlFor="u-st" className="font-medium">Unidade ativa</Label><p className="text-xs text-muted-foreground">Unidades inativas não aparecem em cobranças, sorteios e portaria.</p></div>
          <Switch id="u-st" disabled={ro} checked={v.status} onCheckedChange={(c) => setV({ ...v, status: c })} />
        </div>
      </Secao>

      <Secao titulo="Vagas de garagem" desc="Vagas vinculadas a esta unidade.">
        {minhas.length ? <div className="flex flex-wrap gap-2">{minhas.map((x) => <Badge key={s(x["id"])} variant="outline" className="gap-1 py-1"><Car className="size-3.5" /> {s(x["identificacao"])} · {s(x["modalidade_posse"])}</Badge>)}</div>
          : <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Car className="size-5" /> Nenhuma vaga vinculada. Gerencie em <strong className="text-foreground">Garagem & Vagas</strong>, no menu lateral.</div>}
      </Secao>

      <Secao titulo="Observações" desc="Anotações internas sobre a unidade.">
        <Textarea id="u-obs" rows={3} disabled={ro} placeholder="Ex.: reforma prevista, particularidades da unidade…" value={v.observacoes} onChange={(e) => setV({ ...v, observacoes: e.target.value })} />
      </Secao>
      <div className="sticky bottom-0 flex justify-between gap-2 border-t bg-background pt-3">
        {perms.canDelete ? (
          <Button variant="ghost" className="text-destructive" onClick={() => setExcluindo(true)}><Trash2 className="size-4" /> Excluir</Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!ro && (
            <Button disabled={salvar.isPending || !v.numero.trim()} onClick={async () => {
              await salvar.mutateAsync({ id: s(unidade["id"]), valores: { numero: v.numero.trim(), andar: num(v.andar), tipo: v.tipo, ocupacao: v.ocupacao, area_privativa: num(v.area_privativa), fracao_ideal: num(v.fracao_ideal) ?? 0, observacoes: v.observacoes || null, status: v.status } });
              onOcupacao(v.ocupacao);
              toast.success("Unidade salva.");
            }}>Salvar</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const PERMISSOES = [
  { k: "is_residente", l: "Reside na unidade" },
  { k: "is_responsavel_financeiro", l: "Responsável financeiro" },
  { k: "pode_reservar_espacos", l: "Reserva espaços" },
  { k: "pode_cadastrar_visitantes", l: "Cadastra visitantes" },
  { k: "pode_cadastrar_veiculos", l: "Cadastra veículos" },
  { k: "pode_votar_assembleia", l: "Vota em assembleia" },
  { k: "pode_ver_documentos", l: "Vê documentos" },
];

function Cabecalho({ titulo, total, podeCriar, onNovo, rotulo = "Adicionar" }: { titulo: string; total: number; podeCriar: boolean; onNovo: () => void; rotulo?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-medium">{titulo} <span className="text-muted-foreground">({total})</span></p>
      {podeCriar && <Button size="sm" onClick={onNovo}><Plus className="size-4" /> {rotulo}</Button>}
    </div>
  );
}

const Vazio = ({ texto }: { texto: string }) => <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{texto}</p>;

function Pessoas({ unidadeId, condominioId, perms, lado, papeis, titulo }: { unidadeId: string; condominioId: string; perms: Perms; lado: string; papeis: string[]; titulo: string }) {
  const qc = useQueryClient();
  const { data: vinculos = [] } = useCondRows("cond_unidades_vinculos", "cond_unidade_id", unidadeId);
  const { data: pessoas = [] } = usePessoas(unidadeId);
  const salvar = useCondSalvar("cond_unidades_vinculos");
  const [form, setForm] = useState<{ pessoa: Pessoa | null; vinculo: Row | null } | null>(null);
  const [permsDe, setPermsDe] = useState<Row | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [transferir, setTransferir] = useState<{ v: Row; nome: string } | null>(null);
  const { data: unidadesCond = [] } = useCondRows("cond_unidades", "condominio_id", condominioId);
  const unidadeRow = unidadesCond.find((u) => s(u["id"]) === unidadeId) ?? { id: unidadeId };
  const meus = vinculos.filter((v) => papeis.includes(s(v["papel"])) && (s(v["lado"]) || "proprietario") === lado);
  const pessoa = (uid: string) => pessoas.find((p) => p.usuario_id === uid);
  const papelLabel = (p: string) => PAPEIS.find((x) => x.value === p)?.label ?? p;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "cond_unidades_vinculos"] });
  const vAtual = permsDe ? vinculos.find((x) => s(x["id"]) === s(permsDe["id"])) ?? permsDe : null;

  async function acao(fn: string, args: Record<string, unknown>, ok: string) {
    setOcupado(true);
    try {
      const { error } = await rpc(fn, args);
      if (error) throw new Error(error.message);
      toast.success(ok); await recarregar();
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); return false; }
    finally { setOcupado(false); }
  }

  /** Cria o login (se ainda não existe) e envia o link para a pessoa definir a própria senha. */
  async function enviarLink(p: Pessoa) {
    if (!(await confirmar({ title: `Enviar link de acesso para ${p.nome}?`, description: `Um e-mail será enviado para ${p.email} com o link para ${p.tem_acesso ? "trocar" : "criar"} a senha.`, confirmText: "Enviar" }))) return;
    setOcupado(true);
    try {
      if (!p.tem_acesso) {
        const bytes = crypto.getRandomValues(new Uint8Array(18));
        const senha = btoa(String.fromCharCode(...bytes)) + "!a1";
        const { error } = await rpc("cond_liberar_acesso", { p_usuario: p.usuario_id, p_senha: senha });
        if (error) throw new Error(error.message);
      }
      const { data, error } = await supabase.functions.invoke("cobranca-regua", {
        body: { acao: "recuperar_senha", email: p.email, redirect: `${window.location.origin}/reset-password`, empresa_id: condominioId },
      });
      const erro = error ? "O serviço de e-mail não respondeu." : (data as { erro?: string } | null)?.erro;
      if (erro) throw new Error(erro);
      toast.success(`Link enviado para ${p.email}.`);
      await recarregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar o link."); }
    finally { setOcupado(false); }
  }

  return (
    <div className="space-y-3">
      {transferir && <TransferenciaDialog modo="morador" unidade={unidadeRow} condominioId={condominioId} vinculo={transferir.v} pessoaNome={transferir.nome} onClose={() => setTransferir(null)} />}
      <Cabecalho titulo={titulo} total={meus.length} podeCriar={perms.canCreate} onNovo={() => setForm({ pessoa: null, vinculo: null })} />
      {meus.length === 0 ? <Vazio texto="Ninguém cadastrado." /> : meus.map((v) => {
        const p = pessoa(s(v["usuario_id"]));
        const ativas = PERMISSOES.filter((x) => v[x.k] === true);
        const st = s(v["status_conexao"]);
        return (
          <div key={s(v["id"])} className={cn("flex flex-wrap items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/40", v["arquivado"] === true && "border-dashed opacity-60")}>
            <FotoCond rosto tamanho="sm" disabled value={p?.foto_url ?? ""} onChange={() => {}} alt={p?.nome ?? "Foto"} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 font-medium">{p?.nome ?? "—"} <Badge variant="secondary">{papelLabel(s(v["papel"]))}</Badge>
                <Badge variant={p?.tem_acesso ? "default" : "outline"}>{p?.tem_acesso ? "Acesso ativo" : "Sem acesso"}</Badge>
                {(st === "inativo" || st === "bloqueado") && <Badge variant="destructive">{st === "inativo" ? "Inativo" : "Bloqueado"}</Badge>}
                {v["controle_acesso"] === false && <Badge variant="outline">Fora da catraca</Badge>}
                {v["arquivado"] === true && <Badge variant="outline">Guardado (locação)</Badge>}</p>
              <p className="truncate text-xs text-muted-foreground">{[p?.email, p?.celular, p?.cpf ? formatCpfCnpj(p.cpf) : "", s(v["parentesco"]) || s(v["prestador_funcao"])].filter(Boolean).join(" · ")}</p>
              {ativas.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{ativas.map((x) => x.l).join(" · ")}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-0.5">
              {perms.canUpdate && p && <AcaoIcone titulo="Editar" destaque onClick={() => setForm({ pessoa: p, vinculo: v })}><Pencil className="size-4" /></AcaoIcone>}
              <AcaoIcone titulo="Permissões" onClick={() => setPermsDe(v)}><Settings2 className="size-4" /></AcaoIcone>
              {perms.canUpdate && <AcaoIcone titulo="Transferir para outra unidade" onClick={() => setTransferir({ v, nome: p?.nome ?? "pessoa" })}><ArrowRightLeft className="size-4" /></AcaoIcone>}
              {perms.canUpdate && p && <AcaoIcone titulo="Enviar link de senha" disabled={ocupado} onClick={() => enviarLink(p)}><Mail className="size-4" /></AcaoIcone>}
              {perms.canUpdate && p && (p.tem_acesso ? (
                <AcaoIcone titulo="Revogar acesso" destrutivo disabled={ocupado} onClick={async () => {
                  if (!(await confirmar({ title: `Revogar acesso de ${p.nome}?`, description: "O login é apagado e as sessões abertas caem. O cadastro e os vínculos continuam.", destructive: true, confirmText: "Revogar" }))) return;
                  await acao("cond_revogar_acesso", { p_usuario: p.usuario_id }, "Acesso revogado.");
                }}><ShieldOff className="size-4" /></AcaoIcone>
              ) : (
                <AcaoIcone titulo="Liberar acesso com senha" disabled={ocupado} onClick={async () => {
                  const senha = await perguntar({ title: `Liberar acesso para ${p.nome}`, description: `Login: ${p.email}. Defina a senha inicial (mínimo 6 caracteres).`, placeholder: "Senha inicial", required: true, confirmText: "Liberar" });
                  if (senha) await acao("cond_liberar_acesso", { p_usuario: p.usuario_id, p_senha: senha }, "Acesso liberado.");
                }}><KeyRound className="size-4" /></AcaoIcone>
              ))}
              {perms.canDelete && <AcaoIcone titulo="Remover vínculo" destrutivo onClick={async () => {
                if (await confirmar({ title: "Remover vínculo com a unidade?", description: "O cadastro da pessoa é mantido.", destructive: true, confirmText: "Remover" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
              }}><Trash2 className="size-4" /></AcaoIcone>}
            </div>
          </div>
        );
      })}

      <Dialog open={!!vAtual} onOpenChange={(o) => !o && setPermsDe(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Permissões · {pessoa(s(vAtual?.["usuario_id"]))?.nome ?? ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {vAtual && PERMISSOES.map((x) => (
              <label key={x.k} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                {x.l}
                <Switch disabled={!perms.canUpdate} checked={vAtual[x.k] === true} onCheckedChange={(c) => salvar.mutate({ id: s(vAtual["id"]), valores: { [x.k]: c } })} />
              </label>
            ))}
          </div>
          <DialogFooter><Button onClick={() => setPermsDe(null)}>Concluir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {form && <PessoaDialog unidadeId={unidadeId} lado={lado} papeis={papeis} gestor={perms.canUpdate} pessoa={form.pessoa} vinculo={form.vinculo} onClose={() => setForm(null)} onSalvo={recarregar} />}
    </div>
  );
}

function Veiculos({ unidadeId, condominioId, perms }: { unidadeId: string; condominioId: string; perms: Perms }) {
  const { data: veiculos = [] } = useCondRows("cond_unidades_veiculos", "cond_unidade_id", unidadeId);
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const { data: pessoas = [] } = usePessoas(unidadeId);
  const { data: marcas = [] } = useCatalogo("veiculos_marcas");
  const { data: modelos = [] } = useCatalogo("veiculos_modelos");
  const { data: cores = [] } = useCatalogo("veiculos_cores");
  const salvar = useCondSalvar("cond_unidades_veiculos");
  const consultar = useServerFn(consultarPlaca);
  const vazio = { foto_url: "", placa: "", marca_id: "", modelo_id: "", cor_id: "", cond_vaga_id: "", usuario_id: "", ano: "", descricao_livre: "" };
  const [n, setN] = useState(vazio);
  const [aberto, setAberto] = useState<string | null>(null); // "" = novo
  const [buscando, setBuscando] = useState(false);
  const opt = (rs: Row[]) => rs.map((r) => ({ value: s(r["id"]), label: s(r["descricao"]) }));
  const nome = (rs: Row[], id: unknown) => s(rs.find((r) => s(r["id"]) === s(id))?.["descricao"]);
  const achar = (rs: Row[], txt?: string) => (txt ? s(rs.find((r) => s(r["descricao"]).toLowerCase() === txt.toLowerCase())?.["id"]) : "");
  const vagasUnidade = vagas.filter((v) => s(v["cond_unidade_id"]) === unidadeId).map((v) => ({ value: s(v["id"]), label: s(v["identificacao"]) }));
  const placaOk = normalizarPlaca(n.placa);
  const { data: cfg = [] } = useCondRows("cond_config", "condominio_id", condominioId);
  const limRaw = cfg[0]?.["limite_veiculos_ativos"];
  const limite = limRaw === null || limRaw === undefined || limRaw === "" ? null : Number(limRaw);
  const ativos = veiculos.filter((v) => v["status"] !== false && v["arquivado"] !== true).length;

  async function buscarPlaca() {
    if (!placaOk) return;
    setBuscando(true);
    try {
      const r = await consultar({ data: { placa: placaOk } });
      if (!r.ok) { toast.info(r.motivo ?? "Preencha manualmente."); return; }
      const marcaId = achar(marcas, r.marca);
      const modeloTxt = r.modelo?.split("/").pop()?.trim();
      setN((x) => ({
        ...x, marca_id: marcaId || x.marca_id,
        modelo_id: achar(modelos.filter((m) => s(m["marca_id"]) === marcaId), modeloTxt) || x.modelo_id,
        cor_id: achar(cores, r.cor) || x.cor_id, ano: r.ano ?? x.ano,
        descricao_livre: [r.marca, r.modelo, r.cor].filter(Boolean).join(" · "),
      }));
      toast.success("Dados da placa preenchidos.");
    } finally { setBuscando(false); }
  }

  function editar(v: Row) {
    setN({ foto_url: s(v["foto_url"]), placa: s(v["placa"]), marca_id: s(v["marca_id"]), modelo_id: s(v["modelo_id"]), cor_id: s(v["cor_id"]), cond_vaga_id: s(v["cond_vaga_id"]), usuario_id: s(v["usuario_id"]), ano: s(v["ano"]), descricao_livre: s(v["descricao_livre"]) });
    setAberto(s(v["id"]));
  }

  return (
    <div className="space-y-3">
      <Cabecalho titulo="Veículos" total={veiculos.length} podeCriar={perms.canCreate} onNovo={() => { setN(vazio); setAberto(""); }} />
      <p className="text-xs text-muted-foreground">
        Cadastre quantos veículos quiser. Só os liberados passam na portaria e garagem
        {limite !== null ? ` (${ativos} de ${limite} liberados).` : ` (${ativos} liberados, sem limite).`}
      </p>
      {veiculos.length === 0 ? <Vazio texto="Nenhum veículo cadastrado." /> : veiculos.map((v) => (
        <div key={s(v["id"])} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm transition hover:bg-muted/40">
          <FotoCond tamanho="sm" disabled value={s(v["foto_url"])} onChange={() => {}} alt={`Foto ${s(v["placa"])}`} />
          <div className="min-w-0 flex-1">
            <p className="font-mono font-semibold">{s(v["placa"])}</p>
            <p className="text-xs text-muted-foreground">{[nome(marcas, v["marca_id"]), nome(modelos, v["modelo_id"]), nome(cores, v["cor_id"]), s(v["ano"])].filter(Boolean).join(" · ") || s(v["descricao_livre"]) || "—"}</p>
          </div>
          {v["usuario_id"] ? <Badge variant="secondary">{pessoas.find((p) => p.usuario_id === s(v["usuario_id"]))?.nome ?? "Morador"}</Badge> : null}
          {v["cond_vaga_id"] ? <Badge variant="outline">Vaga {s(vagas.find((x) => s(x["id"]) === s(v["cond_vaga_id"]))?.["identificacao"])}</Badge> : null}
          {v["arquivado"] === true ? <Badge variant="outline">Guardado (locação)</Badge> : (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch aria-label={`Liberado na portaria e garagem: ${s(v["placa"])}`} disabled={!perms.canUpdate} checked={v["status"] !== false}
                onCheckedChange={async (c) => {
                  if (c && !podeAtivarVeiculo(ativos, limite)) { toast.error(`Limite de ${limite} veículo(s) ativo(s) atingido. Desative outro veículo para liberar este.`); return; }
                  await salvar.mutateAsync({ id: s(v["id"]), valores: { status: c } });
                }} />
              {v["status"] !== false ? "Liberado" : "Bloqueado"}
            </label>
          )}
          {perms.canUpdate && <AcaoIcone titulo="Editar veículo" destaque onClick={() => editar(v)}><Pencil className="size-4" /></AcaoIcone>}
          {perms.canDelete && <AcaoIcone titulo="Excluir veículo" destrutivo onClick={async () => {
            if (await confirmar({ title: `Excluir ${s(v["placa"])}?`, destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
          }}><Trash2 className="size-4" /></AcaoIcone>}
        </div>
      ))}

      <Dialog open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{aberto ? "Editar veículo" : "Adicionar veículo"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <FotoCond value={n.foto_url} onChange={(u) => setN({ ...n, foto_url: u })} alt="Foto do veículo" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="v-placa">Placa *</Label>
                <div className="flex gap-1">
                  <Input id="v-placa" value={n.placa} maxLength={8} onChange={(e) => setN({ ...n, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
                  <Button type="button" variant="outline" aria-label="Consultar placa" disabled={!placaOk || buscando} onClick={buscarPlaca}>{buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Consultar</Button>
                </div>
                {n.descricao_livre && <p className="mt-1 text-xs text-muted-foreground">{n.descricao_livre}</p>}
              </div>
              <div><Label className="mb-1.5 block">Marca</Label><SearchSelect value={n.marca_id} onChange={(x) => setN({ ...n, marca_id: x, modelo_id: "" })} options={opt(marcas)} /></div>
              <div><Label className="mb-1.5 block">Modelo</Label><SearchSelect value={n.modelo_id} disabled={!n.marca_id} onChange={(x) => setN({ ...n, modelo_id: x })} options={opt(modelos.filter((m) => s(m["marca_id"]) === n.marca_id))} /></div>
              <div><Label className="mb-1.5 block">Cor</Label><SearchSelect value={n.cor_id} onChange={(x) => setN({ ...n, cor_id: x })} options={opt(cores)} /></div>
              <div><Label htmlFor="v-ano">Ano</Label><Input id="v-ano" value={n.ano} onChange={(e) => setN({ ...n, ano: e.target.value })} /></div>
              <div><Label className="mb-1.5 block">Morador responsável</Label><SearchSelect value={n.usuario_id} onChange={(x) => setN({ ...n, usuario_id: x })} options={pessoas.map((p) => ({ value: p.usuario_id, label: p.nome }))} emptyText="Cadastre moradores primeiro." /></div>
              <div><Label className="mb-1.5 block">Vaga</Label><SearchSelect value={n.cond_vaga_id} onChange={(x) => setN({ ...n, cond_vaga_id: x })} options={vagasUnidade} emptyText="A unidade não tem vaga." /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(null)}>Cancelar</Button>
            <Button disabled={!placaOk || salvar.isPending} onClick={async () => {
              const valores = { cond_unidade_id: unidadeId, foto_url: n.foto_url || null, placa: placaOk, marca_id: n.marca_id || null, modelo_id: n.modelo_id || null, cor_id: n.cor_id || null, cond_vaga_id: n.cond_vaga_id || null, usuario_id: n.usuario_id || null, ano: n.ano || null, descricao_livre: n.descricao_livre || null };
              await salvar.mutateAsync(aberto ? { id: aberto, valores } : { valores });
              setN(vazio); setAberto(null); toast.success(aberto ? "Veículo atualizado." : "Veículo cadastrado.");
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Lista com cadastro/edição em janela (pets, contatos). */
function ListaSimples({ unidadeId, perms, tabela, foto = false, campos, obrigatorios, resumo, icone: Icone, vazio, titulo }: {
  unidadeId: string; perms: Perms; tabela: string; vazio: string; foto?: boolean; titulo: string;
  campos: { k: string; l: string; opcoes?: { value: string; label: string }[]; tel?: boolean; largo?: boolean }[];
  obrigatorios: string[]; resumo: (r: Row) => { titulo: string; sub: string }; icone: typeof Phone;
}) {
  const { data: rows = [] } = useCondRows(tabela, "cond_unidade_id", unidadeId);
  const salvar = useCondSalvar(tabela);
  const inicial = Object.fromEntries(campos.map((c) => [c.k, c.opcoes?.[0]?.value ?? ""]));
  const [n, setN] = useState<Record<string, string>>(inicial);
  const [fotoN, setFotoN] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Cabecalho titulo={titulo} total={rows.length} podeCriar={perms.canCreate} onNovo={() => { setN(inicial); setFotoN(""); setAberto(""); }} />
      {rows.length === 0 ? <Vazio texto={vazio} /> : rows.map((r) => {
        const rs = resumo(r);
        return (
          <div key={s(r["id"])} className="flex items-center gap-3 rounded-lg border p-3 text-sm transition hover:bg-muted/40">
            {foto ? <FotoCond tamanho="sm" disabled value={s(r["foto_url"])} onChange={() => {}} /> : <span className="flex size-10 items-center justify-center rounded-full bg-muted"><Icone className="size-4" /></span>}
            <div className="min-w-0 flex-1"><p className="font-medium">{rs.titulo}</p><p className="truncate text-xs text-muted-foreground">{rs.sub}</p></div>
            {perms.canUpdate && <AcaoIcone titulo="Editar" destaque onClick={() => {
              setN(Object.fromEntries(campos.map((c) => [c.k, s(r[c.k])]))); setFotoN(s(r["foto_url"])); setAberto(s(r["id"]));
            }}><Pencil className="size-4" /></AcaoIcone>}
            {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={async () => {
              if (await confirmar({ title: "Excluir registro?", destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(r["id"]), excluir: true });
            }}><Trash2 className="size-4" /></AcaoIcone>}
          </div>
        );
      })}
      <Dialog open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{aberto ? "Editar" : "Adicionar"} · {titulo}</DialogTitle></DialogHeader>
          <div className={cn("grid gap-4", foto && "sm:grid-cols-[auto_1fr]")}>
            {foto && <FotoCond value={fotoN} onChange={setFotoN} />}
            <div className="grid gap-3 sm:grid-cols-2">
              {campos.map((c) => (
                <div key={c.k} className={c.largo ? "sm:col-span-2" : undefined}>
                  {c.opcoes ? (<><Label className="mb-1.5 block">{c.l}</Label><SearchSelect value={n[c.k] ?? ""} allowClear={false} options={c.opcoes} onChange={(x) => setN({ ...n, [c.k]: x })} /></>)
                    : c.tel ? (<><Label htmlFor={`${tabela}-${c.k}`}>{c.l}{obrigatorios.includes(c.k) && " *"}</Label><PhoneInput id={`${tabela}-${c.k}`} value={n[c.k] ?? ""} onChange={(x) => setN({ ...n, [c.k]: x })} /></>)
                    : (<><Label htmlFor={`${tabela}-${c.k}`}>{c.l}{obrigatorios.includes(c.k) && " *"}</Label><Input id={`${tabela}-${c.k}`} value={n[c.k] ?? ""} onChange={(e) => setN({ ...n, [c.k]: e.target.value })} /></>)}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(null)}>Cancelar</Button>
            <Button disabled={salvar.isPending || obrigatorios.some((k) => !n[k]?.trim())} onClick={async () => {
              const valores: Row = { cond_unidade_id: unidadeId };
              for (const c of campos) valores[c.k] = n[c.k]?.trim() || null;
              if (foto) valores["foto_url"] = fotoN || null;
              await salvar.mutateAsync(aberto ? { id: aberto, valores } : { valores });
              setAberto(null); toast.success(aberto ? "Atualizado." : "Cadastrado.");
            }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ESPECIES = [{ value: "cachorro", label: "Cachorro" }, { value: "gato", label: "Gato" }, { value: "outro", label: "Outro" }, { value: "passaro", label: "Pássaro" }];
const PORTES = [{ value: "pequeno", label: "Pequeno" }, { value: "medio", label: "Médio" }, { value: "grande", label: "Grande" }];

function Pets({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  return <ListaSimples titulo="Pets" unidadeId={unidadeId} perms={perms} tabela="cond_unidades_pets" foto icone={PawPrint} vazio="Nenhum pet cadastrado." obrigatorios={["nome"]}
    campos={[{ k: "nome", l: "Nome" }, { k: "especie", l: "Espécie", opcoes: ESPECIES }, { k: "raca", l: "Raça" }, { k: "porte", l: "Porte", opcoes: PORTES }, { k: "cor", l: "Cor" }]}
    resumo={(r) => ({ titulo: s(r["nome"]), sub: [ESPECIES.find((e) => e.value === s(r["especie"]))?.label, s(r["raca"]), PORTES.find((e) => e.value === s(r["porte"]))?.label, s(r["cor"])].filter(Boolean).join(" · ") })} />;
}

function Contatos({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  return <ListaSimples titulo="Contatos de emergência" unidadeId={unidadeId} perms={perms} tabela="cond_unidades_contatos" icone={Phone} vazio="Nenhum contato de emergência." obrigatorios={["nome", "telefone"]}
    campos={[{ k: "nome", l: "Nome", largo: true }, { k: "parentesco", l: "Parentesco / vínculo" }, { k: "telefone", l: "Telefone", tel: true }, { k: "telefone2", l: "Telefone 2", tel: true }, { k: "observacoes", l: "Observações", largo: true }]}
    resumo={(r) => ({ titulo: s(r["nome"]), sub: [s(r["parentesco"]), s(r["telefone"]), s(r["telefone2"])].filter(Boolean).join(" · ") })} />;
}

const TIPOS_DOC = [{ value: "contrato_locacao", label: "Contrato de locação" }, { value: "escritura", label: "Escritura / matrícula" }, { value: "outro", label: "Outro" }, { value: "procuracao", label: "Procuração" }];

function Documentos({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  const { data: docs = [] } = useCondRows("cond_unidades_documentos", "cond_unidade_id", unidadeId);
  const salvar = useCondSalvar("cond_unidades_documentos");
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("outro");
  const [inq, setInq] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [novo, setNovo] = useState(false);
  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from("cond-documentos").createSignedUrl(path, 300);
    if (error || !data) { toast.error("Não foi possível abrir o documento."); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <div className="space-y-3">
      <Cabecalho titulo="Documentos" total={docs.length} podeCriar={perms.canCreate} rotulo="Enviar documento" onNovo={() => { setTitulo(""); setTipo("outro"); setArquivo(null); setInq(false); setNovo(true); }} />
      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Enviar documento</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label htmlFor="d-tit">Título *</Label><Input id="d-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
            <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={tipo} allowClear={false} options={TIPOS_DOC} onChange={setTipo} /></div>
            <div><Label htmlFor="d-arq">Arquivo * (PDF ou imagem, até 10 MB)</Label><Input id="d-arq" type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></div>
            <label className="flex items-center gap-2 text-sm"><Switch checked={inq} onCheckedChange={setInq} /> Visível para o inquilino</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button disabled={!titulo.trim() || !arquivo || enviando} onClick={async () => {
              if (!arquivo) return;
              if (arquivo.size > 10 * 1024 * 1024) { toast.error("Arquivo maior que 10 MB."); return; }
              setEnviando(true);
              try {
                const path = `${unidadeId}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`;
                const up = await supabase.storage.from("cond-documentos").upload(path, arquivo);
                if (up.error) throw up.error;
                await salvar.mutateAsync({ valores: { cond_unidade_id: unidadeId, titulo: titulo.trim(), tipo, arquivo_url: path, visivel_inquilino: inq } });
                setNovo(false); toast.success("Documento enviado.");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no envio."); }
              finally { setEnviando(false); }
            }}>{enviando && <Loader2 className="size-4 animate-spin" />} Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {docs.length === 0 ? <Vazio texto="Nenhum documento." /> : docs.map((d) => (
        <div key={s(d["id"])} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <FileText className="size-4" />
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => abrir(s(d["arquivo_url"]))}>{s(d["titulo"])}</button>
          <Badge variant="outline">{TIPOS_DOC.find((t) => t.value === s(d["tipo"]))?.label ?? s(d["tipo"])}</Badge>
          {d["visivel_inquilino"] === true && <Badge variant="secondary">Inquilino vê</Badge>}
          {perms.canDelete && <Button size="icon" variant="ghost" className="ml-auto size-8 text-destructive" aria-label="Excluir documento" onClick={async () => {
            if (!(await confirmar({ title: "Excluir documento?", destructive: true, confirmText: "Excluir" }))) return;
            await supabase.storage.from("cond-documentos").remove([s(d["arquivo_url"])]);
            await salvar.mutateAsync({ id: s(d["id"]), excluir: true });
          }}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
    </div>
  );
}
