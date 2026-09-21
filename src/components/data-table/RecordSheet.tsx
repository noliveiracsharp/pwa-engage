import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StarRating } from "@/components/data-table/StarRating";
import { IconPicker } from "@/components/data-table/IconPicker";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { PhoneInput } from "@/components/data-table/PhoneInput";
import { DocumentInput } from "@/components/data-table/DocumentInput";
import { findKey, pick, type Row } from "@/lib/row";
import { text } from "@/lib/crud";
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
  extra?: ReactNode;
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
}: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.fields[0]!] = text(pick(record, field.fields, ""));
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="px-6 border-b border-border pb-6">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        {photoFields.map((field) => {
          const key = field.fields[0]!;
          return (
            <div key={key} className="px-6 pb-2 pt-4">
              <PhotoUpload
                value={values[key] ?? ""}
                onChange={(url) => setValues((s) => ({ ...s, [key]: url }))}
              />
            </div>
          );
        })}

        <div className="grid gap-x-4 gap-y-5 px-6 pt-2 sm:grid-cols-2">
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

        {extra && <div className="px-6 pt-6">{extra}</div>}

        <div className="bg-background sticky bottom-0 mt-2 flex justify-end gap-2 border-t px-6 py-4">
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
