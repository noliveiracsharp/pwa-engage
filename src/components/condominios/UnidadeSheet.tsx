import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Car, DoorOpen, FileText, KeyRound, Loader2, PawPrint, Phone, Plus, Search, ShieldOff, Trash2, UserRound, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { OCUPACOES, PAPEIS, TIPOS_UNIDADE, s, useCatalogo, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type Props = { unidade: Row; condominioId: string; blocoNome: string; perms: Perms; onClose: () => void };
type Pessoa = { usuario_id: string; nome: string; email: string; celular: string | null; cpf: string | null; tem_acesso: boolean };

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
  const [ocupacao, setOcupacao] = useState(s(unidade["ocupacao"]) || "propria");
  const abas = [
    { v: "dados", l: "Dados", i: DoorOpen },
    { v: "proprietario", l: "Proprietário", i: UserRound },
    ...(ocupacao === "alugada" ? [{ v: "inquilino", l: "Inquilino", i: KeyRound }] : []),
    { v: "familia", l: "Família & colaboradores", i: Users },
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
        <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 h-auto w-fit flex-wrap justify-start">
            {abas.map((a) => <TabsTrigger key={a.v} value={a.v}><a.i className="mr-1 size-4" /> {a.l}</TabsTrigger>)}
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="dados"><DadosUnidade unidade={unidade} condominioId={condominioId} perms={perms} onClose={onClose} onOcupacao={setOcupacao} /></TabsContent>
            <TabsContent value="proprietario"><Pessoas unidadeId={id} perms={perms} lado="proprietario" papeis={["proprietario", "preposto"]} titulo="Proprietários e procuradores" /></TabsContent>
            <TabsContent value="inquilino"><Pessoas unidadeId={id} perms={perms} lado="inquilino" papeis={["inquilino"]} titulo="Inquilinos (locatários)" /></TabsContent>
            <TabsContent value="familia"><Pessoas unidadeId={id} perms={perms} lado={ocupacao === "alugada" ? "inquilino" : "proprietario"} papeis={["familiar", "colaborador", "visitante"]} titulo="Família, colaboradores e visitantes da unidade" /></TabsContent>
            <TabsContent value="prestadores"><Pessoas unidadeId={id} perms={perms} lado={ocupacao === "alugada" ? "inquilino" : "proprietario"} papeis={["prestador"]} titulo="Prestadores de serviço da unidade" /></TabsContent>
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
    ocupacao: s(unidade["ocupacao"]) || "propria",
    area_privativa: s(unidade["area_privativa"]),
    fracao_ideal: s(unidade["fracao_ideal"]),
    observacoes: s(unidade["observacoes"]),
    status: unidade["status"] !== false,
  });
  const ro = !perms.canUpdate;
  const num = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="u-num">Número</Label><Input id="u-num" disabled={ro} value={v.numero} onChange={(e) => setV({ ...v, numero: e.target.value })} /></div>
        <div><Label htmlFor="u-andar">Andar</Label><Input id="u-andar" type="number" disabled={ro} value={v.andar} onChange={(e) => setV({ ...v, andar: e.target.value })} /></div>
        <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={v.tipo} disabled={ro} allowClear={false} options={TIPOS_UNIDADE} onChange={(x) => setV({ ...v, tipo: x })} /></div>
        <div><Label className="mb-1.5 block">Ocupação</Label><SearchSelect value={v.ocupacao} disabled={ro} allowClear={false} options={OCUPACOES} onChange={(x) => setV({ ...v, ocupacao: x })} /></div>
        <div><Label htmlFor="u-area">Área privativa (m²)</Label><Input id="u-area" inputMode="decimal" disabled={ro} value={v.area_privativa} onChange={(e) => setV({ ...v, area_privativa: e.target.value })} /></div>
        <div><Label htmlFor="u-fr">Fração ideal</Label><Input id="u-fr" inputMode="decimal" disabled={ro} value={v.fracao_ideal} onChange={(e) => setV({ ...v, fracao_ideal: e.target.value })} /></div>
        <div className="flex items-end gap-2 pb-2"><Switch id="u-st" disabled={ro} checked={v.status} onCheckedChange={(c) => setV({ ...v, status: c })} /><Label htmlFor="u-st">Ativa</Label></div>
      </div>
      <div><Label htmlFor="u-obs">Observações</Label><Input id="u-obs" disabled={ro} value={v.observacoes} onChange={(e) => setV({ ...v, observacoes: e.target.value })} /></div>
      <div className="rounded-lg border p-3 text-sm">
        <p className="mb-1 font-medium">Vagas da unidade</p>
        {minhas.length ? <div className="flex flex-wrap gap-2">{minhas.map((x) => <Badge key={s(x["id"])} variant="outline">{s(x["identificacao"])} · {s(x["modalidade_posse"])}</Badge>)}</div>
          : <p className="text-muted-foreground">Nenhuma vaga. Gerencie em Garagem & Vagas, no menu lateral.</p>}
      </div>
      <div className="sticky bottom-0 flex justify-between gap-2 border-t bg-background pt-3">
        {perms.canDelete ? (
          <Button variant="ghost" className="text-destructive" onClick={async () => {
            if (!(await confirmar({ title: "Excluir unidade?", description: "Moradores, pets, documentos e veículos vinculados serão removidos.", destructive: true, confirmText: "Excluir" }))) return;
            await salvar.mutateAsync({ id: s(unidade["id"]), excluir: true });
            toast.success("Unidade excluída."); onClose();
          }}><Trash2 className="size-4" /> Excluir</Button>
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

function Pessoas({ unidadeId, perms, lado, papeis, titulo }: { unidadeId: string; perms: Perms; lado: string; papeis: string[]; titulo: string }) {
  const qc = useQueryClient();
  const { data: vinculos = [] } = useCondRows("cond_unidades_vinculos", "cond_unidade_id", unidadeId);
  const { data: pessoas = [] } = usePessoas(unidadeId);
  const salvar = useCondSalvar("cond_unidades_vinculos");
  const vazio = { nome: "", email: "", celular: "", cpf: "", papel: papeis[0]!, extra: "" };
  const [n, setN] = useState(vazio);
  const [ocupado, setOcupado] = useState(false);
  const meus = vinculos.filter((v) => papeis.includes(s(v["papel"])) && (s(v["lado"]) || "proprietario") === lado);
  const pessoa = (uid: string) => pessoas.find((p) => p.usuario_id === uid);
  const papelLabel = (p: string) => PAPEIS.find((x) => x.value === p)?.label ?? p;
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "cond_unidades_vinculos"] });
  const extraLabel = n.papel === "prestador" ? "Função (diarista, babá…)" : n.papel === "familiar" || n.papel === "visitante" ? "Parentesco" : "";

  async function acao(fn: string, args: Record<string, unknown>, ok: string) {
    setOcupado(true);
    try {
      const { error } = await rpc(fn, args);
      if (error) throw new Error(error.message);
      toast.success(ok); await recarregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{titulo}</p>
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div><Label htmlFor={`p-nome-${lado}`}>Nome</Label><Input id={`p-nome-${lado}`} value={n.nome} onChange={(e) => setN({ ...n, nome: e.target.value })} /></div>
          <div><Label htmlFor={`p-email-${lado}`}>E-mail (obrigatório)</Label><Input id={`p-email-${lado}`} type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></div>
          <div><Label htmlFor={`p-cel-${lado}`}>Celular</Label><Input id={`p-cel-${lado}`} value={n.celular} onChange={(e) => setN({ ...n, celular: e.target.value })} /></div>
          <div><Label htmlFor={`p-cpf-${lado}`}>CPF</Label><Input id={`p-cpf-${lado}`} value={n.cpf} onChange={(e) => setN({ ...n, cpf: e.target.value })} /></div>
          {papeis.length > 1 && <div><Label className="mb-1.5 block">Papel</Label><SearchSelect value={n.papel} allowClear={false} onChange={(x) => setN({ ...n, papel: x })} options={PAPEIS.filter((p) => papeis.includes(p.value))} /></div>}
          {extraLabel && <div><Label htmlFor={`p-extra-${lado}`}>{extraLabel}</Label><Input id={`p-extra-${lado}`} value={n.extra} onChange={(e) => setN({ ...n, extra: e.target.value })} /></div>}
          <div className="flex items-end sm:col-start-3"><Button className="w-full" disabled={ocupado || !n.nome.trim() || !n.email.includes("@")} onClick={async () => {
            await acao("cond_morador_vincular", {
              p_unidade: unidadeId, p_nome: n.nome, p_email: n.email, p_celular: n.celular, p_cpf: n.cpf, p_papel: n.papel, p_lado: lado,
              p_extra: n.papel === "prestador" ? { prestador_funcao: n.extra } : { parentesco: n.extra },
            }, "Pessoa vinculada.");
            setN(vazio);
          }}><Plus className="size-4" /> Adicionar</Button></div>
        </div>
      )}
      {meus.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Ninguém cadastrado.</p> : meus.map((v) => {
        const p = pessoa(s(v["usuario_id"]));
        return (
          <div key={s(v["id"])} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto">
                <p className="font-medium">{p?.nome ?? "—"} <Badge variant="secondary" className="ml-1">{papelLabel(s(v["papel"]))}</Badge></p>
                <p className="text-xs text-muted-foreground">{[p?.email, p?.celular, s(v["parentesco"]) || s(v["prestador_funcao"])].filter(Boolean).join(" · ")}</p>
              </div>
              <Badge variant={p?.tem_acesso ? "default" : "outline"}>{p?.tem_acesso ? "Acesso ativo" : "Sem acesso"}</Badge>
              {perms.canUpdate && p && (p.tem_acesso ? (
                <Button size="sm" variant="outline" className="text-destructive" disabled={ocupado} onClick={async () => {
                  if (!(await confirmar({ title: `Revogar acesso de ${p.nome}?`, description: "O login é apagado e as sessões abertas caem. O cadastro e os vínculos continuam.", destructive: true, confirmText: "Revogar" }))) return;
                  await acao("cond_revogar_acesso", { p_usuario: p.usuario_id }, "Acesso revogado.");
                }}><ShieldOff className="size-4" /> Revogar acesso</Button>
              ) : (
                <Button size="sm" variant="outline" disabled={ocupado} onClick={async () => {
                  const senha = await perguntar({ title: `Liberar acesso para ${p.nome}`, description: `Login: ${p.email}. Defina a senha inicial (mínimo 6 caracteres).`, placeholder: "Senha inicial", required: true, confirmText: "Liberar" });
                  if (senha) await acao("cond_liberar_acesso", { p_usuario: p.usuario_id, p_senha: senha }, "Acesso liberado.");
                }}><KeyRound className="size-4" /> Liberar acesso</Button>
              ))}
              {perms.canDelete && <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Remover vínculo" onClick={async () => {
                if (await confirmar({ title: "Remover vínculo com a unidade?", description: "O cadastro da pessoa é mantido.", destructive: true, confirmText: "Remover" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
              }}><Trash2 className="size-4" /></Button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {PERMISSOES.map((x) => (
                <label key={x.k} className="flex items-center gap-2 text-sm">
                  <Switch disabled={!perms.canUpdate} checked={v[x.k] === true} onCheckedChange={(c) => salvar.mutate({ id: s(v["id"]), valores: { [x.k]: c } })} />
                  {x.l}
                </label>
              ))}
            </div>
          </div>
        );
      })}
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
  const vazio = { placa: "", marca_id: "", modelo_id: "", cor_id: "", cond_vaga_id: "", usuario_id: "", ano: "", descricao_livre: "" };
  const [n, setN] = useState(vazio);
  const [buscando, setBuscando] = useState(false);
  const opt = (rs: Row[]) => rs.map((r) => ({ value: s(r["id"]), label: s(r["descricao"]) }));
  const nome = (rs: Row[], id: unknown) => s(rs.find((r) => s(r["id"]) === s(id))?.["descricao"]);
  const achar = (rs: Row[], txt?: string) => (txt ? s(rs.find((r) => s(r["descricao"]).toLowerCase() === txt.toLowerCase())?.["id"]) : "");
  const vagasUnidade = vagas.filter((v) => s(v["cond_unidade_id"]) === unidadeId).map((v) => ({ value: s(v["id"]), label: s(v["identificacao"]) }));
  const placaOk = normalizarPlaca(n.placa);

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

  return (
    <div className="space-y-4">
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="v-placa">Placa</Label>
            <div className="flex gap-1">
              <Input id="v-placa" value={n.placa} maxLength={8} onChange={(e) => setN({ ...n, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" />
              <Button type="button" size="icon" variant="outline" aria-label="Consultar placa" disabled={!placaOk || buscando} onClick={buscarPlaca}>{buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button>
            </div>
            {n.descricao_livre && <p className="mt-1 text-xs text-muted-foreground">{n.descricao_livre}</p>}
          </div>
          <div><Label className="mb-1.5 block">Marca</Label><SearchSelect value={n.marca_id} onChange={(x) => setN({ ...n, marca_id: x, modelo_id: "" })} options={opt(marcas)} /></div>
          <div><Label className="mb-1.5 block">Modelo</Label><SearchSelect value={n.modelo_id} disabled={!n.marca_id} onChange={(x) => setN({ ...n, modelo_id: x })} options={opt(modelos.filter((m) => s(m["marca_id"]) === n.marca_id))} /></div>
          <div><Label className="mb-1.5 block">Cor</Label><SearchSelect value={n.cor_id} onChange={(x) => setN({ ...n, cor_id: x })} options={opt(cores)} /></div>
          <div><Label htmlFor="v-ano">Ano</Label><Input id="v-ano" value={n.ano} onChange={(e) => setN({ ...n, ano: e.target.value })} /></div>
          <div><Label className="mb-1.5 block">Morador responsável</Label><SearchSelect value={n.usuario_id} onChange={(x) => setN({ ...n, usuario_id: x })} options={pessoas.map((p) => ({ value: p.usuario_id, label: p.nome }))} emptyText="Cadastre moradores primeiro." /></div>
          <div><Label className="mb-1.5 block">Vaga</Label><SearchSelect value={n.cond_vaga_id} onChange={(x) => setN({ ...n, cond_vaga_id: x })} options={vagasUnidade} emptyText="A unidade não tem vaga." /></div>
          <div className="flex items-end sm:col-start-3"><Button className="w-full" disabled={!placaOk || salvar.isPending} onClick={async () => {
            await salvar.mutateAsync({ valores: { cond_unidade_id: unidadeId, placa: placaOk, marca_id: n.marca_id || null, modelo_id: n.modelo_id || null, cor_id: n.cor_id || null, cond_vaga_id: n.cond_vaga_id || null, usuario_id: n.usuario_id || null, ano: n.ano || null, descricao_livre: n.descricao_livre || null } });
            setN(vazio); toast.success("Veículo cadastrado.");
          }}><Plus className="size-4" /> Adicionar</Button></div>
        </div>
      )}
      {veiculos.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado.</p> : veiculos.map((v) => (
        <div key={s(v["id"])} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <Car className="size-4" />
          <span className="font-mono font-semibold">{s(v["placa"])}</span>
          <span className="text-muted-foreground">{[nome(marcas, v["marca_id"]), nome(modelos, v["modelo_id"]), nome(cores, v["cor_id"]), s(v["ano"])].filter(Boolean).join(" · ") || s(v["descricao_livre"]) || "—"}</span>
          {v["usuario_id"] ? <Badge variant="secondary">{pessoas.find((p) => p.usuario_id === s(v["usuario_id"]))?.nome ?? "Morador"}</Badge> : null}
          {v["cond_vaga_id"] ? <Badge variant="outline">Vaga {s(vagas.find((x) => s(x["id"]) === s(v["cond_vaga_id"]))?.["identificacao"])}</Badge> : null}
          {perms.canDelete && <Button size="icon" variant="ghost" className="ml-auto size-8 text-destructive" aria-label="Excluir veículo" onClick={async () => {
            if (await confirmar({ title: `Excluir ${s(v["placa"])}?`, destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
          }}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
    </div>
  );
}

/** Lista simples com formulário de inclusão (pets, contatos). */
function ListaSimples({ unidadeId, perms, tabela, campos, obrigatorios, resumo, icone: Icone, vazio }: {
  unidadeId: string; perms: Perms; tabela: string; vazio: string;
  campos: { k: string; l: string; opcoes?: { value: string; label: string }[] }[];
  obrigatorios: string[]; resumo: (r: Row) => string; icone: typeof Phone;
}) {
  const { data: rows = [] } = useCondRows(tabela, "cond_unidade_id", unidadeId);
  const salvar = useCondSalvar(tabela);
  const inicial = Object.fromEntries(campos.map((c) => [c.k, c.opcoes?.[0]?.value ?? ""]));
  const [n, setN] = useState<Record<string, string>>(inicial);
  return (
    <div className="space-y-4">
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          {campos.map((c) => (
            <div key={c.k}>
              {c.opcoes ? (<><Label className="mb-1.5 block">{c.l}</Label><SearchSelect value={n[c.k] ?? ""} allowClear={false} options={c.opcoes} onChange={(x) => setN({ ...n, [c.k]: x })} /></>)
                : (<><Label htmlFor={`${tabela}-${c.k}`}>{c.l}</Label><Input id={`${tabela}-${c.k}`} value={n[c.k] ?? ""} onChange={(e) => setN({ ...n, [c.k]: e.target.value })} /></>)}
            </div>
          ))}
          <div className="flex items-end"><Button className="w-full" disabled={salvar.isPending || obrigatorios.some((k) => !n[k]?.trim())} onClick={async () => {
            const valores: Row = { cond_unidade_id: unidadeId };
            for (const c of campos) valores[c.k] = n[c.k]?.trim() || null;
            await salvar.mutateAsync({ valores }); setN(inicial); toast.success("Cadastrado.");
          }}><Plus className="size-4" /> Adicionar</Button></div>
        </div>
      )}
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p> : rows.map((r) => (
        <div key={s(r["id"])} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Icone className="size-4" /><span>{resumo(r)}</span>
          {perms.canDelete && <Button size="icon" variant="ghost" className="ml-auto size-8 text-destructive" aria-label="Excluir" onClick={async () => {
            if (await confirmar({ title: "Excluir registro?", destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(r["id"]), excluir: true });
          }}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
    </div>
  );
}

const ESPECIES = [{ value: "cachorro", label: "Cachorro" }, { value: "gato", label: "Gato" }, { value: "outro", label: "Outro" }, { value: "passaro", label: "Pássaro" }];
const PORTES = [{ value: "pequeno", label: "Pequeno" }, { value: "medio", label: "Médio" }, { value: "grande", label: "Grande" }];

function Pets({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  return <ListaSimples unidadeId={unidadeId} perms={perms} tabela="cond_unidades_pets" icone={PawPrint} vazio="Nenhum pet cadastrado." obrigatorios={["nome"]}
    campos={[{ k: "nome", l: "Nome" }, { k: "especie", l: "Espécie", opcoes: ESPECIES }, { k: "raca", l: "Raça" }, { k: "porte", l: "Porte", opcoes: PORTES }, { k: "cor", l: "Cor" }]}
    resumo={(r) => [s(r["nome"]), s(r["especie"]), s(r["raca"]), s(r["porte"]), s(r["cor"])].filter(Boolean).join(" · ")} />;
}

function Contatos({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  return <ListaSimples unidadeId={unidadeId} perms={perms} tabela="cond_unidades_contatos" icone={Phone} vazio="Nenhum contato de emergência." obrigatorios={["nome", "telefone"]}
    campos={[{ k: "nome", l: "Nome" }, { k: "parentesco", l: "Parentesco / vínculo" }, { k: "telefone", l: "Telefone" }, { k: "telefone2", l: "Telefone 2" }, { k: "observacoes", l: "Observações" }]}
    resumo={(r) => [s(r["nome"]), s(r["parentesco"]), s(r["telefone"]), s(r["telefone2"])].filter(Boolean).join(" · ")} />;
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
  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from("cond-documentos").createSignedUrl(path, 300);
    if (error || !data) return toast.error("Não foi possível abrir o documento.");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <div className="space-y-4">
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div><Label htmlFor="d-tit">Título</Label><Input id="d-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={tipo} allowClear={false} options={TIPOS_DOC} onChange={setTipo} /></div>
          <div><Label htmlFor="d-arq">Arquivo (PDF ou imagem, até 10 MB)</Label><Input id="d-arq" type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={inq} onCheckedChange={setInq} /> Visível para o inquilino</label>
          <div className="flex items-end sm:col-start-3"><Button className="w-full" disabled={!titulo.trim() || !arquivo || enviando} onClick={async () => {
            if (!arquivo) return;
            if (arquivo.size > 10 * 1024 * 1024) return toast.error("Arquivo maior que 10 MB.");
            setEnviando(true);
            try {
              const path = `${unidadeId}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`;
              const up = await supabase.storage.from("cond-documentos").upload(path, arquivo);
              if (up.error) throw up.error;
              await salvar.mutateAsync({ valores: { cond_unidade_id: unidadeId, titulo: titulo.trim(), tipo, arquivo_url: path, visivel_inquilino: inq } });
              setTitulo(""); setArquivo(null); setInq(false); toast.success("Documento enviado.");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Falha no envio."); }
            finally { setEnviando(false); }
          }}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Enviar</Button></div>
        </div>
      )}
      {docs.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum documento.</p> : docs.map((d) => (
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
