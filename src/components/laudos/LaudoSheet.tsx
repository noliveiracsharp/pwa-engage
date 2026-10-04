import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { rowId } from "@/lib/crud";
import { CLASSIFICACOES, isInspecao, OBJETIVO_INSPECAO, OBJETIVOS, OBJETIVO_LEVANTAMENTO, uploadFoto } from "@/lib/laudos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";

export type LaudoLinha = {
  key: string;
  item_id: string;
  descricao_item: string;
  quantidade: string;
  conforme: boolean;
  observacao: string;
  fotos: string[];
};

export type LaudoForm = {
  parceiro_id: string;
  objetivo: string;
  data_visita: string;
  observacoes_gerais: string;
  laudo_final: string;
  classificacao: string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: Row | null;
  linhas: Row[];
  fotos: Row[];
  clientes: Row[];
  itens: Row[];
  saving: boolean;
  onSave: (v: { header: LaudoForm; linhas: LaudoLinha[]; fotosGerais: string[] }) => void;
};

const hoje = () => new Date().toISOString().slice(0, 10);

function FotoStrip({ fotos, onChange }: { fotos: string[]; onChange: (f: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        urls.push(await uploadFoto(f));
      }
      onChange([...fotos, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar foto.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fotos.map((u) => (
        <div key={u} className="relative">
          <a href={u} target="_blank" rel="noreferrer">
            <img src={u} alt="Foto do laudo" className="h-16 w-16 rounded-md border object-cover" />
          </a>
          <button
            type="button"
            aria-label="Remover foto"
            onClick={() => onChange(fotos.filter((x) => x !== u))}
            className="bg-destructive text-destructive-foreground absolute -top-1.5 -right-1.5 rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Camera className="mr-1 h-4 w-4" />}
        Foto
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}

export function LaudoSheet({ open, onOpenChange, record, linhas, fotos, clientes, itens, saving, onSave }: Props) {
  const [h, setH] = useState<LaudoForm>({
    parceiro_id: "", objetivo: OBJETIVO_LEVANTAMENTO, data_visita: hoje(),
    observacoes_gerais: "", laudo_final: "", classificacao: "",
  });
  const [ls, setLs] = useState<LaudoLinha[]>([]);
  const [gerais, setGerais] = useState<string[]>([]);
  const [novoItem, setNovoItem] = useState("");
  const [topico, setTopico] = useState("");

  useEffect(() => {
    if (!open) return;
    const id = record ? String(rowId(record) ?? "") : "";
    setH({
      parceiro_id: String(record?.["parceiro_id"] ?? ""),
      objetivo: String(record?.["objetivo"] ?? OBJETIVO_LEVANTAMENTO),
      data_visita: String(record?.["data_visita"] ?? "").slice(0, 10) || hoje(),
      observacoes_gerais: String(record?.["observacoes_gerais"] ?? ""),
      laudo_final: String(record?.["laudo_final"] ?? ""),
      classificacao: String(record?.["classificacao"] ?? ""),
    });
    const fotosDo = fotos.filter((f) => String(f["laudo_id"]) === id);
    setLs(
      [...linhas]
        .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0))
        .map((l) => ({
          key: String(l["id"]),
          item_id: String(l["item_id"] ?? ""),
          descricao_item: String(l["descricao_item"] ?? ""),
          quantidade: String(l["quantidade"] ?? "1"),
          conforme: l["conforme"] !== false,
          observacao: String(l["observacao"] ?? ""),
          fotos: fotosDo.filter((f) => String(f["laudo_item_id"]) === String(l["id"])).map((f) => String(f["url_foto"])),
        })),
    );
    setGerais(fotosDo.filter((f) => !f["laudo_item_id"]).map((f) => String(f["url_foto"])));
    setNovoItem("");
    setTopico("");
  }, [open, record, linhas, fotos]);

  const inspecao = isInspecao(h.objetivo);
  const clienteOpts = useMemo(
    () => clientes.map((c) => ({
      value: String(rowId(c) ?? ""),
      label: String(pick(c, ["razao_social", "nome_fantasia", "nome"]) ?? "—"),
      keywords: [String(c["nome_fantasia"] ?? ""), String(c["documento"] ?? "")],
    })),
    [clientes],
  );
  const itemOpts = useMemo(
    () => itens.map((i) => ({
      value: String(rowId(i) ?? ""),
      label: String(i["descricao"] ?? "Item"),
      hint: i["codigo"] ? String(i["codigo"]) : undefined,
      keywords: [String(i["codigo"] ?? "")],
    })),
    [itens],
  );

  const patch = (key: string, p: Partial<LaudoLinha>) =>
    setLs((prev) => prev.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const addItem = (itemId: string) => {
    if (!itemId) return;
    const it = itens.find((i) => String(rowId(i)) === itemId);
    const existente = ls.find((l) => l.item_id === itemId);
    if (existente && !inspecao) {
      patch(existente.key, { quantidade: String(Number(existente.quantidade || 0) + 1) });
    } else {
      setLs((p) => [...p, {
        key: crypto.randomUUID(), item_id: itemId, descricao_item: String(it?.["descricao"] ?? "Item"),
        quantidade: "1", conforme: true, observacao: "", fotos: [],
      }]);
    }
    setNovoItem("");
  };
  const addTopico = () => {
    const t = topico.trim();
    if (!t) return;
    setLs((p) => [...p, { key: crypto.randomUUID(), item_id: "", descricao_item: t, quantidade: "1", conforme: true, observacao: "", fotos: [] }]);
    setTopico("");
  };

  const salvar = () => {
    const erro = !h.parceiro_id
      ? "Selecione o cliente."
      : !ls.length
        ? inspecao ? "Adicione itens ao checklist." : "Adicione ao menos um item."
        : !inspecao && ls.some((l) => !(Number(l.quantidade.replace(",", ".")) > 0))
          ? "Todas as quantidades precisam ser maiores que zero."
          : inspecao && !h.classificacao ? "Classifique o condomínio." : "";
    if (erro) {
      toast.error(erro);
      return;
    }
    onSave({ header: h, linhas: ls, fotosGerais: gerais });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{record ? `Laudo ${String(record["numero"] ?? "")}` : "Novo laudo técnico"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Cliente</Label>
              <SearchSelect value={h.parceiro_id} onChange={(v) => setH({ ...h, parceiro_id: v })} options={clienteOpts} placeholder="Selecione o cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Objetivo</Label>
              <div className="grid grid-cols-2 gap-2">
                {OBJETIVOS.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    variant={h.objetivo === o.value ? "default" : "outline"}
                    disabled={!!record && h.objetivo !== o.value && ls.length > 0}
                    onClick={() => setH({ ...h, objetivo: o.value })}
                    className="h-auto py-2 text-xs whitespace-normal"
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data_visita">Data da visita</Label>
              <Input id="data_visita" type="date" value={h.data_visita} onChange={(e) => setH({ ...h, data_visita: e.target.value })} />
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="font-semibold">{inspecao ? "Checklist da inspeção" : "Itens levantados"}</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <SearchSelect className="flex-1" value={novoItem} onChange={addItem} options={itemOpts} placeholder="Adicionar item do cadastro" />
              {inspecao && (
                <div className="flex flex-1 gap-2">
                  <Input placeholder="Ou digite um tópico" value={topico} onChange={(e) => setTopico(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopico())} />
                  <Button type="button" variant="outline" size="icon" onClick={addTopico} aria-label="Adicionar tópico"><Plus className="h-4 w-4" /></Button>
                </div>
              )}
            </div>

            {ls.length === 0 && <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">Nenhum item adicionado.</p>}

            {ls.map((l, i) => (
              <div key={l.key} className={cn("space-y-2 rounded-lg border p-3", inspecao && !l.conforme && "border-destructive/60")}>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground pt-2 text-xs tabular-nums">{i + 1}.</span>
                  <div className="flex-1 pt-1.5 text-sm font-medium">{l.descricao_item}</div>
                  {!inspecao && (
                    <Input aria-label="Quantidade" className="w-24 text-right" inputMode="decimal" value={l.quantidade} onChange={(e) => patch(l.key, { quantidade: e.target.value })} />
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover item" onClick={() => setLs((p) => p.filter((x) => x.key !== l.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {inspecao && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={l.conforme ? "default" : "outline"} className={cn(l.conforme && "bg-success text-success-foreground hover:bg-success/90")} onClick={() => patch(l.key, { conforme: true })}>
                      <Check className="mr-1 h-4 w-4" /> Conforme
                    </Button>
                    <Button type="button" size="sm" variant={!l.conforme ? "destructive" : "outline"} onClick={() => patch(l.key, { conforme: false })}>
                      <X className="mr-1 h-4 w-4" /> Não conforme
                    </Button>
                  </div>
                )}
                <Textarea rows={2} placeholder="Observação" value={l.observacao} onChange={(e) => patch(l.key, { observacao: e.target.value })} />
                <FotoStrip fotos={l.fotos} onChange={(f) => patch(l.key, { fotos: f })} />
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <Label>Observações gerais</Label>
            <Textarea rows={3} value={h.observacoes_gerais} onChange={(e) => setH({ ...h, observacoes_gerais: e.target.value })} />
            <Label className="block pt-1">Fotos gerais</Label>
            <FotoStrip fotos={gerais} onChange={setGerais} />
          </section>

          {h.objetivo === OBJETIVO_INSPECAO && (
            <section className="space-y-3">
              <Label>Laudo final</Label>
              <Textarea rows={4} placeholder="Parecer conclusivo da inspeção" value={h.laudo_final} onChange={(e) => setH({ ...h, laudo_final: e.target.value })} />
              <Label className="block">Classificação do condomínio</Label>
              <div className="grid grid-cols-3 gap-2">
                {CLASSIFICACOES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setH({ ...h, classificacao: c.value })}
                    className={cn("rounded-md border px-3 py-2 text-sm font-semibold transition", h.classificacao === c.value ? c.badge : "hover:bg-muted")}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
