import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Car, Fuel, Loader2, LogIn, LogOut } from "lucide-react";
import { AbastecimentosTab } from "@/components/frota/Abastecimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/hooks/useAuth";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { matchesAny } from "@/lib/input-masks";
import { uploadFoto } from "@/lib/laudos";
import { lerOdometro } from "@/lib/frota.functions";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/veiculos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Frota e Diário de Bordo — Atende.ai" },
      { name: "description", content: "Cadastro de veículos da frota e diário de bordo com foto do odômetro na saída e na chegada." },
      { property: "og:title", content: "Frota e Diário de Bordo — Atende.ai" },
      { property: "og:description", content: "Cadastro de veículos da frota e diário de bordo com foto do odômetro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VeiculosPage,
});

const STATUS = [
  { value: "disponivel", label: "Disponível", cls: "bg-success/15 text-success" },
  { value: "em_rota", label: "Em rota", cls: "bg-primary/15 text-primary" },
  { value: "em_manutencao", label: "Em manutenção", cls: "bg-warning/15 text-warning" },
  { value: "inativo", label: "Inativo", cls: "bg-muted text-muted-foreground" },
];
const COMBUSTIVEIS = [
  { value: "flex", label: "Flex" },
  { value: "gasolina", label: "Gasolina" },
  { value: "alcool", label: "Álcool" },
  { value: "diesel", label: "Diesel" },
];

const fmtKm = (v: unknown) => (v == null || v === "" ? "—" : `${Number(v).toLocaleString("pt-BR")} km`);
const fmtDt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const placaDe = (v: Row | undefined) => (v ? `${String(v["placa"] ?? "")} · ${String(v["modelo"] ?? "")}` : "—");

