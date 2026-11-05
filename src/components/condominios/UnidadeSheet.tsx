import { useMemo, useState } from "react";
import { Car, DoorOpen, ParkingSquare, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { useTableRows } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { PAPEIS, TIPOS_UNIDADE, ordemNatural, s, useCatalogo, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
type Props = { unidade: Row; condominioId: string; blocoNome: string; perms: Perms; onClose: () => void };

export function UnidadeSheet({ unidade, condominioId, blocoNome, perms, onClose }: Props) {
  const id = s(unidade["id"]);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><DoorOpen className="size-5" /> {blocoNome} · Unidade {s(unidade["numero"])}</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="dados" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 w-fit">
            <TabsTrigger value="dados"><DoorOpen className="mr-1 size-4" /> Dados</TabsTrigger>
            <TabsTrigger value="moradores"><Users className="mr-1 size-4" /> Moradores</TabsTrigger>
            <TabsTrigger value="vagas"><ParkingSquare className="mr-1 size-4" /> Vagas</TabsTrigger>
            <TabsTrigger value="veiculos"><Car className="mr-1 size-4" /> Veículos</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <TabsContent value="dados"><DadosUnidade unidade={unidade} perms={perms} onClose={onClose} /></TabsContent>
            <TabsContent value="moradores"><Moradores unidadeId={id} perms={perms} /></TabsContent>
            <TabsContent value="vagas"><Vagas unidadeId={id} condominioId={condominioId} perms={perms} /></TabsContent>
            <TabsContent value="veiculos"><Veiculos unidadeId={id} condominioId={condominioId} perms={perms} /></TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function DadosUnidade({ unidade, perms, onClose }: { unidade: Row; perms: Perms; onClose: () => void }) {
  const salvar = useCondSalvar("cond_unidades");
  const [v, setV] = useState({
    numero: s(unidade["numero"]),
    andar: s(unidade["andar"]),
    tipo: s(unidade["tipo"]) || "apartamento",
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
        <div><Label htmlFor="u-area">Área privativa (m²)</Label><Input id="u-area" inputMode="decimal" disabled={ro} value={v.area_privativa} onChange={(e) => setV({ ...v, area_privativa: e.target.value })} /></div>
        <div><Label htmlFor="u-fr">Fração ideal</Label><Input id="u-fr" inputMode="decimal" disabled={ro} value={v.fracao_ideal} onChange={(e) => setV({ ...v, fracao_ideal: e.target.value })} /></div>
        <div className="flex items-end gap-2 pb-2"><Switch id="u-st" disabled={ro} checked={v.status} onCheckedChange={(c) => setV({ ...v, status: c })} /><Label htmlFor="u-st">Ativa</Label></div>
      </div>
      <div><Label htmlFor="u-obs">Observações</Label><Input id="u-obs" disabled={ro} value={v.observacoes} onChange={(e) => setV({ ...v, observacoes: e.target.value })} /></div>
      <div className="sticky bottom-0 flex justify-between gap-2 border-t bg-background pt-3">
        {perms.canDelete ? (
          <Button variant="ghost" className="text-destructive" onClick={async () => {
            if (!(await confirmar({ title: "Excluir unidade?", description: "Moradores, vagas e veículos vinculados serão desvinculados.", destructive: true, confirmText: "Excluir" }))) return;
            await salvar.mutateAsync({ id: s(unidade["id"]), excluir: true });
            toast.success("Unidade excluída."); onClose();
          }}><Trash2 className="size-4" /> Excluir</Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!ro && (
            <Button disabled={salvar.isPending || !v.numero.trim()} onClick={async () => {
              await salvar.mutateAsync({ id: s(unidade["id"]), valores: { numero: v.numero.trim(), andar: num(v.andar), tipo: v.tipo, area_privativa: num(v.area_privativa), fracao_ideal: num(v.fracao_ideal) ?? 0, observacoes: v.observacoes || null, status: v.status } });
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
];

function Moradores({ unidadeId, perms }: { unidadeId: string; perms: Perms }) {
  const { data: vinculos = [] } = useCondRows("cond_unidades_vinculos", "cond_unidade_id", unidadeId);
  const { data: usuarios = [] } = useTableRows("usuarios");
  const salvar = useCondSalvar("cond_unidades_vinculos");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [novoPapel, setNovoPapel] = useState("proprietario");
  const nomeDe = (uid: string) => {
    const u = usuarios.find((x) => s(x["id"]) === uid);
    return u ? s(u["nome"] || u["email"]) : "Usuário";
  };
  const opcoes = useMemo(() => usuarios.filter((u) => !vinculos.some((v) => s(v["usuario_id"]) === s(u["id"]))).map((u) => ({ value: s(u["id"]), label: s(u["nome"] || u["email"]), hint: s(u["email"]) })), [usuarios, vinculos]);
  const papelLabel = (p: string) => PAPEIS.find((x) => x.value === p)?.label ?? p;

  return (
    <div className="space-y-4">
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <div><Label className="mb-1.5 block">Usuário (com login)</Label><SearchSelect value={novoUsuario} onChange={setNovoUsuario} options={opcoes} placeholder="Selecione o usuário" /></div>
          <div><Label className="mb-1.5 block">Papel</Label><SearchSelect value={novoPapel} allowClear={false} onChange={setNovoPapel} options={PAPEIS} /></div>
          <Button disabled={!novoUsuario || salvar.isPending} onClick={async () => {
            await salvar.mutateAsync({ valores: { cond_unidade_id: unidadeId, usuario_id: novoUsuario, papel: novoPapel } });
            setNovoUsuario(""); toast.success("Vínculo adicionado.");
          }}><Plus className="size-4" /> Vincular</Button>
        </div>
      )}
      {vinculos.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum morador vinculado.</p> : vinculos.map((v) => (
        <div key={s(v["id"])} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <p className="font-medium">{nomeDe(s(v["usuario_id"]))}</p>
            <Badge variant="secondary">{papelLabel(s(v["papel"]))}</Badge>
            {perms.canDelete && <Button size="icon" variant="ghost" className="ml-auto size-8 text-destructive" aria-label="Remover vínculo" onClick={async () => {
              if (await confirmar({ title: "Remover vínculo?", destructive: true, confirmText: "Remover" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
            }}><Trash2 className="size-4" /></Button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {PERMISSOES.map((p) => (
              <label key={p.k} className="flex items-center gap-2 text-sm">
                <Switch disabled={!perms.canUpdate} checked={v[p.k] === true} onCheckedChange={(c) => salvar.mutate({ id: s(v["id"]), valores: { [p.k]: c } })} />
                {p.l}
              </label>
            ))}
          </div>
          {s(v["papel"]) === "proprietario" && v["is_residente"] === false && (
            <p className="text-xs text-muted-foreground">Proprietário não residente: reservas, visitantes e veículos ficam com o inquilino, conforme a convenção.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function Vagas({ unidadeId, condominioId, perms }: { unidadeId: string; condominioId: string; perms: Perms }) {
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const salvar = useCondSalvar("cond_vagas");
  const [nova, setNova] = useState("");
  const minhas = vagas.filter((v) => s(v["cond_unidade_id"]) === unidadeId).sort((a, b) => ordemNatural(s(a["identificacao"]), s(b["identificacao"])));
  const livres = vagas.filter((v) => !v["cond_unidade_id"]).map((v) => ({ value: s(v["id"]), label: s(v["identificacao"]), hint: s(v["piso_setor"]) || undefined }));
  const flags = (v: Row) => [v["is_pcd"] && "PCD", v["is_idoso"] && "Idoso", v["is_coberta"] ? "Coberta" : "Descoberta", v["is_gaveta"] && "Gaveta"].filter(Boolean) as string[];
  return (
    <div className="space-y-4">
      {perms.canUpdate && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="min-w-56 flex-1"><Label className="mb-1.5 block">Vincular vaga livre</Label><SearchSelect value={nova} onChange={setNova} options={livres} placeholder="Selecione a vaga" emptyText="Nenhuma vaga livre cadastrada." /></div>
          <Button disabled={!nova} onClick={async () => { await salvar.mutateAsync({ id: nova, valores: { cond_unidade_id: unidadeId } }); setNova(""); toast.success("Vaga vinculada."); }}><Plus className="size-4" /> Vincular</Button>
          {perms.canCreate && <Button variant="outline" onClick={async () => {
            const ident = await perguntar({ title: "Nova vaga", placeholder: "Identificação (ex.: G1-015)", required: true, confirmText: "Salvar" });
            if (ident?.trim()) { await salvar.mutateAsync({ valores: { condominio_id: condominioId, cond_unidade_id: unidadeId, identificacao: ident.trim() } }); toast.success("Vaga criada."); }
          }}>Nova vaga</Button>}
        </div>
      )}
      {minhas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma vaga vinculada.</p> : minhas.map((v) => (
        <div key={s(v["id"])} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ParkingSquare className="size-4" /><span className="font-medium">{s(v["identificacao"])}</span>
            {flags(v).map((f) => <Badge key={f} variant="outline">{f}</Badge>)}
            {perms.canUpdate && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => salvar.mutate({ id: s(v["id"]), valores: { cond_unidade_id: null } })}>Desvincular</Button>}
          </div>
          {perms.canUpdate && (
            <div className="grid gap-2 sm:grid-cols-4">
              {(["is_pcd", "is_idoso", "is_coberta", "is_gaveta"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <Switch checked={v[k] === true} onCheckedChange={(c) => salvar.mutate({ id: s(v["id"]), valores: { [k]: c } })} />
                  {{ is_pcd: "PCD", is_idoso: "Idoso", is_coberta: "Coberta", is_gaveta: "Gaveta" }[k]}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Veiculos({ unidadeId, condominioId, perms }: { unidadeId: string; condominioId: string; perms: Perms }) {
  const { data: veiculos = [] } = useCondRows("cond_unidades_veiculos", "cond_unidade_id", unidadeId);
  const { data: vagas = [] } = useCondRows("cond_vagas", "condominio_id", condominioId);
  const { data: marcas = [] } = useCatalogo("veiculos_marcas");
  const { data: modelos = [] } = useCatalogo("veiculos_modelos");
  const { data: cores = [] } = useCatalogo("veiculos_cores");
  const salvar = useCondSalvar("cond_unidades_veiculos");
  const vazio = { placa: "", marca_id: "", modelo_id: "", cor_id: "", cond_vaga_id: "" };
  const [n, setN] = useState(vazio);
  const opt = (rs: Row[]) => rs.map((r) => ({ value: s(r["id"]), label: s(r["descricao"]) }));
  const nome = (rs: Row[], id: unknown) => s(rs.find((r) => s(r["id"]) === s(id))?.["descricao"]);
  const vagasUnidade = vagas.filter((v) => s(v["cond_unidade_id"]) === unidadeId).map((v) => ({ value: s(v["id"]), label: s(v["identificacao"]) }));
  return (
    <div className="space-y-4">
      {perms.canCreate && (
        <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
          <div><Label htmlFor="v-placa">Placa</Label><Input id="v-placa" value={n.placa} maxLength={8} onChange={(e) => setN({ ...n, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" /></div>
          <div><Label className="mb-1.5 block">Marca</Label><SearchSelect value={n.marca_id} onChange={(x) => setN({ ...n, marca_id: x, modelo_id: "" })} options={opt(marcas)} /></div>
          <div><Label className="mb-1.5 block">Modelo</Label><SearchSelect value={n.modelo_id} disabled={!n.marca_id} onChange={(x) => setN({ ...n, modelo_id: x })} options={opt(modelos.filter((m) => s(m["marca_id"]) === n.marca_id))} /></div>
          <div><Label className="mb-1.5 block">Cor</Label><SearchSelect value={n.cor_id} onChange={(x) => setN({ ...n, cor_id: x })} options={opt(cores)} /></div>
          <div><Label className="mb-1.5 block">Vaga</Label><SearchSelect value={n.cond_vaga_id} onChange={(x) => setN({ ...n, cond_vaga_id: x })} options={vagasUnidade} emptyText="Vincule uma vaga na aba Vagas." /></div>
          <div className="flex items-end"><Button className="w-full" disabled={n.placa.trim().length < 7 || salvar.isPending} onClick={async () => {
            await salvar.mutateAsync({ valores: { cond_unidade_id: unidadeId, placa: n.placa.trim(), marca_id: n.marca_id || null, modelo_id: n.modelo_id || null, cor_id: n.cor_id || null, cond_vaga_id: n.cond_vaga_id || null } });
            setN(vazio); toast.success("Veículo cadastrado.");
          }}><Plus className="size-4" /> Adicionar</Button></div>
        </div>
      )}
      {veiculos.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado.</p> : veiculos.map((v) => (
        <div key={s(v["id"])} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <Car className="size-4" />
          <span className="font-mono font-semibold">{s(v["placa"])}</span>
          <span className="text-muted-foreground">{[nome(marcas, v["marca_id"]), nome(modelos, v["modelo_id"]), nome(cores, v["cor_id"])].filter(Boolean).join(" · ") || "—"}</span>
          {v["cond_vaga_id"] ? <Badge variant="outline">Vaga {nome(vagas.map((x) => ({ ...x, descricao: x["identificacao"] })), v["cond_vaga_id"])}</Badge> : null}
          {perms.canDelete && <Button size="icon" variant="ghost" className="ml-auto size-8 text-destructive" aria-label="Excluir veículo" onClick={async () => {
            if (await confirmar({ title: `Excluir ${s(v["placa"])}?`, destructive: true, confirmText: "Excluir" })) await salvar.mutateAsync({ id: s(v["id"]), excluir: true });
          }}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
    </div>
  );
}
