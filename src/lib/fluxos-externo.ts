/**
 * Blocos que o motor puro não executa: Requisição HTTP e JavaScript.
 * Roda no servidor (webhook). JavaScript usa o interpretador Sval (sem eval, isolado).
 */
import Sval from "sval";
import { interpolar, paraTexto, valorVar, type NoFluxo } from "@/lib/fluxos-motor";

export type ResultadoExterno = { saida: string; variaveis: Record<string, string>; erro?: string };

const HOST_BLOQUEADO = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;

/** "Chave: valor" por linha. */
export function lerCabecalhos(texto: string, vars: Record<string, string>) {
  const h: Record<string, string> = {};
  for (const linha of texto.split("\n")) {
    const i = linha.indexOf(":");
    if (i > 0) h[linha.slice(0, i).trim()] = interpolar(linha.slice(i + 1).trim(), vars);
  }
  return h;
}

export async function executarHttp(d: Record<string, unknown>, vars: Record<string, string>, f: typeof fetch = fetch): Promise<ResultadoExterno> {
  const variavel = String(d["variavel"] || "resposta");
  const novas = { ...vars };
  try {
    const url = new URL(interpolar(String(d["url"] ?? ""), vars));
    if (!/^https?:$/.test(url.protocol) || HOST_BLOQUEADO.test(url.hostname)) throw new Error("Endereço não permitido");
    const metodo = String(d["metodo"] || "GET").toUpperCase();
    const headers = lerCabecalhos(String(d["cabecalhos"] ?? ""), vars);
    const corpo = metodo === "GET" || metodo === "DELETE" ? undefined : interpolar(String(d["corpo"] ?? ""), vars) || undefined;
    if (corpo && !Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const resp = await f(url.toString(), { method: metodo, headers, body: corpo ?? null, signal: ctrl.signal }).finally(() => clearTimeout(t));
    const texto = (await resp.text()).slice(0, 100_000);
    novas[variavel] = texto;
    novas[`${variavel}_status`] = String(resp.status);
    return { saida: resp.ok ? "sucesso" : "falha", variaveis: novas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    novas[`${variavel}_erro`] = msg;
    return { saida: "falha", variaveis: novas, erro: msg };
  }
}

export function executarCodigo(d: Record<string, unknown>, vars: Record<string, string>): ResultadoExterno {
  const novas = { ...vars };
  try {
    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(vars)) input[k] = valorVar(v);
    const s = new Sval({ ecmaVer: "latest", sandBox: true });
    s.import({ input });
    s.run(`exports.__r = (function(){\n${String(d["codigo"] ?? "")}\n})();`);
    const r = (s.exports as Record<string, unknown>)["__r"];
    if (r && typeof r === "object" && !Array.isArray(r)) {
      for (const [k, v] of Object.entries(r)) novas[k] = paraTexto(v);
    } else if (r !== undefined) {
      novas["resultado"] = paraTexto(r);
    }
    return { saida: "sucesso", variaveis: novas };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    novas["erro_codigo"] = msg;
    return { saida: "erro", variaveis: novas, erro: msg };
  }
}

export function executarExterno(no: NoFluxo, vars: Record<string, string>) {
  const tipo = no.data?.tipo ?? no.type;
  return tipo === "http" ? executarHttp(no.data, vars) : Promise.resolve(executarCodigo(no.data, vars));
}
