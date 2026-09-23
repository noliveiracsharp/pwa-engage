import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";

/** Paths that every authenticated user may open, regardless of menu grants. */
const ALWAYS_ALLOWED = ["/dashboard", "/meus-dados"];

/** Same fallback used by the sidebar when the view returns nothing. */
const FALLBACK_PATHS = [
  "/dashboard",
  "/empresas",
  "/clientes",
  "/usuarios",
  "/funcoes",
  "/kanban",
  "/atendimentos",
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
export async function getAllowedPaths(userId: string, email?: string): Promise<string[] | null> {
  try {
    let usuario: Row | null = null;
    const byAuth = await supabase.from("usuarios").select("*").eq("auth_user_id", userId).maybeSingle();
    usuario = (byAuth.data as Row) ?? null;
    if (!usuario) {
      const byId = await supabase.from("usuarios").select("*").eq("id", userId).maybeSingle();
      usuario = (byId.data as Row) ?? null;
    }
    if (!usuario && email) {
      const byEmail = await supabase.from("usuarios").select("*").eq("email", email).maybeSingle();
      usuario = (byEmail.data as Row) ?? null;
    }
    if (!usuario) return null;

    const perfilId = pick<string | number>(usuario, ["perfil_id", "id_perfil"]);
    if (perfilId === undefined || perfilId === null || String(perfilId) === "") {
      return [...ALWAYS_ALLOWED];
    }

    const { data, error } = await supabase
      .from("vw_menu_usuario_perfil")
      .select("*")
      .eq("perfil_id", perfilId as string)
      .order("ordem_hierarquia");
    if (error) return null;

    const rows = ((data ?? []) as Row[]).filter(
      (row) => asBool(row["can_read"]) && asBool(row["funcao_status"]),
    );
    if (rows.length === 0) {
      // View vazia: mesmo comportamento do menu lateral (fallback).
      return [...new Set([...FALLBACK_PATHS, ...ALWAYS_ALLOWED])];
    }

    const paths = rows.map((row) =>
      String(pick(row, ["path", "funcao_path", "rota", "url"], "/dashboard")),
    );
    return [...new Set([...paths, ...ALWAYS_ALLOWED])];
  } catch {
    return null;
  }
}

export function isPathAllowed(pathname: string, allowed: string[]): boolean {
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
