import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
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
import { pick, type Row } from "@/lib/row";
import { isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import { formatPhoneDisplay } from "@/lib/input-masks";

type EmpresaField = { key: string; label: string; full?: boolean; type?: "text" | "boolean" | "photo" | "tel" | "document" };

export const EMPRESA_FIELDS: EmpresaField[] = [
  { key: "nome", label: "Nome", full: true },
  { key: "cnpj_cpf", label: "CNPJ / CPF", type: "document" },
  { key: "status", label: "Status", type: "boolean" },
  { key: "endereco", label: "Endereço", full: true },
  { key: "telefone1", label: "Telefone 1", type: "tel" },
  { key: "telefone2", label: "Telefone 2", type: "tel" },
  { key: "logo", label: "Logo", type: "photo", full: true },
  { key: "titulo", label: "Título exibido", full: true },
];

type ChildColumn = { key: string; label: string; type?: "text" | "boolean" | "select" | "tel" | "icon" | "color"; options?: string[] };

type ChildConfig = {
  table: string;
  title: string;
  empty: string;
  columns: ChildColumn[];
};

const INSTANCIAS: ChildConfig = {
  table: "empresas_instancias",
  title: "Instâncias",
  empty: "Nenhuma instância vinculada.",
  columns: [
    { key: "nome", label: "Nome" },
    { key: "telefone", label: "Telefone", type: "tel" },
    { key: "tipo", label: "Tipo", type: "select", options: ["whatsapp", "instagram", "telegram", "chat"] },
    { key: "provedor", label: "Provedor" },
    { key: "instance_id", label: "ID da instância" },
    { key: "url", label: "URL" },
    { key: "token", label: "Token" },
    { key: "client_token", label: "Client token" },
    { key: "icone", label: "Ícone", type: "icon" },
    { key: "status", label: "Status", type: "boolean" },
  ],
};

const CAMPOS: ChildConfig = {
  table: "empresas_camposperson",
  title: "Campos personalizados",
  empty: "Nenhum campo personalizado.",
  columns: [
    { key: "chave", label: "Campo (chave)" },
    { key: "tipo", label: "Tipo" },
    { key: "valor", label: "Valor padrão" },
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
  columns: [{ key: "descricao", label: "Descrição" }],
};

type ChildPerms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const FULL: ChildPerms = { canCreate: true, canUpdate: true, canDelete: true };

function ChildTable({ config, empresa, perms = FULL }: { config: ChildConfig; empresa: Row | null; perms?: ChildPerms }) {
  const queryClient = useQueryClient();
  const empresaId = empresa ? empresa[idColumn(empresa)] : undefined;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

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
    const phoneColumn = config.columns.find((column) => column.type === "tel");
    if (phoneColumn && !isCompletePhone(draft[phoneColumn.key] ?? "")) {
      toast.error(`${phoneColumn.label}: informe um telefone válido.`);
      return;
    }
    const payload: Row = editing ? {} : { empresa_id: empresaId };
    for (const col of config.columns) {
      const value = draft[col.key] ?? "";
      if (value === "" && !editing) continue;
      payload[col.key] = col.type === "boolean" ? value === "true" : value;
    }
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

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">{config.empty}</p>}
        {rows.map((row, index) => {
          const iconValue = text(pick(row, ["icone"], ""));
          const Icon = getIcon(iconValue);
          const nomeValue = text(pick(row, ["nome"], ""));
          return (
            <div key={text(row[idColumn(row)] ?? index)} className="flex items-start gap-3 p-3 text-sm">
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
                            <p className="truncate text-foreground">{colValue || "—"}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
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
        })}
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
        {config.columns.map((col) => (
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
                      {opt}
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
        {editing && (
          <Button variant="ghost" onClick={resetForm}>
            Cancelar edição
          </Button>
        )}
        <Button variant="outline" onClick={save}>
          {editing ? "Salvar alterações" : "Adicionar"}
        </Button>
      </div>
      </>
      )}
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
  { key: "instancias", kind: "instancias", label: "Instâncias", perms: FULL },
  { key: "campos", kind: "campos", label: "Campos", perms: FULL },
  { key: "etiquetas", kind: "etiquetas", label: "Etiquetas", perms: FULL },
];

export function EmpresaSheet({ open, onOpenChange, empresa, saving, onSave, sections, readOnly }: Props) {
  const tabs = sections && sections.length > 0 ? sections : DEFAULT_SECTIONS;
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
            <div className="border-border mb-5 border-b pb-5">
              <PhotoUpload
                value={values["logo"] ?? ""}
                alt={values["nome"] ? `Logo de ${values["nome"]}` : "Logo da empresa"}
                onChange={(url) => setValues((current) => ({ ...current, logo: url }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            {EMPRESA_FIELDS.filter((field) => field.type !== "photo").map((field) => (
              <div
                key={field.key}
                className={field.full || field.type === "tel" ? "min-w-0 sm:col-span-2" : "min-w-0"}
              >
                <Label htmlFor={field.key} className="mb-1.5 block">
                  {field.label}
                </Label>
                {field.type === "boolean" ? (
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
                  <DocumentInput
                    id={field.key}
                    value={values[field.key] ?? ""}
                    onChange={(document) => setValues((current) => ({ ...current, [field.key]: document }))}
                  />
                ) : (
                  <Input
                    id={field.key}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            </div>
            </fieldset>
          </TabsContent>
            ) : (
              <TabsContent key={t.key} value={t.key} className="mt-4">
                {configFor[t.kind] ? (
                  <ChildTable config={configFor[t.kind]!} empresa={empresa} perms={t.perms} />
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
