import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

type Props = { pessoaId?: string | number | undefined };

const opcoesDe = (v: string) => v.split(",").map((o) => o.trim()).filter(Boolean);

function inputTypeFor(tipo: string) {
  const t = tipo.toLowerCase();
  if (t === "select") return "select";
  if (t.startsWith("radio")) return "radio";
  if (t === "checkbox") return "boolean";
  if (t.includes("int") || t.includes("num") || t.includes("float") || t.includes("decimal")) return "number";
  if (t.includes("date") || t.includes("data")) return "date";
  if (t.includes("mail")) return "email";
  if (t.includes("bool")) return "boolean";
  if (t.includes("area") || t.includes("long")) return "textarea";
  return "text";
}

export const TEMPLATES_CAMPOS: Record<string, string> = {
  atendimento: "Suporte / Atendimento",
  geral: "Geral (todos)",
  ofertas: "Ofertas",
  pessoas: "Pessoas / Contatos",
};

/** Template "geral" (ou vazio) aparece em todos os módulos. */
export const campoNoTemplate = (campoTemplate: unknown, alvos: string[]) => {
  const t = String(campoTemplate ?? "").trim() || "geral";
  return t === "geral" || alvos.includes(t);
};

export function PessoaCampos({ pessoaId, templates = ["pessoas", "atendimento"], tabela = "pessoas_camposperson", fk = "pessoa_id", titulo = "Campos personalizados" }: Props) {
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
    queryKey: ["table", tabela, text(pessoaId)],
    enabled: Boolean(pessoaId),
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase.from as unknown as (t: string) => ReturnType<typeof supabase.from>)(tabela).select("*").eq(fk as never, pessoaId as never);
      if (error) throw error;
      return (data ?? []) as Row[];
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
        .filter((row) => campoNoTemplate(row["template"], templates))
        .sort((a, b) => (Number(pick(a, ["ordem"])) || 0) - (Number(pick(b, ["ordem"])) || 0) || text(pick(a, ["chave"])).localeCompare(text(pick(b, ["chave"])))),
    [definicoes, empresaId, templates.join(",")],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const campo of campos) {
      const chave = text(pick(campo, ["chave"]));
      const existente = valores.find((row) => text(pick(row, ["chave"])) === chave);
      const tp = inputTypeFor(text(pick(campo, ["tipo"], "texto")));
      const padrao = tp === "select" || tp === "radio" ? "" : text(pick(campo, ["valor"], ""));
      next[chave] = existente ? text(pick(existente, ["valor"], "")) : padrao;
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
        const ordem = Number(pick(campo, ["ordem"])) || 0;
        const existente = valores.find((row) => text(pick(row, ["chave"])) === chave);
        if (existente) {
          const { error } = await supabase
            .from(tabela as "pessoas_camposperson")
            .update({ valor, ordem } as never)
            .eq("id", pick(existente, ["id"]) as never);
          if (error) throw error;
        } else if (valor !== "") {
          const { error } = await supabase
            .from(tabela as "pessoas_camposperson")
            .insert({ [fk]: pessoaId, chave, valor, ordem } as never);
          if (error) throw error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["table", tabela] });
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
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-muted-foreground text-xs">
          Campos definidos no cadastro da empresa.
        </p>
      </div>

      {!pessoaId ? (
        <p className="text-muted-foreground text-sm">Salve o registro para preencher os campos personalizados.</p>
      ) : (
        <>
          <div className="grid gap-x-4 gap-y-5">
            {campos.map((campo) => {
              const chave = text(pick(campo, ["chave"]));
              const tipo = inputTypeFor(text(pick(campo, ["tipo"], "texto")));
              const opcoes = opcoesDe(text(pick(campo, ["valor"], "")));
              const value = values[chave] ?? "";
              const id = `campo-${chave}`;
              return (
                <div key={chave} className={`min-w-0 space-y-1.5 ${tipo === "textarea" ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={id} className="block text-sm font-medium">
                    {text(pick(campo, ["label"])) || chave}
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
                  ) : tipo === "select" ? (
                    <Select value={value} onValueChange={(v) => setValues((s) => ({ ...s, [chave]: v }))}>
                      <SelectTrigger id={id}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : tipo === "radio" ? (
                    <RadioGroup value={value} onValueChange={(v) => setValues((s) => ({ ...s, [chave]: v }))} className="gap-2">
                      {opcoes.map((o) => (
                        <div key={o} className="flex items-center gap-2">
                          <RadioGroupItem id={`${id}-${o}`} value={o} />
                          <Label htmlFor={`${id}-${o}`} className="font-normal">{o}</Label>
                        </div>
                      ))}
                    </RadioGroup>
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
