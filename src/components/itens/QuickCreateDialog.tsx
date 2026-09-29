import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PhotoUpload } from "@/components/data-table/PhotoUpload";
import { useAudit } from "@/lib/audit";
import type { Row } from "@/lib/row";

export type QuickField = { key: string; label: string; type?: "text" | "photo" | "boolean" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  table: string;
  fields: QuickField[];
  onCreated: (id: string) => void;
};

/** Cadastro rápido usado pelos selects do formulário de itens. */
export function QuickCreateDialog({ open, onOpenChange, title, table, fields, onCreated }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { stamp } = useAudit();

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const field of fields) next[field.key] = field.type === "boolean" ? "true" : "";
    setValues(next);
  }, [open, fields]);

  const submit = async () => {
    const payload: Row = {};
    for (const field of fields) {
      const raw = values[field.key] ?? "";
      if (field.type === "boolean") payload[field.key] = raw === "true";
      else if (raw !== "") payload[field.key] = raw;
    }
    if (!payload["descricao"]) {
      toast.error("Informe a descrição.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from(table).insert(stamp(payload, true)).select("id").maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["table", table] });
    toast.success("Registro criado.");
    const created = (data as Row | null)?.["id"];
    if (created) onCreated(String(created));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {fields.map((field) => {
            const value = values[field.key] ?? "";
            if (field.type === "photo") {
              return (
                <PhotoUpload
                  key={field.key}
                  value={value}
                  alt={field.label}
                  onChange={(url) => setValues((s) => ({ ...s, [field.key]: url }))}
                />
              );
            }
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`quick-${field.key}`} className="block text-sm font-medium">
                  {field.label}
                </Label>
                {field.type === "boolean" ? (
                  <div className="bg-background flex h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="text-muted-foreground text-sm">{value === "true" ? "Ativo" : "Inativo"}</span>
                    <Switch
                      id={`quick-${field.key}`}
                      checked={value === "true"}
                      onCheckedChange={(v) => setValues((s) => ({ ...s, [field.key]: String(v) }))}
                    />
                  </div>
                ) : (
                  <Input
                    id={`quick-${field.key}`}
                    value={value}
                    onChange={(e) => setValues((s) => ({ ...s, [field.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Salvando…" : "Cadastrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
