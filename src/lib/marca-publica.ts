import { supabase } from "@/integrations/supabase/client";

export type MarcaPublica = {
  nome?: string | null; titulo?: string | null; logo?: string | null; logo_escuro?: string | null;
  favicon?: string | null; cor_primaria_claro?: string | null; cor_primaria_escuro?: string | null;
};

const CHAVE = "atendeai-slug";
const DOMINIO_BASE = "atendeai.co";
/** Caminhos do sistema que nunca podem ser usados como endereço de empresa. */
export const SLUGS_RESERVADOS = new Set([
  "login", "dashboard", "api", "portal", "fornecedor", "checkout", "reset-password", "widget", "chamada",
  "proposta", "minuta", "cotacao", "compartilhado", "sitemap", "www", "app", "admin", "orcamentos",
  "financeiro", "relatorios", "projetos", "atendimentos", "empresas", "usuarios", "pessoas", "itens",
]);

export function normalizarSlug(v: string) {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

/** Slug do subdomínio (conectcon.atendeai.co), se houver. */
export function slugDoHost(host: string): string | null {
  const h = host.toLowerCase();
  if (!h.endsWith(`.${DOMINIO_BASE}`)) return null;
  const sub = h.slice(0, -(DOMINIO_BASE.length + 1));
  if (!sub || sub.includes(".") || SLUGS_RESERVADOS.has(sub)) return null;
  return sub;
}

export function lembrarSlug(slug: string | null) {
  try { if (slug) localStorage.setItem(CHAVE, slug); else localStorage.removeItem(CHAVE); } catch { /* ignore */ }
}
export function slugLembrado() {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}

export async function buscarMarca(slug: string): Promise<MarcaPublica | null> {
  const { data, error } = await (supabase.rpc as any)("empresa_marca_publica", { p_slug: slug });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

const HEX = /^#([0-9a-f]{6})$/i;
function fg(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.6 ? "oklch(0.15 0.03 255)" : "oklch(0.99 0.005 247)";
}
function bloco(sel: string, cor?: string | null) {
  if (!cor || !HEX.test(cor)) return "";
  const f = fg(cor);
  return `${sel}{--primary:${cor};--primary-foreground:${f};--ring:${cor};}`;
}

/** Aplica cores, favicon e título da marca na página atual. */
export function aplicarMarca(m: MarcaPublica) {
  const css = bloco(":root", m.cor_primaria_claro) + bloco(".dark", m.cor_primaria_escuro || m.cor_primaria_claro);
  let el = document.getElementById("white-label-publico") as HTMLStyleElement | null;
  if (css) {
    if (!el) { el = document.createElement("style"); el.id = "white-label-publico"; document.head.appendChild(el); }
    el.textContent = css;
  }
  const icon = m.favicon || m.logo;
  if (icon) {
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    if (links.length) links.forEach((l) => { l.href = icon; });
    else { const l = document.createElement("link"); l.rel = "icon"; l.href = icon; document.head.appendChild(l); }
  }
  const t = m.titulo || m.nome;
  if (t) document.title = `Entrar — ${t}`;
}
