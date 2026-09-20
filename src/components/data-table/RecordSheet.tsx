import { useEffect, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StarRating } from "@/components/data-table/StarRating";
import { findKey, pick, type Row } from "@/lib/row";
import { text } from "@/lib/crud";

export type Field = {
  /** Possible column names, in order of preference. */
  fields: string[];
  label: string;
  type?: "text" | "email" | "tel" | "number" | "textarea" | "select" | "rating";
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
    const payload: Row = {};
    for (const field of fields) {
      const key = columnFor(record, field.fields);
      const raw = values[field.fields[0]!] ?? "";
      if (raw === "" && !record) continue;
      payload[key] = field.type === "number" || field.type === "rating" ? Number(raw || 0) : raw;
    }
    onSave(payload);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="grid gap-4 px-4 sm:grid-cols-2">
          {fields.map((field) => {
            const key = field.fields[0]!;
            const value = values[key] ?? "";
            return (
              <div key={key} className={field.full ? "sm:col-span-2" : undefined}>
                <Label htmlFor={key} className="mb-1.5 block">
                  {field.label}
                </Label>
                {field.type === "textarea" ? (
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

        {extra && <div className="px-4 pt-4">{extra}</div>}

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
