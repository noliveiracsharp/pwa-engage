import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Code, Inbox, Loader2, Pencil, Plus, QrCode, Search, Trash2, Unplug } from "lucide-react";
import { digitsOnly } from "@/lib/input-masks";
import { useServerFn } from "@tanstack/react-start";
import { QrCodeDialog } from "@/components/empresas/QrCodeDialog";
import { WidgetChatDialog } from "@/components/empresas/WidgetChatDialog";
import { configurarWebhookZapi, desconectarWhatsApp } from "@/lib/zapi.functions";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { IconPicker } from "@/components/data-table/IconPicker";
import { getIcon } from "@/components/layout/icon-map";
import { supabase } from "@/integrations/supabase/client";
import { idColumn, text } from "@/lib/crud";
import { SortableList, useSortableRow, salvarOrdem, proximaOrdem } from "@/lib/reorder";
import { pick, type Row } from "@/lib/row";
import { isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import { formatPhoneDisplay } from "@/lib/input-masks";

type EmpresaField = {
  key: string;
  label: string;
  full?: boolean;
  type?: "text" | "boolean" | "photo" | "tel" | "document" | "select" | "color" | "favicon";
  options?: Array<{ value: string; label: string }>;
  numeric?: boolean;
  fiscal?: boolean;
  /** Campo de white label: vazio grava null (volta ao padrão). */
  wl?: boolean;
};

export const EMPRESA_FIELDS: EmpresaField[] = [
  { key: "cnpj_cpf", label: "CNPJ / CPF", type: "document" },
  { key: "status", label: "Status", type: "boolean" },
  { key: "compartilhar_catalogo_filiais", label: "Compartilhar catálogo com filiais", type: "boolean", full: true },
  { key: "nome", label: "Nome", full: true },
  { key: "endereco", label: "Endereço", full: true },
  { key: "telefone1", label: "Telefone 1", type: "tel" },
  { key: "telefone2", label: "Telefone 2", type: "tel" },
  { key: "logo", label: "Logo", type: "photo", full: true },
  { key: "titulo", label: "Título exibido", full: true },
  { key: "site_url", label: "URL / site da empresa", full: true, wl: true },
  { key: "cor_primaria_claro", label: "Cor primária — modo claro", type: "color", wl: true },
  { key: "cor_primaria_escuro", label: "Cor primária — modo escuro", type: "color", wl: true },
  { key: "favicon", label: "Favicon (ícone da aba)", type: "favicon", full: true, wl: true },
  { key: "inscricao_estadual", label: "Inscrição Estadual (IE)", fiscal: true },
  { key: "inscricao_municipal", label: "Inscrição Municipal (IM)", fiscal: true },
  {
    key: "crt",
    label: "Regime tributário (CRT)",
    type: "select",
    fiscal: true,
    full: true,
    options: [
      { value: "1", label: "1 - Simples Nacional" },
      { value: "2", label: "2 - Simples Nacional (excesso de sublimite)" },
      { value: "3", label: "3 - Regime Normal (Presumido/Real)" },
      { value: "4", label: "4 - MEI" },
    ],
  },
  { key: "codigo_ibge", label: "Código IBGE do município", fiscal: true },
  {
    key: "ambiente_fiscal",
    label: "Ambiente de emissão",
    type: "select",
    fiscal: true,
    options: [
      { value: "homologacao", label: "Homologação (testes)" },
      { value: "producao", label: "Produção" },
    ],
  },
  { key: "serie_nfe", label: "Série NF-e", fiscal: true },
  { key: "numero_nfe_atual", label: "Último número NF-e", fiscal: true, numeric: true },
  { key: "serie_nfse", label: "Série NFS-e", fiscal: true },
  { key: "numero_nfse_atual", label: "Último número NFS-e", fiscal: true, numeric: true },
];

type ChildColumn = { key: string; label: string; type?: "text" | "boolean" | "select" | "tel" | "icon" | "color"; options?: string[]; optionLabels?: Record<string, string>; showIf?: (d: Record<string, string>) => boolean; required?: boolean; numeric?: boolean };

type ChildConfig = {
  table: string;
  title: string;
  empty: string;
  columns: ChildColumn[];
  /** Quando true, as linhas são ordenadas por `ordem` e podem ser reordenadas arrastando. */
  sortable?: boolean;
};

/** Linha arrastável: aplica ref/estilo do dnd-kit e exibe a alça à esquerda. */
function SortableRowWrap({ rowId, disabled, children }: { rowId: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, style, handle } = useSortableRow(rowId, disabled);
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      {handle}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const notChat = (d: Record<string, string>) => d["tipo"] !== "chat";

export const INSTANCIAS: ChildConfig = {
  table: "empresas_instancias",
  title: "Instâncias",
  empty: "Nenhuma instância vinculada.",
  columns: [
    { key: "nome", label: "Nome" },
    { key: "tipo", label: "Tipo", type: "select", options: ["whatsapp", "instagram", "telegram", "chat"] },
    { key: "telefone", label: "Telefone", type: "tel" },
    { key: "provedor", label: "Provedor", showIf: notChat },
    { key: "instance_id", label: "ID da instância", showIf: notChat },
    { key: "url", label: "URL", showIf: notChat },
    { key: "token", label: "Token", showIf: notChat },
    { key: "client_token", label: "Client token", showIf: notChat },
    {
      key: "tipo_envio",
      label: "Tipo de envio",
      type: "select",
      options: ["zapi_direto", "n8n_webhook"],
      optionLabels: { zapi_direto: "Enviar diretamente via API da Z-API", n8n_webhook: "Rotear envio via Webhook do n8n / Workflow" },
      showIf: notChat,
    },
    { key: "n8n_webhook_url", label: "URL Webhook n8n", showIf: (d) => notChat(d) && d["tipo_envio"] === "n8n_webhook", required: true },
    { key: "icone", label: "Ícone", type: "icon" },
    { key: "status", label: "Status", type: "boolean" },
  ],
};

const CAMPOS: ChildConfig = {
  table: "empresas_camposperson",
  title: "Campos personalizados",
  empty: "Nenhum campo personalizado.",
  sortable: true,
  columns: [
    { key: "label", label: "Label (exibido na tela)", required: true },
    { key: "chave", label: "Chave técnica (ex: matricula_convenio)", required: true },
    {
      key: "tipo",
      label: "Tipo",
      type: "select",
      options: ["texto", "select", "checkbox", "radio"],
      optionLabels: { texto: "Texto", select: "Seleção (lista)", checkbox: "Checkbox (sim/não)", radio: "Radio button" },
    },
    { key: "valor", label: "Valor padrão / opções separadas por vírgula" },
  ],
};

const ETIQUETAS: ChildConfig = {
  table: "etiquetas",
  title: "Etiquetas",
  empty: "Nenhuma etiqueta cadastrada.",
  columns: [
    { key: "descricao", label: "Descrição" },
    { key: "cor_hex", label: "Cor", type: "color" },
    { key: "status", label: "Status", type: "boolean" },
  ],
};

const NOTAS: ChildConfig = {
  table: "empresas_notasrapidas",
  title: "Notas rápidas",
  empty: "Nenhuma nota rápida cadastrada.",
  columns: [{ key: "atalho", label: "Atalho" }, { key: "descricao", label: "Descrição" }],
};

type ChildPerms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const FULL: ChildPerms = { canCreate: true, canUpdate: true, canDelete: true };

export function ChildTable({ config, empresa, perms = FULL }: { config: ChildConfig; empresa: Row | null; perms?: ChildPerms }) {
  const queryClient = useQueryClient();
  const empresaId = empresa ? empresa[idColumn(empresa)] : undefined;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [qrInst, setQrInst] = useState<Row | null>(null);
  const [widgetInst, setWidgetInst] = useState<Row | null>(null);
  const desconectarFn = useServerFn(desconectarWhatsApp);
  const webhookFn = useServerFn(configurarWebhookZapi);

  const { data: rows = [], isError } = useQuery({
    queryKey: ["child", config.table, text(empresaId)],
    enabled: Boolean(empresaId),
    retry: false,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from(config.table).select("*");
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((row) => text(pick(row, ["empresa_id"])) === text(empresaId));
    },
  });

  if (!empresaId) {
    return <p className="text-sm text-muted-foreground">Salve a empresa para gerenciar {config.title.toLowerCase()}.</p>;
  }
  if (isError) {
    return <p className="text-sm text-muted-foreground">Não foi possível carregar {config.title.toLowerCase()}.</p>;
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["child", config.table, text(empresaId)] });

  const ordered = config.sortable
    ? [...rows].sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0))
    : rows;

  const reorder = async (next: Row[]) => {
    queryClient.setQueryData(
      ["child", config.table, text(empresaId)],
      next.map((r, i) => ({ ...r, ordem: i })),
    );
    try {
      await salvarOrdem(config.table, next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a nova ordem.");
      refresh();
    }
  };

  const resetForm = () => {
    setDraft({});
    setEditing(null);
    setAdding(false);
  };

  const startEditing = (row: Row) => {
    const next: Record<string, string> = {};
    for (const col of config.columns) next[col.key] = text(pick(row, [col.key], ""));
    setDraft(next);
    setEditing(row);
  };

  const save = async () => {
    const isChat = config.table === "empresas_instancias" && draft["tipo"] === "chat";
    const phoneColumn = config.columns.find((column) => column.type === "tel");
    const phoneValue = phoneColumn ? draft[phoneColumn.key] ?? "" : "";
    if (phoneColumn && !(isChat && !digitsOnly(phoneValue)) && !isCompletePhone(phoneValue)) {
      toast.error(`${phoneColumn.label}: informe um telefone válido.`);
      return;
    }
    for (const col of config.columns) {
      if (col.required && (!col.showIf || col.showIf(draft)) && !(draft[col.key] ?? "").trim()) {
        toast.error(`${col.label}: campo obrigatório.`);
        return;
      }
    }
    const payload: Row = editing ? {} : { empresa_id: empresaId };
    for (const col of config.columns) {
      if (col.showIf && !col.showIf(draft)) continue;
      const value = draft[col.key] ?? "";
      if (value === "" && !editing) continue;
      if (col.type === "tel" && isChat && !digitsOnly(value)) continue;
      payload[col.key] = col.type === "boolean" ? value === "true" : col.numeric ? (value === "" ? 0 : Number(value) || 0) : value;
    }
    if (isChat) payload["status_conexao"] = "conectado";
    if (config.sortable && !editing) payload["ordem"] = proximaOrdem(rows);
    const editingKey = editing ? idColumn(editing) : undefined;
    const response = editing && editingKey
      ? await supabase.from(config.table).update(payload as never).eq(editingKey, editing[editingKey] as never)
      : await supabase.from(config.table).insert(payload as never);
    const { error } = response;
    if (error) {
      toast.error(error.message);
      return;
    }
    resetForm();
    toast.success(editing ? "Registro atualizado." : "Registro adicionado.");
    refresh();
  };

  const remove = async (row: Row) => {
    const key = idColumn(row);
    const { error } = await supabase.from(config.table).delete().eq(key, row[key] as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Registro removido.");
    refresh();
  };

  // Liga o recebimento: aponta a Z-API para o Atende.ai (mensagens entram e os fluxos respondem).
  const ativarRecebimento = async (row: Row) => {
    const k = text(pick(row, ["webhook_token"]));
    if (!k) {
      toast.error("Rode o script atendeai-fluxos-motor.sql no banco para liberar o recebimento.");
      return;
    }
    // Sempre o domínio oficial: é o único endereço publicado que responde ao recebimento.
    const origem = "https://atendeai.co";
    const url = `${origem}/api/public/zapi-webhook?k=${k}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    const clientToken = text(pick(row, ["client_token"]));
    const token = text(pick(row, ["token"])) || clientToken;
    const r = await webhookFn({ data: { instanceId: text(pick(row, ["instance_id"])), token, clientToken: clientToken || undefined, url } });
    if (r.ok) toast.success("Recebimento ativado na Z-API. Endereço copiado.");
    else toast.error(`A Z-API recusou (${r.message ?? ""}). O endereço foi copiado: cole em "Ao receber" no painel da Z-API.`);
  };

  const desconectar = async (row: Row) => {
    if (!window.confirm("Deseja desconectar este WhatsApp?")) return;
    const clientToken = text(pick(row, ["client_token"]));
    const token = text(pick(row, ["token"])) || clientToken;
    const r = await desconectarFn({ data: { instanceId: text(pick(row, ["instance_id"])), token, clientToken: clientToken || undefined } });
    if (!r.ok) {
      toast.error(`Não foi possível desconectar: ${r.message ?? ""}`);
      return;
    }
    const key = idColumn(row);
    const { error } = await supabase.from(config.table).update({ status_conexao: "desconectado" } as never).eq(key, row[key] as never);
    if (error) toast.error(error.message);
    else toast.success("WhatsApp desconectado.");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {ordered.length === 0 && <p className="p-3 text-sm text-muted-foreground">{config.empty}</p>}
        {(() => {
          const list = ordered.map((row, index) => {
          const iconValue = text(pick(row, ["icone"], ""));
          const Icon = getIcon(iconValue);
          const nomeValue = text(pick(row, ["nome"], ""));
          const rowKey = text(row[idColumn(row)] ?? index);
          const rowContent = (
            <div className="flex items-start gap-3 p-3 text-sm">
              <div className="grid min-w-0 flex-1 gap-2">
                <div className="flex items-center gap-2">
                  {iconValue && <Icon className="h-5 w-5 shrink-0 text-primary" />}
                  {nomeValue && <p className="truncate font-semibold text-foreground">{nomeValue}</p>}
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {config.columns
                    .filter((col) => col.key !== "nome" && col.key !== "icone")
                    .map((col) => {
                      const colValue = text(pick(row, [col.key]));
                      const ColIcon = col.type === "icon" ? getIcon(colValue) : undefined;
                      return (
                        <div key={col.key}>
                          <p className="text-xs text-muted-foreground">{col.label}</p>
                          {col.type === "boolean" ? (
                            <p className="truncate text-foreground">
                              {row[col.key] === true ? "Ativo" : "Inativo"}
                            </p>
                           ) : col.type === "tel" ? (
                             <p className="truncate text-foreground">
                               {formatPhoneDisplay(colValue) || "—"}
                             </p>
                           ) : col.type === "color" ? (
                             <div className="flex items-center gap-2 text-foreground">
                               {colValue ? (
                                 <span
                                   className="h-4 w-4 shrink-0 rounded-full border border-border"
                                   style={{ backgroundColor: colValue }}
                                 />
                               ) : null}
                               <span className="truncate">{colValue || "—"}</span>
                             </div>
                           ) : col.type === "icon" ? (
                            <div className="flex items-center gap-2 text-foreground">
                              {colValue && ColIcon ? <ColIcon className="h-4 w-4" /> : null}
                              <span className="truncate">{colValue || "—"}</span>
                            </div>
                          ) : (
                            <p className="truncate text-foreground">{(col.optionLabels?.[colValue] ?? colValue) || "—"}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {config.table === "empresas_instancias" && text(pick(row, ["tipo"])) === "chat" && (
                  <Button variant="outline" size="sm" onClick={() => setWidgetInst(row)}>
                    <Code className="mr-1 h-4 w-4" /> Widget do site
                  </Button>
                )}
                {config.table === "empresas_instancias" && text(pick(row, ["tipo"])) !== "chat" &&
                  (text(pick(row, ["status_conexao"])).toLowerCase() === "conectado" ? (
                    <>
                      <Badge className="bg-success text-success-foreground hover:bg-success">WhatsApp Conectado</Badge>
                      <Button variant="outline" size="sm" onClick={() => void ativarRecebimento(row)} title="Faz as mensagens recebidas entrarem no Atende.ai e acionarem os fluxos">
                        <Inbox className="mr-1 h-4 w-4" /> Ativar recebimento
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void desconectar(row)}>
                        <Unplug className="mr-1 h-4 w-4" /> Desconectar
                      </Button>
                    </>
                  ) : text(pick(row, ["instance_id"])) && text(pick(row, ["client_token"])) ? (
                    <Button variant="outline" size="sm" onClick={() => setQrInst(row)}>
                      <QrCode className="mr-1 h-4 w-4" /> Conectar WhatsApp
                    </Button>
                  ) : null)}
                {perms.canUpdate && (
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => startEditing(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {perms.canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    onClick={() => {
                      if (window.confirm("Deseja realmente excluir este registro?")) remove(row);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          );
          return config.sortable ? (
            <SortableRowWrap key={rowKey} rowId={rowKey} disabled={!perms.canUpdate}>
              {rowContent}
            </SortableRowWrap>
          ) : (
            <Fragment key={rowKey}>{rowContent}</Fragment>
          );
        });
          return config.sortable ? (
            <SortableList rows={ordered} onReorder={(next) => void reorder(next)}>
              {list}
            </SortableList>
          ) : (
            list
          );
        })()}
      </div>

      {!editing && !adding && perms.canCreate && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}

      {((editing && perms.canUpdate) || (!editing && adding && perms.canCreate)) && (
      <>
      <div className="grid gap-3 sm:grid-cols-2">
        {config.columns.filter((col) => !col.showIf || col.showIf(draft)).map((col) => (
          <div key={col.key} className={col.type === "tel" ? "min-w-0 sm:col-span-2" : "min-w-0"}>
            <Label className="mb-1.5 block text-xs">{col.label}</Label>
            {col.type === "boolean" ? (
              <div className="flex h-10 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {draft[col.key] === "true" ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id={`${config.table}-${col.key}`}
                  checked={draft[col.key] === "true"}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, [col.key]: String(checked) }))
                  }
                />
              </div>
            ) : col.type === "select" ? (
              <Select
                value={draft[col.key] ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, [col.key]: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(col.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {col.optionLabels?.[opt] ?? opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : col.type === "tel" ? (
              <PhoneInput
                value={draft[col.key] ?? ""}
                onChange={(phone) => setDraft((current) => ({ ...current, [col.key]: phone }))}
              />
             ) : col.type === "icon" ? (
               <IconPicker
                 value={draft[col.key] ?? ""}
                 onChange={(icon) => setDraft((current) => ({ ...current, [col.key]: icon }))}
               />
             ) : col.type === "color" ? (
               <div className="flex items-center gap-2">
                 <input
                   type="color"
                   aria-label={col.label}
                   value={/^#[0-9a-fA-F]{6}$/.test(draft[col.key] ?? "") ? draft[col.key] : "#0ea5e9"}
                   onChange={(e) => setDraft((current) => ({ ...current, [col.key]: e.target.value }))}
                   className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
                 />
                 <Input
                   value={draft[col.key] ?? ""}
                   placeholder="#0ea5e9"
                   onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
                 />
               </div>
             ) : (
              <Input
                value={draft[col.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={resetForm}>
          Cancelar
        </Button>
        <Button onClick={save}>
          {editing ? "Salvar alterações" : "Adicionar"}
        </Button>
      </div>
      </>
      )}
      <WidgetChatDialog instancia={widgetInst} onClose={() => setWidgetInst(null)} />
      <QrCodeDialog
        instancia={qrInst}
        onOpenChange={(o) => !o && setQrInst(null)}
        onConnected={async (inst) => {
          const key = idColumn(inst);
          const { error } = await supabase
            .from(config.table)
            .update({ status_conexao: "conectado" } as never)
            .eq(key, inst[key] as never);
          if (error) {
            toast.error(`Não foi possível salvar a conexão: ${error.message}`);
            return;
          }
          toast.success("WhatsApp conectado!");
          setQrInst(null);
          refresh();
        }}
      />
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: Row | null;
  saving?: boolean;
  onSave: (values: Row) => void;
  /** Submenus (funções filhas) na ordem e com o título da tabela funcoes. */
  sections?: Array<{ key: string; kind: string; label: string; perms: ChildPerms }>;
  readOnly?: boolean;
};

const DEFAULT_SECTIONS = [
  { key: "dados", kind: "dados", label: "Dados", perms: FULL },
  { key: "campos", kind: "campos", label: "Campos", perms: FULL },
  { key: "etiquetas", kind: "etiquetas", label: "Etiquetas", perms: FULL },
  { key: "notas", kind: "notas", label: "Notas rápidas", perms: FULL },
];

export function EmpresaSheet({ open, onOpenChange, empresa, saving, onSave, sections, readOnly }: Props) {
  // Instâncias são geridas na aba "Canais & Instâncias" (/instancias), nunca no formulário.
  const baseTabs = (sections && sections.length > 0 ? sections : DEFAULT_SECTIONS).filter((t) => t.kind !== "instancias");
  const tabs = [...baseTabs.filter((t) => t.kind === "dados"), ...baseTabs.filter((t) => t.kind !== "dados")];
  const [cnpjLoading, setCnpjLoading] = useState(false);

  async function lookupCnpj(value: string) {
    const cnpj = digitsOnly(value);
    if (cnpj.length !== 14) { toast.error("Informe os 14 dígitos do CNPJ."); return; }
    if (!isValidCpfCnpj(cnpj)) { toast.error("CNPJ inválido."); return; }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) { toast.error("CNPJ não encontrado na Receita Federal."); return; }
      const d = await res.json();
      const tel = (v: unknown) => { const n = digitsOnly(String(v ?? "")); return n.length >= 10 ? `+55${n}` : ""; };
      const cep = digitsOnly(String(d.cep ?? "")).replace(/^(\d{5})(\d{3})$/, "$1-$2");
      const rua = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" ").trim();
      const endereco = [
        [rua, d.numero].filter(Boolean).join(", "),
        d.complemento, d.bairro,
        [d.municipio, d.uf].filter(Boolean).join("/"),
        cep && `CEP ${cep}`,
      ].filter(Boolean).join(" - ");
      setValues((p) => ({
        ...p,
        nome: d.razao_social || p["nome"] || "",
        titulo: d.nome_fantasia || d.razao_social || p["titulo"] || "",
        endereco: endereco || p["endereco"] || "",
        telefone1: tel(d.ddd_telefone_1) || p["telefone1"] || "",
        telefone2: tel(d.ddd_telefone_2) || p["telefone2"] || "",
      }));
      const sit = String(d.descricao_situacao_cadastral ?? "");
      if (sit && sit.toUpperCase() !== "ATIVA") toast.warning(`Situação cadastral: ${sit}.`);
      else toast.success("Dados encontrados na Receita Federal.");
    } catch {
      toast.error("Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  }
  const configFor: Record<string, ChildConfig> = { instancias: INSTANCIAS, campos: CAMPOS, etiquetas: ETIQUETAS, notas: NOTAS };
  const [values, setValues] = useState<Record<string, string>>({});
  const dadosPerms = tabs.find((t) => t.kind === "dados")?.perms;
  const dadosLocked =
    !!readOnly || (dadosPerms ? !(empresa ? dadosPerms.canUpdate : dadosPerms.canCreate) : false);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of EMPRESA_FIELDS) next[field.key] = text(pick(empresa, [field.key], ""));
    setValues(next);
  }, [open, empresa]);

  const title = useMemo(() => (empresa ? "Editar empresa" : "Nova empresa"), [empresa]);

  const submit = () => {
    const document = values["cnpj_cpf"] ?? "";
    if (document && !isValidCpfCnpj(document)) {
      toast.error("CNPJ / CPF: informe um documento válido.");
      return;
    }
    for (const key of ["telefone1", "telefone2"]) {
      if (!isCompletePhone(values[key] ?? "")) {
        toast.error(`${key === "telefone1" ? "Telefone 1" : "Telefone 2"}: informe um telefone válido.`);
        return;
      }
    }
    const payload: Row = {};
    for (const field of EMPRESA_FIELDS) {
      const raw = values[field.key] ?? "";
      if (raw === "" && !empresa) continue;
      if (field.type === "boolean") {
        if (raw === "") continue;
        payload[field.key] = raw === "true";
      } else if (field.numeric) {
        payload[field.key] = raw === "" ? null : Number(digitsOnly(raw)) || 0;
      } else if (field.fiscal || field.wl) {
        payload[field.key] = raw.trim() || null;
      } else {
        payload[field.key] = raw;
      }
    }
    onSave(payload);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="px-4 pb-4">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <Tabs key={tabs[0]!.key} defaultValue={tabs[0]!.key} className="px-4">
          <TabsList className="h-auto flex-wrap">
            {tabs.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) =>
            t.kind === "dados" ? (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <fieldset disabled={dadosLocked} className="min-w-0 disabled:opacity-70">
            <div className="border-border mb-5 grid gap-4 border-b pb-5 sm:grid-cols-2">
              <div className="light rounded-lg border border-border bg-background p-3 text-foreground">
                <p className="mb-2 text-sm font-medium">Logo — modo claro (padrão)</p>
                <PhotoUpload
                  value={values["logo"] ?? ""}
                  alt={values["nome"] ? `Logo de ${values["nome"]}` : "Logo da empresa"}
                  onChange={(url) => setValues((current) => ({ ...current, logo: url }))}
                />
              </div>
              <div className="dark rounded-lg border border-border bg-background p-3 text-foreground">
                <p className="mb-2 text-sm font-medium">Logo — modo escuro (opcional)</p>
                <PhotoUpload
                  value={values["logo_escuro"] ?? ""}
                  alt="Logo para o modo escuro"
                  onChange={(url) => setValues((current) => ({ ...current, logo_escuro: url }))}
                />
                <p className="mt-2 text-xs text-muted-foreground">Sem logo escuro, o logo padrão é usado.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            {EMPRESA_FIELDS.filter((field) => field.type !== "photo")
              .filter((field) => field.key !== "compartilhar_catalogo_filiais" || !empresa?.["empresa_pai_id"])
              .map((field) => (
              <Fragment key={field.key}>
              {field.key === "site_url" && (
                <div className="border-border mt-2 border-t pt-4 sm:col-span-2">
                  <h3 className="text-sm font-semibold">White label (identidade visual)</h3>
                  <p className="text-muted-foreground text-xs">
                    Cores, ícone e site aplicados ao sistema para os usuários desta empresa. Deixe vazio para usar o padrão.
                  </p>
                </div>
              )}
              {field.key === "inscricao_estadual" && (
                <div className="border-border mt-2 border-t pt-4 sm:col-span-2">
                  <h3 className="text-sm font-semibold">Dados fiscais (emissão de notas)</h3>
                  <p className="text-muted-foreground text-xs">Usados na futura emissão de NF-e e NFS-e.</p>
                </div>
              )}
              <div
                className={field.full || field.type === "tel" ? "min-w-0 sm:col-span-2" : "min-w-0"}
              >
                <Label htmlFor={field.key} className="mb-1.5 block">
                  {field.label}
                </Label>
                {field.type === "select" ? (
                  <Select
                    value={values[field.key] ?? ""}
                    onValueChange={(val) => setValues((c) => ({ ...c, [field.key]: val }))}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "color" ? (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label={field.label}
                      className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                      value={/^#[0-9a-f]{6}$/i.test(values[field.key] ?? "") ? values[field.key] : "#2563eb"}
                      onChange={(e) => setValues((c) => ({ ...c, [field.key]: e.target.value }))}
                    />
                    <Input
                      id={field.key}
                      placeholder="Padrão do sistema"
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((c) => ({ ...c, [field.key]: e.target.value }))}
                    />
                    {values[field.key] && (
                      <Button type="button" variant="ghost" size="icon" title="Restaurar padrão"
                        onClick={() => setValues((c) => ({ ...c, [field.key]: "" }))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : field.type === "favicon" ? (
                  <div className="space-y-1">
                    <PhotoUpload
                      value={values[field.key] ?? ""}
                      alt="Favicon da empresa"
                      onChange={(url) => setValues((c) => ({ ...c, [field.key]: url }))}
                    />
                    <p className="text-muted-foreground text-xs">Use uma imagem quadrada simples (ex.: 512×512). Sem favicon, o logo é usado.</p>
                  </div>
                ) : field.type === "boolean" ? (
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                    <span className="text-sm text-muted-foreground">
                      {values[field.key] === "true" ? "Ativo" : "Inativo"}
                    </span>
                    <Switch
                      id={field.key}
                      checked={values[field.key] === "true"}
                      onCheckedChange={(checked) =>
                        setValues((current) => ({ ...current, [field.key]: String(checked) }))
                      }
                    />
                  </div>
                ) : field.type === "tel" ? (
                  <PhoneInput
                    id={field.key}
                    value={values[field.key] ?? ""}
                    onChange={(phone) => setValues((current) => ({ ...current, [field.key]: phone }))}
                  />
                ) : field.type === "document" ? (
                  <div className="flex gap-2">
                    <DocumentInput
                      id={field.key}
                      value={values[field.key] ?? ""}
                      onChange={(document) => {
                        const prev = digitsOnly(values[field.key] ?? "");
                        setValues((current) => ({ ...current, [field.key]: document }));
                        const d = digitsOnly(document);
                        if (d.length === 14 && prev !== d && !dadosLocked) void lookupCnpj(d);
                      }}
                    />
                    <Button type="button" variant="outline" size="icon" disabled={dadosLocked || cnpjLoading}
                      title="Buscar dados na Receita Federal" onClick={() => void lookupCnpj(values[field.key] ?? "")}>
                      {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                ) : (
                  <Input
                    id={field.key}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                )}
              </div>
              </Fragment>
            ))}
            </div>
            </fieldset>
          </TabsContent>
            ) : (
              <TabsContent key={t.key} value={t.key} className="mt-4">
                {configFor[t.kind] ? (
                  <ChildTable config={configFor[t.kind]!} empresa={empresa} perms={readOnly ? { canCreate: false, canUpdate: false, canDelete: false } : t.perms} />
                ) : (
                  <p className="text-sm text-muted-foreground">Em breve.</p>
                )}
              </TabsContent>
            ),
          )}
        </Tabs>

        <div className="bg-background sticky bottom-0 mt-4 flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || dadosLocked}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
