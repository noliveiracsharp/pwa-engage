import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/lib/auth-guard";
import { z } from "zod";
import { executarHttp } from "@/lib/fluxos-externo";

/** Testa o bloco HTTP pelo servidor (sem CORS), igual ao webhook real. */
export const testarHttpFluxo = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) =>
    z.object({
      metodo: z.string().max(10),
      url: z.string().max(4000),
      cabecalhos: z.string().max(20000),
      corpo: z.string().max(100000),
      vars: z.record(z.string(), z.string().max(5000)),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const inicio = Date.now();
    const r = await executarHttp({ ...data, variavel: "r" }, data.vars);
    return {
      ok: r.saida === "sucesso",
      status: Number(r.variaveis["r_status"] || 0),
      ms: Date.now() - inicio,
      corpo: r.variaveis["r"] ?? "",
      erro: r.erro ?? null,
    };
  });
