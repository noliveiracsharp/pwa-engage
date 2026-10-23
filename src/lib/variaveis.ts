import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";

/** Variável disponível no autocomplete `{{`. */
export type VariavelDef = { chave: string; descricao?: string; personalizada?: boolean };

/** Normaliza o nome digitado para uma chave válida: minúsculas, sem acento, com _. */
export function chaveVariavel(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Valores das variáveis personalizadas da empresa ativa (preenchido pelo hook). */
let personalizadasAtivas: Record<string, string> = {};
export function variaveisPersonalizadasAtivas() {
  return personalizadasAtivas;
}
export function definirVariaveisPersonalizadas(v: Record<string, string>) {
  personalizadasAtivas = v;
}

/**
 * Detecta se o cursor está logo após um `{{` aberto e devolve o termo digitado.
 * Ex.: "Olá {{no|" → { inicio: 4, termo: "no" }.
 */
export function gatilhoVariavel(texto: string, cursor: number): { inicio: number; termo: string } | null {
  const antes = texto.slice(0, cursor);
  const i = antes.lastIndexOf("{{");
  if (i < 0) return null;
  const termo = antes.slice(i + 2);
  if (!/^\w*$/.test(termo)) return null;
  return { inicio: i, termo };
}

/** Substitui o trecho `{{termo` pelo `{{chave}}` completo e devolve o novo texto e cursor. */
export function inserirVariavel(texto: string, cursor: number, inicio: number, chave: string) {
  let fim = cursor;
  // Absorve um "}}" que já esteja logo à frente.
  if (texto.slice(fim, fim + 2) === "}}") fim += 2;
  const ins = `{{${chave}}}`;
  return { texto: texto.slice(0, inicio) + ins + texto.slice(fim), cursor: inicio + ins.length };
}

export function useVariaveisPersonalizadas(empresaId: string | number | undefined) {
  const q = useQuery({
    queryKey: ["variaveis_personalizadas", String(empresaId ?? "")],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("variaveis_personalizadas" as never)
        .select("*")
        .eq("empresa_id", String(empresaId))
        .order("chave");
      if (error) return [] as Row[];
      return (data ?? []) as Row[];
    },
  });
  const linhas = q.data ?? [];
  useEffect(() => {
    definirVariaveisPersonalizadas(Object.fromEntries(linhas.map((r) => [String(r["chave"]), String(r["valor"] ?? "")])));
  }, [linhas]);
  return q;
}
