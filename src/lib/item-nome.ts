/** Nome completo do item para cotações e Ofertas: "Descrição Marca Modelo" (sem repetir partes vazias). */
export function nomeItemCompleto(item: Record<string, unknown> | null | undefined, marca?: string | null): string {
  if (!item) return "";
  const partes = [item["descricao"], marca, item["modelo"]].map((x) => String(x ?? "").trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of partes) if (!out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  return out.join(" ");
}
