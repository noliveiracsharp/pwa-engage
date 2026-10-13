import imageCompression from "browser-image-compression";

export type PerfilImagem = "avatar" | "chat" | "laudo" | "produto";

export const PERFIS_IMAGEM: Record<PerfilImagem, { maxPx: number; maxKB: number; titulo: string; uso: string }> = {
  avatar: { maxPx: 512, maxKB: 150, titulo: "Foto de perfil / logo", uso: "Exibida em tamanho pequeno; fica nítida mesmo reduzida." },
  chat: { maxPx: 1600, maxKB: 600, titulo: "Imagem de conversa", uso: "Mesmo padrão do WhatsApp: leitura perfeita de prints e comprovantes." },
  laudo: { maxPx: 1920, maxKB: 900, titulo: "Foto de vistoria / laudo", uso: "Full HD para manter números do painel, placas e detalhes legíveis." },
  produto: { maxPx: 1600, maxKB: 280, titulo: "Imagem de produto", uso: "Leve para catálogos e propostas abrirem rápido." },
};

/** Tipos que não devem ser recomprimidos (animação/vetor). */
const IGNORAR = ["image/gif", "image/svg+xml"];

/** Comprime uma imagem no navegador conforme o perfil; arquivos que não são imagem voltam intactos. */
export async function comprimirImagem(file: File, perfil: PerfilImagem): Promise<File> {
  if (!file.type.startsWith("image/") || IGNORAR.includes(file.type)) return file;
  const p = PERFIS_IMAGEM[perfil];
  const keepPng = perfil === "avatar" && file.type === "image/png";
  const fileType = keepPng ? "image/png" : "image/webp";
  try {
    let out = file;
    let quality = 0.82;
    for (let i = 0; i < 4; i++) {
      out = await imageCompression(file, {
        maxSizeMB: p.maxKB / 1024,
        maxWidthOrHeight: i < 2 ? p.maxPx : Math.round(p.maxPx * 0.75),
        useWebWorker: true,
        fileType,
        initialQuality: quality,
      });
      if (out.size <= p.maxKB * 1024) break;
      quality -= 0.15;
    }
    if (out.size >= file.size && file.size <= p.maxKB * 1024) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([out], `${base}.${keepPng ? "png" : "webp"}`, { type: fileType, lastModified: Date.now() });
  } catch {
    return file;
  }
}
