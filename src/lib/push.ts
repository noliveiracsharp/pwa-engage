import { supabase } from "@/integrations/supabase/client";

/** Chave pública VAPID (pode ficar no código; a privada fica no servidor). */
export const VAPID_PUBLICA = "BLWSgiytU1XP9k0MsHRuDBvcqtrRZEfUDt4FL9JstL5e5dEXoLzefB9dFtiUUu8YpPWQJ_ZTkAIiUjqiTKAEgRA";
const SW = "/push-sw.js";

export type EstadoPush = "indisponivel" | "instalar_ios" | "negado" | "pendente" | "ativo";

const ehIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalado = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Só chamar no navegador (useEffect/evento). */
export async function estadoPush(): Promise<EstadoPush> {
  const temApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!temApi) return ehIos() && !instalado() ? "instalar_ios" : "indisponivel";
  if (Notification.permission === "denied") return "negado";
  if (Notification.permission !== "granted") return "pendente";
  const reg = await navigator.serviceWorker.getRegistration(SW);
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "ativo" : "pendente";
}

function chaveBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Pede permissão (precisa vir de um toque do usuário), inscreve o aparelho e salva no banco. */
export async function ativarPush(): Promise<EstadoPush> {
  if ((await estadoPush()) === "indisponivel") return "indisponivel";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "negado" : "pendente";
  const reg = await navigator.serviceWorker.register(SW, { scope: "/" });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) }));
  await salvarInscricao(sub);
  return "ativo";
}

/** Reenvia a inscrição atual (ex.: outro login no mesmo celular). Silencioso. */
export async function sincronizarPush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator) || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration(SW);
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await salvarInscricao(sub);
  } catch { /* opcional */ }
}

async function salvarInscricao(sub: PushSubscription) {
  const j = sub.toJSON();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("push_inscrever", { p_endpoint: j.endpoint, p_p256dh: j.keys?.["p256dh"], p_auth: j.keys?.["auth"], p_aparelho: navigator.userAgent });
  if (error) throw new Error(error.message);
}

/** Pede ao servidor para enviar as notificações pendentes agora. */
export function dispararPush(): void {
  if (typeof window === "undefined") return;
  void fetch("/api/public/push-enviar", { method: "POST" }).catch(() => undefined);
}
