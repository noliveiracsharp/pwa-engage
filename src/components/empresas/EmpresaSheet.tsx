import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { idColumn, text } from "@/lib/crud";
import { findKey, pick, type Row } from "@/lib/row";

export const EMPRESA_FIELDS: Array<{ fields: string[]; label: string; full?: boolean }> = [
  { fields: ["nome", "empresa_nome", "razao_social", "titulo"], label: "Nome", full: true },
  { fields: ["documento", "cnpj", "cpf_cnpj"], label: "CNPJ / Documento" },
  { fields: ["email", "empresa_email"], label: "E-mail" },
  { fields: ["telefone", "empresa_telefone", "celular", "whatsapp"], label: "Telefone" },
  { fields: ["status", "empresa_status", "situacao", "ativo"], label: "Status" },
  { fields: ["logo", "logo_url", "empresa_logo", "imagem"], label: "Logo (URL)", full: true },
  { fields: ["titulo", "empresa_titulo", "nome_fantasia"], label: "Título exibido", full: true },
];

type ChildConfig = {
  table: string;
  title: string;
  empty: string;
  columns: Array<{ fields: string[]; label: string }>;
};

const INSTANCIAS: ChildConfig = {
  table: "empresas_instancias",
  title: "Instâncias",
  empty: "Nenhuma instância vinculada.",
  columns: [
    { fields: ["nome", "instancia_nome", "instancia", "descricao"], label: "Nome" },
    { fields: ["token", "apikey", "chave"], label: "Token" },
    { fields: ["status", "situacao"], label: "Status" },
  ],
};

const CAMPOS: ChildConfig = {
  table: "empresas_camposperson",
  title: "Campos personalizados",
  empty: "Nenhum campo personalizado.",
  columns: [
    { fields: ["campo", "nome", "descricao", "label"], label: "Campo" },
    { fields: ["tipo", "campo_tipo"], label: "Tipo" },
    { fields: ["ordem", "sequencia"], label: "Ordem" },
  ],
};

const EMPRESA_FK = ["empresa_id", "id_empresa", "empresaid"];

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
      return ((data ?? []) as Row[]).filter((row) => text(pick(row, EMPRESA_FK)) === text(empresaId));
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
    const payload: Row = { [EMPRESA_FK[0]!]: empresaId };
    for (const col of config.columns) {
      const value = draft[col.fields[0]!] ?? "";
      if (value !== "") payload[col.fields[0]!] = value;
    }
    const { error } = await supabase.from(config.table).insert(payload as never);
    if (error) return toast.error(error.message);
    setDraft({});
    toast.success("Registro adicionado.");
    refresh();
  };

  const remove = async (row: Row) => {
    const key = idColumn(row);
    const { error } = await supabase.from(config.table).delete().eq(key, row[key] as never);
    if (error) return toast.error(error.message);
    toast.success("Registro removido.");
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">{config.empty}</p>}
        {rows.map((row, index) => (
          <div key={text(row[idColumn(row)] ?? index)} className="flex items-center gap-3 p-3 text-sm">
            <div className="grid flex-1 gap-1 sm:grid-cols-3">
              {config.columns.map((col) => (
                <div key={col.label}>
                  <p className="text-xs text-muted-foreground">{col.label}</p>
                  <p className="truncate text-foreground">{text(pick(row, col.fields)) || "—"}</p>
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
          <div key={col.label}>
            <Label className="mb-1.5 block text-xs">{col.label}</Label>
            <Input
              value={draft[col.fields[0]!] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [col.fields[0]!]: e.target.value }))}
            />
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
    for (const field of EMPRESA_FIELDS) next[field.fields[0]!] = text(pick(empresa, field.fields, ""));
    setValues(next);
  }, [open, empresa]);

  const title = useMemo(() => (empresa ? "Editar empresa" : "Nova empresa"), [empresa]);

  const submit = () => {
    const payload: Row = {};
    for (const field of EMPRESA_FIELDS) {
      const key = findKey(empresa, field.fields) ?? field.fields[0]!;
      const raw = values[field.fields[0]!] ?? "";
      if (raw === "" && !empresa) continue;
      payload[key] = raw;
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

          <TabsContent value="dados" className="mt-4 grid gap-4 sm:grid-cols-2">
            {EMPRESA_FIELDS.map((field) => {
              const key = field.fields[0]!;
              return (
                <div key={key} className={field.full ? "sm:col-span-2" : undefined}>
                  <Label htmlFor={key} className="mb-1.5 block">
                    {field.label}
                  </Label>
                  <Input
                    id={key}
                    value={values[key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </div>
              );
            })}
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
