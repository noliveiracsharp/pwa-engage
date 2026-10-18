import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { isPerfilMaster } from "@/hooks/useAuth";

/** Paths that every authenticated user may open, regardless of menu grants. */
const ALWAYS_ALLOWED = ["/meus-dados", "/sem-acesso"];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _LEGACY_PATHS = [
  "/dashboard",
  "/empresas",
  "/pessoas",
  "/usuarios",
  "/funcoes",
  "/kanban",
  "/atendimentos",
  "/itens",
  "/marcas",
  "/unid_medida",
  "/centro_custos",
  "/parceiros",
  "/orcamentos",
];


function asBool(v: unknown, fallback = true): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  return String(v) === "true" || String(v) === "1";
}

/**
 * Returns the list of paths the given auth user is allowed to open,
 * based on vw_menu_usuario_perfil (perfil_id do usuário logado).
 * Returns null when the access cannot be verified (fail-open).
 */
const accessCache = new Map<string, { at: number; value: Promise<string[] | null> }>();
const ACCESS_TTL = 60_000;

/** Limpa o cache de permissões (logout, troca de usuário, alteração em Funções). */
export function clearAccessCache() {
  accessCache.clear();
}

/** Versão em cache (60s) de getAllowedPaths — usada pelo guardião de rotas. */
export function getAllowedPathsCached(userId: string, email?: string): Promise<string[] | null> {
  const hit = accessCache.get(userId);
  if (hit && Date.now() - hit.at < ACCESS_TTL) return hit.value;
  const value = getAllowedPaths(userId, email);
  accessCache.set(userId, { at: Date.now(), value });
  value.then((v) => { if (v === null) accessCache.delete(userId); }, () => accessCache.delete(userId));
  return value;
}

export async function getAllowedPaths(userId: string, email?: string): Promise<string[] | null> {
  try {
    let usuario: Row | null = null;
    const byId = await supabase.from("usuarios").select("*").eq("id", userId).maybeSingle();
    usuario = (byId.data as Row) ?? null;
    if (byId.error && !email) throw byId.error;
    if (!usuario && email) {
      const byEmail = await supabase.from("usuarios").select("*").eq("email", email).maybeSingle();
      usuario = (byEmail.data as Row) ?? null;
      if (!usuario && byEmail.error) throw byEmail.error;
    }
    if (!usuario) return [...ALWAYS_ALLOWED];

    const perfilId = pick<string | number>(usuario, ["perfil_id", "id_perfil"]);
    // Master (perfil.ordem = 0): acesso total a todas as rotas.
    if (await isPerfilMaster(perfilId)) return null;
    if (perfilId === undefined || perfilId === null || String(perfilId) === "") {
      return [...ALWAYS_ALLOWED];
    }

    const { data, error } = await supabase
      .from("vw_menu_usuario_perfil")
      .select("*")
      .eq("perfil_id", perfilId as string)
      .order("ordem_hierarquia");
    if (error) throw error;

    const rows = ((data ?? []) as Row[]).filter(
      (row) => asBool(row["can_read"]) && asBool(row["funcao_status"]),
    );
    if (rows.length === 0) {
      // View vazia: mesmo comportamento do menu lateral (fallback).
      return [...ALWAYS_ALLOWED];
    }

    const paths = rows.map((row) =>
      String(pick(row, ["path", "funcao_path", "rota", "url"], "/dashboard")),
    );
    return [...new Set([...paths, ...ALWAYS_ALLOWED])];
  } catch {
    // Falha temporária (rede/token renovando): não rebaixa o usuário; o banco continua protegendo os dados.
    return null;
  }
}

export function isPathAllowed(pathname: string, allowed: string[]): boolean {
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Primeira tela liberada ao perfil (ou /sem-acesso quando não há nenhuma). */
export function firstAllowedPath(allowed: string[]): string {
  return allowed.find((p) => !ALWAYS_ALLOWED.includes(p)) ?? "/sem-acesso";
}
