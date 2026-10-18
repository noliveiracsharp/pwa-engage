import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Bucket privado: arquivos só abrem por link temporário assinado. */
export const BUCKET_PRIVADO = "privado";
const PREFIXO = "privado://";
const VALIDADE_SEG = 3600;

export function ehPrivado(ref: unknown): ref is string {
  return typeof ref === "string" && ref.startsWith(PREFIXO);
}

export function caminhoPrivado(ref: string): string {
  return ref.slice(PREFIXO.length);
}

export function montarCaminho(empresaId: string, pasta: string, nomeArquivo: string, id: string): string {
  const ext = nomeArquivo.split(".").pop()?.toLowerCase() || "bin";
  return `${empresaId}/${pasta}/${id}.${ext}`;
}

async function empresaAtual(): Promise<string> {
  const { data, error } = await (supabase.rpc as any)("app_usuario_empresa_id");
  if (error || !data) throw new Error("Não foi possível identificar sua empresa para salvar o arquivo.");
  return String(data);
}

/** Envia ao bucket privado e devolve a referência "privado://..." para gravar no registro. */
export async function enviarPrivado(file: File, pasta: string): Promise<string> {
  const path = montarCaminho(await empresaAtual(), pasta, file.name, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(BUCKET_PRIVADO)
    .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return PREFIXO + path;
}

/** Converte a referência em link temporário; URLs antigas (públicas) passam direto. */
export async function urlAssinada(ref: string): Promise<string> {
  if (!ehPrivado(ref)) return ref;
  const { data, error } = await supabase.storage
    .from(BUCKET_PRIVADO)
    .createSignedUrl(caminhoPrivado(ref), VALIDADE_SEG);
  if (error || !data) throw new Error("Você não tem acesso a este arquivo.");
  return data.signedUrl;
}

/** Abre em nova aba sem ser barrado pelo bloqueador de pop-up. */
export async function abrirArquivo(ref: string): Promise<void> {
  if (!ehPrivado(ref)) { window.open(ref, "_blank", "noopener"); return; }
  const aba = window.open("about:blank", "_blank");
  try {
    const url = await urlAssinada(ref);
    if (aba) aba.location.href = url; else window.location.href = url;
  } catch (e) {
    aba?.close();
    throw e;
  }
}

/** Link exibível (imagem/miniatura) para uma referência privada ou URL antiga. */
export function useUrlAssinada(ref: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(ref && !ehPrivado(ref) ? ref : undefined);
  useEffect(() => {
    let vivo = true;
    if (!ref) { setUrl(undefined); return; }
    if (!ehPrivado(ref)) { setUrl(ref); return; }
    urlAssinada(ref).then((u) => vivo && setUrl(u)).catch(() => vivo && setUrl(undefined));
    return () => { vivo = false; };
  }, [ref]);
  return url;
}
