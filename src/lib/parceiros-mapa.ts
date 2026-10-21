import type { Row } from "@/lib/row";

export type CategoriaPin = "cliente" | "fornecedor" | "ambos" | "inativo";

export const LEGENDA_PINS: { cat: CategoriaPin; label: string }[] = [
  { cat: "cliente", label: "Clientes" },
  { cat: "fornecedor", label: "Fornecedores" },
  { cat: "ambos", label: "Cliente e fornecedor" },
  { cat: "inativo", label: "Inativos" },
];

/** Inativo tem prioridade; depois cliente+fornecedor, cliente, fornecedor. */
export function categoriaPin(r: Row): CategoriaPin {
  if (r["status"] === false) return "inativo";
  const c = r["is_cliente"] === true, f = r["is_fornecedor"] === true;
  if (c && f) return "ambos";
  return f ? "fornecedor" : "cliente";
}

/** Coordenadas válidas (ignora vazio, 0,0 e fora do intervalo). */
export function coordenadas(r: Row): [number, number] | null {
  const lat = Number(r["latitude"]), lng = Number(r["longitude"]);
  if (r["latitude"] == null || r["longitude"] == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if ((lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}
