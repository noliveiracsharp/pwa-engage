import { HistoricoButton } from "@/components/auditoria/HistoricoButton";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StarRating } from "@/components/data-table/StarRating";
import { IconPicker } from "@/components/data-table/IconPicker";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { findKey, pick, type Row } from "@/lib/row";
import { rowId, text } from "@/lib/crud";
import { isCompletePhone, isValidCpfCnpj } from "@/lib/input-masks";
import { toast } from "sonner";

export type Field = {
  /** Possible column names, in order of preference. */
  fields: string[];
  label: string;
  type?: "text" | "email" | "tel" | "document" | "number" | "password" | "textarea" | "select" | "rating" | "boolean" | "icon" | "photo";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  full?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  record: Row | null;
  saving?: boolean;
  onSave: (values: Row) => void;
  extra?: ReactNode | undefined;
  /** When set together with `extra`, renders the form in tab panels: "Dados" + this label. */
  extraTabLabel?: string | undefined;
  /** Tab panels (submenus). When set, "dataTabLabel" names the main data tab. */
  tabs?: Array<{ key: string; label: string; content: ReactNode }> | undefined;
  dataTabLabel?: string | undefined;
  /** Hide the data tab (no read permission on it). */
  hideDataTab?: boolean | undefined;
  /** Disable saving (no can_update / can_create). */
  readOnly?: boolean;
  /** Tabela do banco: mostra o botão "Histórico" (auditoria) ao editar. */
  auditTable?: string | undefined;
};

export function columnFor(record: Row | null | undefined, fields: string[]) {
  return findKey(record, fields) ?? fields[0]!;
}

export function RecordSheet({
  open,
  onOpenChange,
  title,
  description,
  fields,
  record,
  saving,
  onSave,
  extra,
  extraTabLabel,
  tabs,
  dataTabLabel,
  hideDataTab,
  readOnly,
  auditTable,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) {
      setValues({});
      return;
    }
    const next: Record<string, string> = {};
    for (const field of fields) {
      const raw = text(pick(record, field.fields, ""));
      // Select com opção "Todos" (__all__): valor vazio/nulo aparece como "Todos".
      next[field.fields[0]!] =
        field.type === "select" && raw === "" && field.options?.some((o) => o.value === "__all__")
          ? "__all__"
          : raw;
    }
    setValues(next);
  }, [open, record, fields]);

  const submit = () => {
    for (const field of fields) {
      const raw = values[field.fields[0]!] ?? "";
      if (field.type === "tel" && !isCompletePhone(raw)) {
        toast.error(`${field.label}: informe um telefone válido.`);
        return;
      }
      if (field.type === "document" && raw && !isValidCpfCnpj(raw)) {
        toast.error(`${field.label}: informe um CPF ou CNPJ válido.`);
        return;
      }
    }
    const payload: Row = {};
    for (const field of fields) {
      const key = columnFor(record, field.fields);
      const raw = values[field.fields[0]!] ?? "";
      if (raw === "" && !record) continue;
      if (field.type === "boolean") {
        if (raw === "") continue;
        payload[key] = raw === "true";
      } else {
        payload[key] = field.type === "number" || field.type === "rating" ? Number(raw || 0) : raw;
      }
    }
    onSave(payload);
  };

  const photoFields = fields.filter((f) => f.type === "photo");
  const bodyFields = fields.filter((f) => f.type !== "photo");

  const photoBlock = photoFields.map((field) => {
    const key = field.fields[0]!;
    return (
      <div key={key} className="pb-2 pt-4">
        <PhotoUpload
          value={values[key] ?? ""}
          onChange={(url) => setValues((s) => ({ ...s, [key]: url }))}
        />
      </div>
    );
  });

  const fieldsGrid = (
    <div className="grid gap-x-4 gap-y-5 pt-2 sm:grid-cols-2">
      {bodyFields.map((field) => {
        const key = field.fields[0]!;
        const value = values[key] ?? "";
        return (
          <div
            key={key}
            className={`min-w-0 space-y-1.5 ${field.full || field.type === "tel" ? "sm:col-span-2" : ""}`}
          >
            <Label htmlFor={key} className="block text-sm font-medium">
              {field.label}
            </Label>
            {field.type === "icon" ? (
              <IconPicker
                id={key}
                value={value}
                onChange={(icon) => setValues((current) => ({ ...current, [key]: icon }))}
              />
            ) : field.type === "boolean" ? (
              <div className="flex h-10 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  {value === "true" ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  id={key}
                  checked={value === "true"}
                  onCheckedChange={(v) => setValues((s) => ({ ...s, [key]: String(v) }))}
                />
              </div>
            ) : field.type === "tel" ? (
              <PhoneInput
                id={key}
                value={value}
                onChange={(phone) => setValues((current) => ({ ...current, [key]: phone }))}
              />
            ) : field.type === "document" ? (
              <DocumentInput
                id={key}
                value={value}
                placeholder={field.placeholder}
                onChange={(document) => setValues((current) => ({ ...current, [key]: document }))}
              />
            ) : field.type === "textarea" ? (
              <Textarea
                id={key}
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            ) : field.type === "select" ? (
              <Select value={value} onValueChange={(v) => setValues((s) => ({ ...s, [key]: v }))}>
                <SelectTrigger id={key}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "rating" ? (
              <StarRating
                value={Number(value || 0)}
                onChange={(n) => setValues((s) => ({ ...s, [key]: String(n) }))}
              />
            ) : (
              <Input
                id={key}
                type={field.type === "number" ? "number" : (field.type ?? "text")}
                value={value}
                placeholder={field.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  const tabList = tabs ?? (extra && extraTabLabel ? [{ key: "extra", label: extraTabLabel, content: extra }] : null);
  const allTabs = tabList
    ? [
        ...(hideDataTab ? [] : [{ key: "dados", label: dataTabLabel ?? "Dados", content: <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70">{photoBlock}{fieldsGrid}</fieldset> }]),
        ...tabList,
      ]
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-center gap-2 pr-8">
            <SheetTitle>{title}</SheetTitle>
            {auditTable && record && (
              <div className="ml-auto"><HistoricoButton tabela={auditTable} registroId={rowId(record)} /></div>
            )}
          </div>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {allTabs && allTabs.length > 0 ? (
            <Tabs key={allTabs[0]!.key} defaultValue={allTabs[0]!.key} className="px-6">
              <TabsList className="h-auto w-full flex-wrap">
                {allTabs.map((t) => (
                  <TabsTrigger key={t.key} value={t.key} className="flex-1">{t.label}</TabsTrigger>
                ))}
              </TabsList>
              {allTabs.map((t) => (
                <TabsContent key={t.key} value={t.key} className={t.key === "dados" ? undefined : "pt-4"}>
                  {t.content}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="px-6">
              <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-70">
                {photoBlock}
                {fieldsGrid}
              </fieldset>
              {extra && <div className="pt-6">{extra}</div>}
            </div>
          )}
        </div>

        <div className="bg-background flex shrink-0 justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || readOnly}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
