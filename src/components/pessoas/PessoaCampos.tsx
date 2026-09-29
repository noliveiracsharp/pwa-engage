import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

type Props = { pessoaId?: string | number | undefined };

function inputTypeFor(tipo: string) {
  const t = tipo.toLowerCase();
  if (t.includes("int") || t.includes("num") || t.includes("float") || t.includes("decimal")) return "number";
  if (t.includes("date") || t.includes("data")) return "date";
  if (t.includes("mail")) return "email";
  if (t.includes("bool")) return "boolean";
  if (t.includes("area") || t.includes("long")) return "textarea";
  return "text";
}

export function PessoaCampos({ pessoaId }: Props) {
  const queryClient = useQueryClient();
  const { empresa } = useAuth();
  const empresaId = empresa ? pick(empresa, ["id"]) : undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: definicoes = [], isError } = useQuery({
    queryKey: ["table", "empresas_camposperson"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("empresas_camposperson").select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: valores = [] } = useQuery({
    queryKey: ["table", "pessoas_camposperson", text(pessoaId)],
    enabled: Boolean(pessoaId),
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("pessoas_camposperson").select("*");
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((row) => text(pick(row, ["pessoa_id"])) === text(pessoaId));
    },
  });

  const campos = useMemo(
    () =>
      definicoes
        .filter((row) => {
          const dono = pick(row, ["empresa_id"]);
          return empresaId === undefined || dono === undefined || text(dono) === text(empresaId);
        })
        .filter((row) => text(pick(row, ["chave"])) !== "")
        .sort((a, b) => text(pick(a, ["chave"])).localeCompare(text(pick(b, ["chave"])))),
    [definicoes, empresaId],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const campo of campos) {
      const chave = text(pick(campo, ["chave"]));
      const existente = valores.find((row) => text(pick(row, ["chave"])) === chave);
      next[chave] = text(pick(existente, ["valor"], ""));
    }
    setValues(next);
  }, [campos, valores]);

  if (isError) {
    return <p className="text-muted-foreground text-sm">Não foi possível carregar os campos personalizados.</p>;
  }
  if (campos.length === 0) return null;

  const save = async () => {
    if (!pessoaId) return;
    setSaving(true);
    try {
      for (const campo of campos) {
        const chave = text(pick(campo, ["chave"]));
        const valor = values[chave] ?? "";
        const existente = valores.find((row) => text(pick(row, ["chave"])) === chave);
        if (existente) {
          const { error } = await supabase
            .from("pessoas_camposperson")
            .update({ valor })
            .eq("id", pick(existente, ["id"]) as never);
          if (error) throw error;
        } else if (valor !== "") {
          const { error } = await supabase
            .from("pessoas_camposperson")
            .insert({ pessoa_id: pessoaId, chave, valor });
          if (error) throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["table", "pessoas_camposperson"] });
      toast.success("Campos personalizados salvos.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar os campos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Campos personalizados</h3>
        <p className="text-muted-foreground text-xs">
          Campos definidos no cadastro da empresa.
        </p>
      </div>

      {!pessoaId ? (
        <p className="text-muted-foreground text-sm">Salve a pessoa para preencher os campos personalizados.</p>
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {campos.map((campo) => {
              const chave = text(pick(campo, ["chave"]));
              const tipo = inputTypeFor(text(pick(campo, ["tipo"], "text")));
              const value = values[chave] ?? "";
              const id = `campo-${chave}`;
              return (
                <div key={chave} className={`min-w-0 space-y-1.5 ${tipo === "textarea" ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={id} className="block text-sm font-medium">
                    {chave}
                  </Label>
                  {tipo === "boolean" ? (
                    <div className="bg-background flex h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="text-muted-foreground text-sm">{value === "true" ? "Sim" : "Não"}</span>
                      <Switch
                        id={id}
                        checked={value === "true"}
                        onCheckedChange={(v) => setValues((s) => ({ ...s, [chave]: String(v) }))}
                      />
                    </div>
                  ) : tipo === "textarea" ? (
                    <Textarea
                      id={id}
                      value={value}
                      onChange={(e) => setValues((s) => ({ ...s, [chave]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id={id}
                      type={tipo}
                      value={value}
                      onChange={(e) => setValues((s) => ({ ...s, [chave]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar campos"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
