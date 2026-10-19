import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "./auth-guard";
import { dominioEmail } from "./contatos";

async function temRegistro(dominio: string, tipo: "MX" | "A"): Promise<boolean | null> {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(dominio)}&type=${tipo}`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { Status?: number; Answer?: unknown[] };
    if (j.Status === 3) return false; // domínio inexistente
    return Array.isArray(j.Answer) && j.Answer.length > 0;
  } catch { return null; }
}

/** Confere se o provedor do e-mail existe e recebe mensagens (registro MX). */
export const validarEmailProvedor = createServerFn({ method: "POST" }).middleware([exigirLogin])
  .inputValidator((d) => z.object({ email: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const dominio = dominioEmail(data.email);
    if (!dominio) return { status: "invalido" as const };
    const mx = await temRegistro(dominio, "MX");
    if (mx === true) return { status: "valido" as const };
    if (mx === null) return { status: "indisponivel" as const };
    const a = await temRegistro(dominio, "A");
    if (a === true) return { status: "valido" as const };
    return a === null ? { status: "indisponivel" as const } : { status: "sem_provedor" as const };
  });
