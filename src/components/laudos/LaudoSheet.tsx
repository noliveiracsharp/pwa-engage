import { UploadInfo } from "@/components/ui/upload-info";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { rowId } from "@/lib/crud";
import { CLASSIFICACOES, isInspecao, OBJETIVO_INSPECAO, OBJETIVOS, OBJETIVO_LEVANTAMENTO, uploadFoto } from "@/lib/laudos";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { ItemRapidoDialog } from "@/components/laudos/ItemRapidoDialog";
import { LaudoAprovacao } from "@/components/laudos/LaudoAprovacao";
import { statusLevantamento } from "@/lib/levantamento";

export type LaudoLinha = {
  key: string;
  item_id: string;
  descricao_item: string;
  quantidade: string;
  conforme: boolean;
  observacao: string;
  grupo: string;
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
            <img src={u} alt="Foto do laudo" className="h-10 w-10 rounded-md border object-cover" />
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
      <UploadInfo perfil="laudo" />
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
  const [edit, setEdit] = useState<LaudoLinha | null>(null);
  const [rapido, setRapido] = useState(false);
  const vazio = (): LaudoLinha => ({ key: "", item_id: "", descricao_item: "", quantidade: "1", conforme: true, observacao: "", grupo: "", fotos: [] });

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
          grupo: String(l["grupo"] ?? ""),
          fotos: fotosDo.filter((f) => String(f["laudo_item_id"]) === String(l["id"])).map((f) => String(f["url_foto"])),
        })),
    );
    setGerais(fotosDo.filter((f) => !f["laudo_item_id"]).map((f) => String(f["url_foto"])));
    setEdit(null);
  }, [open, record, linhas, fotos]);

  const inspecao = isInspecao(h.objetivo);
  const stLev = statusLevantamento(record?.["levantamento_status"]);
  const travado = !inspecao && !!record && stLev !== "rascunho" && stLev !== "reprovado";
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

  const confirmarEdit = () => {
    if (!edit) return undefined;
    if (!edit.descricao_item.trim()) return toast.error(inspecao ? "Selecione um item ou digite um tópico." : "Selecione o item.");
    if (!inspecao && !(Number(edit.quantidade.replace(",", ".")) > 0)) return toast.error("Quantidade precisa ser maior que zero.");
    if (edit.key) setLs((p) => p.map((l) => (l.key === edit.key ? edit : l)));
    else setLs((p) => [...p, { ...edit, key: crypto.randomUUID() }]);
    setEdit(null);
    return undefined;
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
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-4xl">
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
            <h3 className="font-semibold">{inspecao ? "Checklist da inspeção" : "Itens levantados"} <span className="text-muted-foreground font-normal">({ls.length})</span></h3>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="w-10 px-4 py-3 text-left font-medium">#</th>
                    <th className="px-2 py-3 text-left font-medium">Item</th>
                    <th className="w-28 px-2 py-3 text-right font-medium">{inspecao ? "Situação" : "Qtd"}</th>
                    <th className="w-24 px-2 py-3 text-center font-medium">Fotos</th>
                    <th className="w-28 px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {ls.length === 0 && (
                    <tr><td colSpan={5} className="text-muted-foreground p-6 text-center">Nenhum item adicionado.</td></tr>
                  )}
                  {ls.map((l, i) => {
                    const it = itens.find((x) => String(rowId(x)) === l.item_id);
                    const cod = it?.["codigo"] ? String(it["codigo"]) : "";
                    return (
                      <tr key={l.key} className={cn("border-t", inspecao && !l.conforme && "bg-destructive/10")}>
                        <td className="text-muted-foreground px-4 py-3 tabular-nums">{i + 1}.</td>
                        <td className="max-w-0 px-2 py-3">
                          <div className="truncate font-semibold" title={l.descricao_item}>{cod ? `${cod} — ` : ""}{l.descricao_item}</div>
                          {l.grupo && <span className="mr-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">{l.grupo}</span>}
                          {l.observacao && <span className="text-muted-foreground truncate text-xs">{l.observacao}</span>}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {inspecao ? (
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", l.conforme ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive")}>
                              {l.conforme ? "Conforme" : "Não conforme"}
                            </span>
                          ) : (
                            <>{l.quantidade} <span className="text-muted-foreground">unid</span></>
                          )}
                        </td>
                        <td className="text-muted-foreground px-2 py-3 text-center">
                          {l.fotos.length ? <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" />{l.fotos.length}</span> : "—"}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <Button type="button" variant="ghost" size="icon" aria-label="Editar item" disabled={travado} onClick={() => setEdit({ ...l })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label="Remover item" disabled={travado} onClick={() => setLs((p) => p.filter((x) => x.key !== l.key))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" className="w-full" disabled={travado} onClick={() => setEdit({ ...vazio(), key: "" })}>
              <Plus className="mr-2 h-4 w-4" /> Adicionar item
            </Button>
          </section>

          <section className="space-y-2">
            <Label>Observações gerais</Label>
            <Textarea rows={3} value={h.observacoes_gerais} onChange={(e) => setH({ ...h, observacoes_gerais: e.target.value })} />
            <Label className="block pt-1">Fotos gerais</Label>
            <FotoStrip fotos={gerais} onChange={setGerais} />
          </section>

          {!inspecao && (record
            ? <LaudoAprovacao laudo={record} temItens={linhas.length > 0} />
            : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Salve o levantamento para liberar o envio para aprovação do gestor.</p>)}

          {travado && <p className="rounded-md bg-warning/10 p-2 text-sm text-warning">Levantamento enviado para aprovação: os itens ficam bloqueados para edição.</p>}

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
          <Button onClick={salvar} disabled={saving || travado}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </div>
      </SheetContent>
      <ItemRapidoDialog
        open={rapido}
        termo={edit?.item_id ? "" : edit?.descricao_item ?? ""}
        laudoNumero={record ? String(record["numero"] ?? "") : undefined}
        onOpenChange={setRapido}
        onCriado={(id, descricao) => setEdit((e) => (e ? { ...e, item_id: id, descricao_item: descricao } : e))}
      />
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader><DialogTitle>{edit?.key ? "Editar item" : "Adicionar item"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-1 pb-1">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Item do cadastro</Label>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setRapido(true)}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Novo item rápido
                  </Button>
                </div>
                <div className="min-w-0 [&_button]:max-w-full [&_button_span]:truncate">
                  <SearchSelect
                    value={edit.item_id}
                    options={itemOpts}
                    placeholder="Selecione o item"
                    onChange={(v) => {
                      const it = itens.find((x) => String(rowId(x)) === v);
                      setEdit({ ...edit, item_id: v, descricao_item: v ? String(it?.["descricao"] ?? "Item") : "" });
                    }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">Não achou? Cadastre um item rápido e Compras completa depois.</p>
              </div>
              {inspecao && !edit.item_id && (
                <div className="space-y-1.5">
                  <Label>Ou tópico livre</Label>
                  <Input value={edit.descricao_item} onChange={(e) => setEdit({ ...edit, descricao_item: e.target.value })} placeholder="Ex.: Portão de garagem" />
                </div>
              )}
              {inspecao ? (
                <div className="space-y-1.5">
                  <Label>Situação</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={edit.conforme ? "default" : "outline"} className={cn(edit.conforme && "bg-success text-success-foreground hover:bg-success/90")} onClick={() => setEdit({ ...edit, conforme: true })}>
                      <Check className="mr-1 h-4 w-4" /> Conforme
                    </Button>
                    <Button type="button" variant={!edit.conforme ? "destructive" : "outline"} onClick={() => setEdit({ ...edit, conforme: false })}>
                      <X className="mr-1 h-4 w-4" /> Não conforme
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lq">Quantidade</Label>
                    <Input id="lq" inputMode="decimal" value={edit.quantidade} onChange={(e) => setEdit({ ...edit, quantidade: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lg">Grupo de compra</Label>
                    <Input id="lg" list="laudo-grupos" placeholder="Ex.: Material elétrico" value={edit.grupo} onChange={(e) => setEdit({ ...edit, grupo: e.target.value })} />
                    <datalist id="laudo-grupos">{[...new Set(ls.map((x) => x.grupo.trim()).filter(Boolean))].sort().map((g) => <option key={g} value={g} />)}</datalist>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="lo">Observação</Label>
                <Textarea id="lo" rows={3} value={edit.observacao} onChange={(e) => setEdit({ ...edit, observacao: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fotos</Label>
                <FotoStrip fotos={edit.fotos} onChange={(f) => setEdit({ ...edit, fotos: f })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={confirmarEdit}>Salvar item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
