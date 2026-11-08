import type { SupabaseClient } from "@supabase/supabase-js";

export const RECUPERACAO_KEY = "atendeai.recuperacaoUsuario";

/** A confirmação do servidor é obrigatória; uma sessão comum não basta. */
export async function validarRecuperacao(
  auth: SupabaseClient["auth"],
  callbackUrl: string,
  usuarioRecuperacao: string | null,
  eventoRecuperacao: () => boolean,
): Promise<string | null> {
  const url = new URL(callbackUrl);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has("error") || hash.has("error")) return null;
  const recovery = hash.get("type") === "recovery" || url.searchParams.get("type") === "recovery";
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  if (tokenHash && recovery) {
    const { error } = await auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (error) return null;
  } else if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return null;
  }
  // Aguarda também a inicialização automática dos tokens no fragmento da URL.
  const { data, error } = await auth.getSession();
  if (error || !data.session) return null;
  const evidence = recovery || Boolean(code) || eventoRecuperacao() || usuarioRecuperacao === data.session.user.id;
  if (!evidence) return null;
  const verified = await auth.getUser();
  return !verified.error && verified.data.user?.id === data.session.user.id ? verified.data.user.id : null;
}

export function preservarRecuperacao(pathname: string) {
  return pathname === "/reset-password" || pathname === "/reset-password/";
}