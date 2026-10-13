import { UploadInfo } from "@/components/ui/upload-info";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Camera, Fuel, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable, type Column } from "@/components/data-table/DataTable";
import { FilterInput, FilterSelect } from "@/components/data-table/FilterField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { rowId, useDeleteRecord, useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { matchesAny } from "@/lib/input-masks";
import { uploadFoto } from "@/lib/laudos";
import { lerOdometro } from "@/lib/frota.functions";
import { ALERTA_DESVIO, consumoEsperado, consumoReal, desvioConsumo } from "@/lib/frota";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const COMB = [
  { value: "gasolina", label: "Gasolina" },
  { value: "alcool", label: "Álcool" },
  { value: "diesel", label: "Diesel" },
  { value: "gnv", label: "GNV" },
];
const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { num } from "@/lib/orcamentos";
const fmtDt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const placaDe = (v: Row | undefined) => (v ? `${String(v["placa"] ?? "")} · ${String(v["modelo"] ?? "")}` : "—");

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };

export function AbastecimentosTab({ veiculos, perms, aberto, setAberto }: { veiculos: Row[]; perms: Perms; aberto: boolean; setAberto: (b: boolean) => void }) {
  const { data: lista = [], isLoading } = useTableRows("veiculos_abastecimentos");
  const remove = useDeleteRecord("veiculos_abastecimentos");
  const [f, setF] = useState({ busca: "", veiculo: "todos", de: "", ate: "" });
  const vById = useMemo(() => new Map(veiculos.map((v) => [String(rowId(v)), v])), [veiculos]);

  const rows = useMemo(
    () =>
      lista
        .filter((a) => {
          const d = String(a["abastecido_em"] ?? "").slice(0, 10);
          return (
            (f.veiculo === "todos" || String(a["veiculo_id"]) === f.veiculo) &&
            (!f.de || d >= f.de) && (!f.ate || d <= f.ate) &&
            matchesAny([a["condutor_nome"], a["posto"], vById.get(String(a["veiculo_id"]))?.["placa"]], f.busca)
          );
        })
        .sort((a, b) => String(b["abastecido_em"]).localeCompare(String(a["abastecido_em"]))),
    [lista, f, vById],
  );

  const resumo = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r["valor_total"] ?? 0), 0);
    const litros = rows.reduce((s, r) => s + Number(r["litros"] ?? 0), 0);
    const porVeiculo = new Map<string, { real: number[]; esp: number | null }>();
    for (const r of rows) {
      if (r["consumo_real"] == null) continue;
      const id = String(r["veiculo_id"]);
      const e = porVeiculo.get(id) ?? { real: [], esp: r["consumo_esperado"] == null ? null : Number(r["consumo_esperado"]) };
      e.real.push(Number(r["consumo_real"]));
      porVeiculo.set(id, e);
    }
    return { total, litros, porVeiculo };
  }, [rows]);

  const cols: Column[] = [
    { key: "data", header: "Data", fields: ["abastecido_em"], render: (r) => fmtDt(r["abastecido_em"]) },
    { key: "veiculo", header: "Veículo", fields: [], render: (r) => placaDe(vById.get(String(r["veiculo_id"]))) },
    { key: "condutor", header: "Condutor", fields: ["condutor_nome"] },
    { key: "comb", header: "Combustível", fields: ["combustivel"], render: (r) => COMB.find((c) => c.value === r["combustivel"])?.label ?? "—" },
    { key: "litros", header: "Litros", fields: ["litros"], render: (r) => <span className="tabular-nums">{Number(r["litros"] ?? 0).toLocaleString("pt-BR")} L{r["tanque_cheio"] ? " · cheio" : ""}</span> },
    { key: "valor", header: "Valor", fields: ["valor_total"], render: (r) => <span className="tabular-nums font-medium">{brl(r["valor_total"])}</span> },
    { key: "km", header: "KM", fields: ["km"], render: (r) => <span className="tabular-nums">{Number(r["km"] ?? 0).toLocaleString("pt-BR")}</span> },
    {
      key: "consumo", header: "Consumo real", fields: ["consumo_real"],
      render: (r) => {
        if (r["consumo_real"] == null) return <span className="text-muted-foreground text-xs">—</span>;
        const d = desvioConsumo(Number(r["consumo_real"]), r["consumo_esperado"] == null ? null : Number(r["consumo_esperado"]));
        const ruim = d != null && d <= ALERTA_DESVIO;
        return (
          <div className="flex flex-col text-xs">
            <span className={cn("font-semibold tabular-nums", ruim ? "text-destructive" : "text-success")}>{Number(r["consumo_real"]).toLocaleString("pt-BR")} km/l</span>
            {d != null && <span className="text-muted-foreground">{d > 0 ? "+" : ""}{d.toLocaleString("pt-BR")}% vs esperado</span>}
          </div>
        );
      },
    },
    {
      key: "cupom", header: "Cupom", fields: [],
      render: (r) => (r["foto_cupom"] ? <a href={String(r["foto_cupom"])} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><img src={String(r["foto_cupom"])} alt="Cupom" className="size-10 rounded object-cover" /></a> : null),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">Gasto no período</div><div className="text-xl font-semibold tabular-nums">{brl(resumo.total)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-muted-foreground text-xs">Litros</div><div className="text-xl font-semibold tabular-nums">{resumo.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L</div></div>
        <div className="rounded-lg border p-3 text-xs">
          <div className="text-muted-foreground">Média real vs esperada</div>
          {resumo.porVeiculo.size === 0 && <div className="text-muted-foreground mt-1">Registre dois abastecimentos de tanque cheio para calcular.</div>}
          {[...resumo.porVeiculo].map(([id, e]) => {
            const media = Math.round((e.real.reduce((s, x) => s + x, 0) / e.real.length) * 100) / 100;
            const d = desvioConsumo(media, e.esp);
            return (
              <div key={id} className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono">{String(vById.get(id)?.["placa"] ?? "")}</span>
                <span className={cn("tabular-nums font-medium", d != null && d <= ALERTA_DESVIO && "text-destructive")}>
                  {d != null && d <= ALERTA_DESVIO && <AlertTriangle className="mr-1 inline size-3" />}
                  {media.toLocaleString("pt-BR")} / {e.esp?.toLocaleString("pt-BR") ?? "—"} km/l
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <DataTable
        title="Abastecimentos"
        columns={cols}
        rows={rows}
        loading={isLoading}
        getValue={(row, keys) => pick(row, keys)}
        rowKey={(r, i) => String(rowId(r) ?? i)}
        onAdd={perms.canCreate ? () => setAberto(true) : undefined}
        onDelete={perms.canDelete ? (r) => remove.mutate(r) : undefined}
        filters={
          <>
            <FilterInput label="Busca" value={f.busca} onChange={(busca) => setF({ ...f, busca })} placeholder="Condutor, posto, placa…" />
            <FilterSelect label="Veículo" value={f.veiculo} onChange={(veiculo) => setF({ ...f, veiculo })} options={[{ value: "todos", label: "Todos" }, ...veiculos.map((v) => ({ value: String(rowId(v)), label: placaDe(v) }))]} />
            <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></div>
          </>
        }
      />
      {aberto && <AbastecimentoSheet veiculos={veiculos} historico={lista} onClose={() => setAberto(false)} />}
    </div>
  );
}

function FotoBox({ label, foto, loading, onFile }: { label: string; foto: string; loading: boolean; onFile: (f: File | undefined) => void }) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1">{label}<UploadInfo perfil="laudo" /></Label>
      <label className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-center", foto && "border-solid")}>
        {foto ? <img src={foto} alt={label} className="max-h-48 rounded object-contain" /> : loading ? <Loader2 className="size-7 animate-spin text-muted-foreground" /> : (
          <><Camera className="size-7 text-muted-foreground" /><span className="text-sm">Tocar para tirar a foto</span></>
        )}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
    </div>
  );
}

function AbastecimentoSheet({ veiculos, historico, onClose }: { veiculos: Row[]; historico: Row[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { usuario, isMaster, empresa } = useAuth();
  const { empresaId, usuarioId } = useAudit();
  const ativos = veiculos.filter((v) => v["status"] !== "inativo");
  const [veiculoId, setVeiculoId] = useState(ativos.length === 1 ? String(rowId(ativos[0]!)) : "");
  const veiculo = veiculos.find((v) => String(rowId(v)) === veiculoId);
  const [comb, setComb] = useState("gasolina");
  const [litros, setLitros] = useState("");
  const [preco, setPreco] = useState("");
  const [km, setKm] = useState("");
  const [cheio, setCheio] = useState(true);
  const [posto, setPosto] = useState("");
  const [obs, setObs] = useState("");
  const [fotoCupom, setFotoCupom] = useState("");
  const [fotoPainel, setFotoPainel] = useState("");
  const [up, setUp] = useState<"" | "cupom" | "painel">("");
  const [salvando, setSalvando] = useState(false);

  const total = Math.round(num(litros) * num(preco) * 100) / 100;
  const kmN = Number(km.replace(/\D/g, ""));
  const anteriores = historico
    .filter((h) => String(h["veiculo_id"]) === veiculoId)
    .map((h) => ({ id: String(rowId(h)), km: Number(h["km"]), litros: Number(h["litros"]), tanque_cheio: !!h["tanque_cheio"], data: String(h["abastecido_em"]) }));
  const real = kmN && num(litros) ? consumoReal(anteriores, { km: kmN, litros: num(litros), tanque_cheio: cheio, data: "" }) : null;
  const esperado = veiculo ? consumoEsperado(veiculo, comb) : null;
  const desvio = desvioConsumo(real, esperado);

  const enviar = async (tipo: "cupom" | "painel", file?: File) => {
    if (!file) return;
    setUp(tipo);
    try {
      const url = await uploadFoto(file);
      if (tipo === "cupom") setFotoCupom(url);
      else {
        setFotoPainel(url);
        const { km: lido } = await lerOdometro({ data: { url } });
        if (lido) { setKm(String(lido)); toast.success(`KM lido: ${lido.toLocaleString("pt-BR")}. Confira.`); }
        else toast.info("Não consegui ler o KM. Digite o valor.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar a foto.");
    } finally { setUp(""); }
  };

  const salvar = async () => {
    if (!veiculoId) return void toast.error("Escolha o veículo.");
    if (!num(litros)) return void toast.error("Informe os litros.");
    if (!num(preco)) return void toast.error("Informe o preço por litro.");
    if (!kmN) return void toast.error("Informe o KM do painel.");
    setSalvando(true);
    const { error } = await supabase.from("veiculos_abastecimentos").insert({
      empresa_id: isMaster && empresa ? rowId(empresa) : empresaId,
      veiculo_id: veiculoId,
      condutor_id: usuarioId ?? null,
      condutor_nome: String(pick(usuario ?? {}, ["nome", "name", "email"]) ?? ""),
      abastecido_em: new Date().toISOString(),
      combustivel: comb,
      litros: num(litros),
      valor_litro: num(preco),
      valor_total: total,
      km: kmN,
      tanque_cheio: cheio,
      posto: posto || null,
      foto_cupom: fotoCupom || null,
      foto_painel: fotoPainel || null,
      consumo_real: real,
      consumo_esperado: esperado,
      observacao: obs || null,
    });
    setSalvando(false);
    if (error) return void toast.error(error.message);
    for (const t of ["veiculos", "veiculos_abastecimentos"]) qc.invalidateQueries({ queryKey: ["table", t] });
    toast.success("Abastecimento registrado.");
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4"><SheetTitle className="flex items-center gap-2"><Fuel className="size-5" /> Registrar abastecimento</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Veículo *</Label>
              <Select value={veiculoId} onValueChange={setVeiculoId}>
                <SelectTrigger><SelectValue placeholder="Escolha o veículo" /></SelectTrigger>
                <SelectContent>{ativos.map((v) => <SelectItem key={String(rowId(v))} value={String(rowId(v))}>{placaDe(v)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Combustível *</Label>
              <Select value={comb} onValueChange={setComb}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COMB.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FotoBox label="Foto do cupom" foto={fotoCupom} loading={up === "cupom"} onFile={(f) => enviar("cupom", f)} />
            <FotoBox label="Foto do painel (lê o KM)" foto={fotoPainel} loading={up === "painel"} onFile={(f) => enviar("painel", f)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Litros *</Label><Input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="35,4" /></div>
            <div className="space-y-1.5"><Label>Preço por litro (R$) *</Label><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="5,89" /></div>
            <div className="space-y-1.5"><Label>Total</Label><div className="bg-muted/50 flex h-9 items-center rounded-md px-3 font-semibold tabular-nums">{brl(total)}</div></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>KM do painel *</Label><Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} placeholder={veiculo ? String(veiculo["km_atual"] ?? "") : ""} /></div>
            <div className="space-y-1.5"><Label>Posto</Label><Input value={posto} onChange={(e) => setPosto(e.target.value)} placeholder="Nome do posto" /></div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><div className="text-sm font-medium">Completou o tanque?</div><div className="text-muted-foreground text-xs">O consumo real só é calculado entre dois abastecimentos de tanque cheio.</div></div>
            <Switch checked={cheio} onCheckedChange={setCheio} />
          </div>
          {real != null && (
            <div className={cn("rounded-lg p-3 text-sm", desvio != null && desvio <= ALERTA_DESVIO ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
              Consumo real: <b>{real.toLocaleString("pt-BR")} km/l</b>
              {esperado != null && <> · esperado {esperado.toLocaleString("pt-BR")} km/l ({desvio! > 0 ? "+" : ""}{desvio?.toLocaleString("pt-BR")}%)</>}
              {desvio != null && desvio <= ALERTA_DESVIO && <div className="mt-1 text-xs">Consumo bem abaixo do esperado: verifique calibragem, manutenção ou possível desvio.</div>}
            </div>
          )}
          <div className="space-y-1.5"><Label>Observações</Label><Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !!up}>{salvando && <Loader2 className="mr-2 size-4 animate-spin" />}Salvar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