function duracao(a: unknown, b: unknown) {
  if (!a || !b) return "—";
  const min = Math.max(0, Math.round((new Date(String(b)).getTime() - new Date(String(a)).getTime()) / 60000));
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function StatusPill({ value }: { value: unknown }) {
  const s = STATUS.find((x) => x.value === value) ?? STATUS[3]!;
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>{s.label}</span>;
}

function VeiculosPage() {
  const perms = usePagePermissions("/veiculos");
  const { data: veiculos = [], isLoading } = useTableRows("veiculos");
  const { data: diario = [], isLoading: loadingDiario } = useTableRows("veiculos_diario");
  const remove = useDeleteRecord("veiculos");
  const [editando, setEditando] = useState<Row | null | undefined>(undefined);
  const [viagem, setViagem] = useState<{ modo: "saida" | "chegada"; registro?: Row } | null>(null);
  const [f, setF] = useState({ busca: "", status: "todos" });
  const [fd, setFd] = useState({ busca: "", veiculo: "todos" });
  const [abastecendo, setAbastecendo] = useState(false);
  const [aba, setAba] = useState("veiculos");
  const { usuarioId } = useAudit();

  const veiculoById = useMemo(() => new Map(veiculos.map((v) => [String(rowId(v)), v])), [veiculos]);
  const abertas = diario.filter((d) => d["status"] === "em_andamento");
  const minhaAberta = abertas.find((d) => String(d["condutor_id"] ?? "") === String(usuarioId ?? "")) ?? abertas[0];

  const rows = useMemo(
    () =>
      veiculos
        .filter((v) => matchesAny([v["placa"], v["marca"], v["modelo"], v["cor"]], f.busca) && (f.status === "todos" || v["status"] === f.status))
        .sort((a, b) => String(a["placa"]).localeCompare(String(b["placa"]))),
    [veiculos, f],
  );
  const rowsDiario = useMemo(
    () =>
      diario
        .filter((d) => {
          const v = veiculoById.get(String(d["veiculo_id"]));
          return (fd.veiculo === "todos" || String(d["veiculo_id"]) === fd.veiculo) && matchesAny([d["condutor_nome"], d["finalidade"], v?.["placa"]], fd.busca);
        })
        .sort((a, b) => String(b["saida_em"]).localeCompare(String(a["saida_em"]))),
    [diario, fd, veiculoById],
  );

  const columns: Column[] = [
    { key: "placa", header: "Placa", fields: ["placa"], render: (r) => <span className="font-mono font-semibold">{String(r["placa"] ?? "")}</span> },
    { key: "veiculo", header: "Veículo", fields: ["modelo"], render: (r) => `${String(r["marca"] ?? "")} ${String(r["modelo"] ?? "")} ${r["ano"] ? `(${String(r["ano"])})` : ""}`.trim() },
    { key: "cor", header: "Cor", fields: ["cor"] },
    { key: "km", header: "KM atual", fields: ["km_atual"], render: (r) => <span className="tabular-nums">{fmtKm(r["km_atual"])}</span> },
    {
      key: "consumo", header: "Consumo (G / A)", fields: [],
      render: (r) => `${r["consumo_gasolina"] ? `${String(r["consumo_gasolina"])} km/l` : "—"} / ${r["consumo_alcool"] ? `${String(r["consumo_alcool"])} km/l` : "—"}`,
    },
    {
      key: "status", header: "Status", fields: ["status"],
      render: (r) => {
        const em = abertas.find((d) => String(d["veiculo_id"]) === String(rowId(r)));
        return (
          <div className="flex flex-col gap-0.5">
            <StatusPill value={r["status"]} />
            {em && <span className="text-muted-foreground text-xs">{String(em["condutor_nome"] ?? "")}</span>}
          </div>
        );
      },
    },
  ];

  const colsDiario: Column[] = [
    { key: "veiculo", header: "Veículo", fields: [], render: (r) => placaDe(veiculoById.get(String(r["veiculo_id"]))) },
    { key: "condutor", header: "Condutor", fields: ["condutor_nome"] },
    { key: "saida", header: "Saída", fields: ["saida_em"], render: (r) => <FotoKm foto={r["foto_inicial"]} km={r["km_inicial"]} dt={r["saida_em"]} /> },
    {
      key: "chegada", header: "Chegada", fields: ["chegada_em"],
      render: (r) => (r["status"] === "concluido" ? <FotoKm foto={r["foto_final"]} km={r["km_final"]} dt={r["chegada_em"]} /> : <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Em rota</span>),
    },
    { key: "km", header: "Rodado", fields: ["km_total"], render: (r) => <span className="font-semibold tabular-nums">{fmtKm(r["km_total"])}</span> },
    { key: "tempo", header: "Tempo", fields: [], render: (r) => duracao(r["saida_em"], r["chegada_em"]) },
    { key: "finalidade", header: "Finalidade", fields: ["finalidade"], render: (r) => <span className="line-clamp-2 max-w-60">{String(r["finalidade"] ?? "—")}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={() => setViagem({ modo: "saida" })} disabled={!perms.canCreate}>
          <LogOut className="mr-2 size-4" /> Registrar saída
        </Button>
        <Button size="lg" variant="secondary" disabled={!minhaAberta || !perms.canUpdate} onClick={() => minhaAberta && setViagem({ modo: "chegada", registro: minhaAberta })}>
          <LogIn className="mr-2 size-4" /> Registrar chegada
        </Button>
        <Button size="lg" variant="outline" disabled={!perms.canCreate} onClick={() => { setAba("abastecimentos"); setAbastecendo(true); }}>
          <Fuel className="mr-2 size-4" /> Abastecer
        </Button>
        {abertas.length > 0 && <span className="text-muted-foreground text-sm">{abertas.length} veículo(s) em rota</span>}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="veiculos">Veículos</TabsTrigger>
          <TabsTrigger value="diario">Diário de bordo</TabsTrigger>
          <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="abastecimentos">
          <AbastecimentosTab veiculos={veiculos} perms={perms} aberto={abastecendo} setAberto={setAbastecendo} />
        </TabsContent>
        <TabsContent value="veiculos">
          <DataTable
            title="Veículos da frota"
            columns={columns}
            rows={rows}
            loading={isLoading}
            getValue={(row, keys) => pick(row, keys)}
            rowKey={(r, i) => String(rowId(r) ?? i)}
            onAdd={perms.canCreate ? () => setEditando(null) : undefined}
            onEdit={(r) => setEditando(r)}
            editReadOnly={!perms.canUpdate}
            onDelete={perms.canDelete ? (r) => remove.mutate(r) : undefined}
            filters={
              <>
                <FilterInput label="Busca" value={f.busca} onChange={(busca) => setF({ ...f, busca })} placeholder="Placa, marca, modelo…" />
                <FilterSelect label="Status" value={f.status} onChange={(status) => setF({ ...f, status })} options={[{ value: "todos", label: "Todos" }, ...STATUS]} />
              </>
            }
          />
        </TabsContent>
        <TabsContent value="diario">
          <DataTable
            title="Diário de bordo"
            columns={colsDiario}
            rows={rowsDiario}
            loading={loadingDiario}
            getValue={(row, keys) => pick(row, keys)}
            rowKey={(r, i) => String(rowId(r) ?? i)}
            onEdit={(r) => r["status"] === "em_andamento" && perms.canUpdate && setViagem({ modo: "chegada", registro: r })}
            filters={
              <>
                <FilterInput label="Busca" value={fd.busca} onChange={(busca) => setFd({ ...fd, busca })} placeholder="Condutor, finalidade, placa…" />
                <FilterSelect
                  label="Veículo"
                  value={fd.veiculo}
                  onChange={(veiculo) => setFd({ ...fd, veiculo })}
                  options={[{ value: "todos", label: "Todos" }, ...veiculos.map((v) => ({ value: String(rowId(v)), label: placaDe(v) }))]}
                />
              </>
            }
          />
        </TabsContent>
      </Tabs>

      {editando !== undefined && <VeiculoSheet original={editando} readOnly={!!editando && !perms.canUpdate} onClose={() => setEditando(undefined)} />}
      {viagem && <ViagemSheet {...viagem} veiculos={veiculos} onClose={() => setViagem(null)} />}
    </div>
  );
}

function FotoKm({ foto, km, dt }: { foto: unknown; km: unknown; dt: unknown }) {
  return (
    <div className="flex items-center gap-2">
      {foto ? (
        <a href={String(foto)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          <img src={String(foto)} alt="Odômetro" className="size-10 rounded object-cover" />
        </a>
      ) : null}
      <div className="text-xs">
        <div className="font-medium tabular-nums">{fmtKm(km)}</div>
        <div className="text-muted-foreground">{fmtDt(dt)}</div>
      </div>
    </div>
  );
}

/* ----------------------------- Cadastro do veículo ----------------------------- */

function VeiculoSheet({ original, readOnly, onClose }: { original: Row | null; readOnly: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { isMaster, empresa } = useAuth();
  const [v, setV] = useState<Row>(() => ({ status: "disponivel", combustivel: "flex", km_atual: 0, ...(original ?? {}) }));
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const numOrNull = (x: unknown) => (x === "" || x == null ? null : Number(String(x).replace(",", ".")));

  const salvar = async () => {
    const placa = String(v["placa"] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (placa.length !== 7) return void toast.error("Informe uma placa válida (7 caracteres).");
    const values: Row = {
      placa,
      marca: v["marca"] || null,
      modelo: v["modelo"] || null,
      ano: numOrNull(v["ano"]),
      cor: v["cor"] || null,
      combustivel: v["combustivel"],
      consumo_gasolina: numOrNull(v["consumo_gasolina"]),
      consumo_alcool: numOrNull(v["consumo_alcool"]),
      km_atual: numOrNull(v["km_atual"]) ?? 0,
      status: v["status"],
      observacao: v["observacao"] || null,
    };
    setSalvando(true);
    const payload = stamp(values, !original);
    delete payload["alterado_por"];
    if (!original && isMaster && empresa) payload["empresa_id"] = rowId(empresa);
    const { error } = original
      ? await supabase.from("veiculos").update(payload).eq("id", String(rowId(original)))
      : await supabase.from("veiculos").insert(payload);
    setSalvando(false);
    if (error) return void toast.error(error.message.includes("veiculos_empresa_placa") ? "Já existe um veículo com essa placa." : error.message);
    qc.invalidateQueries({ queryKey: ["table", "veiculos"] });
    toast.success("Veículo salvo.");
    onClose();
  };

  const campo = (k: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={String(v[k] ?? "")} onChange={(e) => set(k, e.target.value)} disabled={readOnly} {...props} />
    </div>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><Car className="size-5" /> {original ? `Veículo ${String(original["placa"])}` : "Novo veículo"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section className="grid gap-4 sm:grid-cols-3">
            {campo("placa", "Placa *", { placeholder: "EXI7U40", maxLength: 8, className: "font-mono uppercase" })}
            {campo("marca", "Marca", { placeholder: "Chevrolet" })}
            {campo("modelo", "Modelo", { placeholder: "Celta" })}
            {campo("ano", "Ano", { inputMode: "numeric", placeholder: "2010", maxLength: 4 })}
            {campo("cor", "Cor", { placeholder: "Preto" })}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={String(v["status"])} onValueChange={(x) => set("status", x)} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Consumo e quilometragem</h3>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Combustível</Label>
                <Select value={String(v["combustivel"])} onValueChange={(x) => set("combustivel", x)} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMBUSTIVEIS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {campo("consumo_gasolina", "Gasolina (km/l)", { inputMode: "decimal", placeholder: "12,5" })}
              {campo("consumo_alcool", "Álcool (km/l)", { inputMode: "decimal", placeholder: "8,7" })}
              {campo("km_atual", "KM atual", { inputMode: "numeric" })}
            </div>
            <p className="text-muted-foreground text-xs">O KM atual é atualizado sozinho a cada chegada registrada no diário de bordo.</p>
          </section>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={String(v["observacao"] ?? "")} onChange={(e) => set("observacao", e.target.value)} disabled={readOnly} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ----------------------------- Saída / Chegada ----------------------------- */

function ViagemSheet({ modo, registro, veiculos, onClose }: { modo: "saida" | "chegada"; registro?: Row; veiculos: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { usuario, isMaster, empresa } = useAuth();
  const { empresaId, usuarioId } = useAudit();
  const saida = modo === "saida";
  const disponiveis = veiculos.filter((v) => v["status"] === "disponivel");
  const veiculoReg = registro ? veiculos.find((v) => String(rowId(v)) === String(registro["veiculo_id"])) : undefined;
  const [veiculoId, setVeiculoId] = useState(registro ? String(registro["veiculo_id"]) : disponiveis.length === 1 ? String(rowId(disponiveis[0]!)) : "");
  const [foto, setFoto] = useState("");
  const [km, setKm] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [obs, setObs] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const veiculo = veiculos.find((v) => String(rowId(v)) === veiculoId);
  const kmRef = saida ? Number(veiculo?.["km_atual"] ?? 0) : Number(registro?.["km_inicial"] ?? 0);

  const onFoto = async (file: File | undefined) => {
    if (!file) return;
    setEnviandoFoto(true);
    try {
      const url = await uploadFoto(file);
      setFoto(url);
      setLendo(true);
      const { km: lido } = await lerOdometro({ data: { url } });
      if (lido) {
        setKm(String(lido));
        toast.success(`KM lido da foto: ${lido.toLocaleString("pt-BR")}. Confira antes de salvar.`);
      } else toast.info("Não consegui ler o KM na foto. Digite o valor.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto.");
    } finally {
      setEnviandoFoto(false);
      setLendo(false);
    }
  };

  const salvar = async () => {
    const n = Number(km.replace(/\D/g, ""));
    if (!veiculoId) return void toast.error("Escolha o veículo.");
    if (!foto) return void toast.error("Tire a foto do odômetro.");
    if (!n) return void toast.error("Informe o KM do odômetro.");
    if (n < kmRef) return void toast.error(`O KM não pode ser menor que ${kmRef.toLocaleString("pt-BR")}.`);
    setSalvando(true);
    const nome = String(pick(usuario ?? {}, ["nome", "name", "email"]) ?? "");
    const { error } = saida
      ? await supabase.from("veiculos_diario").insert({
          empresa_id: isMaster && empresa ? rowId(empresa) : empresaId,
          veiculo_id: veiculoId,
          condutor_id: usuarioId ?? null,
          condutor_nome: nome,
          finalidade: finalidade || null,
          km_inicial: n,
          foto_inicial: foto,
          saida_em: new Date().toISOString(),
          observacao: obs || null,
        })
      : await supabase
          .from("veiculos_diario")
          .update({ km_final: n, foto_final: foto, chegada_em: new Date().toISOString(), status: "concluido", observacao: obs || registro?.["observacao"] || null })
          .eq("id", String(rowId(registro!)));
    setSalvando(false);
    if (error) return void toast.error(error.message);
    for (const t of ["veiculos", "veiculos_diario"]) qc.invalidateQueries({ queryKey: ["table", t] });
    toast.success(saida ? "Saída registrada. Boa viagem!" : `Chegada registrada: ${(n - kmRef).toLocaleString("pt-BR")} km rodados.`);
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{saida ? "Registrar saída" : `Registrar chegada — ${placaDe(veiculoReg)}`}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {saida ? (
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={veiculoId} onValueChange={setVeiculoId}>
                <SelectTrigger><SelectValue placeholder={disponiveis.length ? "Escolha o veículo" : "Nenhum veículo disponível"} /></SelectTrigger>
                <SelectContent>{disponiveis.map((v) => <SelectItem key={String(rowId(v))} value={String(rowId(v))}>{placaDe(v)} — {fmtKm(v["km_atual"])}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              Saída em {fmtDt(registro?.["saida_em"])} com <b>{fmtKm(registro?.["km_inicial"])}</b> por {String(registro?.["condutor_nome"] ?? "")}.
            </div>
          )}

          <div className="space-y-2">
            <Label>Foto do odômetro *</Label>
            <label className={cn("flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center", foto && "border-solid")}>
              {foto ? (
                <img src={foto} alt="Odômetro" className="max-h-64 rounded object-contain" />
              ) : enviandoFoto ? (
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Camera className="size-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Tocar para tirar a foto do painel</span>
                </>
              )}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFoto(e.target.files?.[0])} />
            </label>
            {foto && <p className="text-muted-foreground text-xs">Toque na foto para tirar outra.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="km">KM do odômetro *</Label>
            <div className="relative">
              <Input id="km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} className="text-lg tabular-nums" placeholder={kmRef ? String(kmRef) : ""} />
              {lendo && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-muted-foreground text-xs">
              {lendo ? "Lendo o KM da foto…" : `Último KM registrado: ${fmtKm(kmRef)}`}
              {!saida && Number(km) >= kmRef && km ? ` · Rodado: ${(Number(km) - kmRef).toLocaleString("pt-BR")} km` : ""}
            </p>
          </div>

          {saida && (
            <div className="space-y-1.5">
              <Label>Finalidade / destino</Label>
              <Input value={finalidade} onChange={(e) => setFinalidade(e.target.value)} placeholder="Ex.: instalação no cliente X" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Avarias, ocorrências…" />
          </div>
          <p className="text-muted-foreground text-xs">Data e hora são gravadas automaticamente ao salvar.</p>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || enviandoFoto}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
            {saida ? "Confirmar saída" : "Confirmar chegada"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
