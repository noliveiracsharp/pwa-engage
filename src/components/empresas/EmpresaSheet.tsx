import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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

type ChildColumn = { key: string; label: string; type?: "text" | "boolean" | "select" | "tel"; options?: string[] };

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

function ChildTable({ config, empresa }: { config: ChildConfig; empresa: Row | null }) {
  const queryClient = useQueryClient();
  const empresaId = empresa ? empresa[idColumn(empresa)] : undefined;
  const [draft, setDraft] = useState<Record<string, string>>({});

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

  const add = async () => {
    const phoneColumn = config.columns.find((column) => column.type === "tel");
    if (phoneColumn && !isCompletePhone(draft[phoneColumn.key] ?? "")) {
      toast.error(`${phoneColumn.label}: informe um telefone válido.`);
      return;
    }
    const payload: Row = { empresa_id: empresaId };
    for (const col of config.columns) {
      const value = draft[col.key] ?? "";
      if (value === "") continue;
      payload[col.key] = col.type === "boolean" ? value === "true" : value;
    }
    const { error } = await supabase.from(config.table).insert(payload as never);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft({});
    toast.success("Registro adicionado.");
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
        {rows.map((row, index) => (
          <div key={text(row[idColumn(row)] ?? index)} className="flex items-center gap-3 p-3 text-sm">
            <div className="grid flex-1 gap-2 sm:grid-cols-3">
              {config.columns.map((col) => (
                <div key={col.key}>
                  <p className="text-xs text-muted-foreground">{col.label}</p>
                  <p className="truncate text-foreground">
                    {col.type === "boolean"
                      ? row[col.key] === true
                        ? "Ativo"
                        : "Inativo"
                      : col.type === "tel"
                        ? formatPhoneDisplay(text(pick(row, [col.key]))) || "—"
                        : text(pick(row, [col.key])) || "—"}
                  </p>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => remove(row)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {config.columns.map((col) => (
          <div key={col.key}>
            <Label className="mb-1.5 block text-xs">{col.label}</Label>
            {col.type === "boolean" ? (
              <Select
                value={draft[col.key] ?? ""}
                onValueChange={(v) => setDraft((d) => ({ ...d, [col.key]: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ativo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
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
            ) : (
              <Input
                value={draft[col.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [col.key]: e.target.value }))}
              />
            )}
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={add}>
        Adicionar
      </Button>
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: Row | null;
  saving?: boolean;
  onSave: (values: Row) => void;
};

export function EmpresaSheet({ open, onOpenChange, empresa, saving, onSave }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

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
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="dados" className="px-4">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="instancias">Instâncias</TabsTrigger>
            <TabsTrigger value="campos">Campos</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="mt-4">
            <div className="border-border mb-5 border-b pb-5">
              <PhotoUpload
                value={values["logo"] ?? ""}
                alt={values["nome"] ? `Logo de ${values["nome"]}` : "Logo da empresa"}
                onChange={(url) => setValues((current) => ({ ...current, logo: url }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            {EMPRESA_FIELDS.filter((field) => field.type !== "photo").map((field) => (
              <div key={field.key} className={field.full ? "sm:col-span-2" : undefined}>
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
          </TabsContent>

          <TabsContent value="instancias" className="mt-4">
            <ChildTable config={INSTANCIAS} empresa={empresa} />
          </TabsContent>

          <TabsContent value="campos" className="mt-4">
            <ChildTable config={CAMPOS} empresa={empresa} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
