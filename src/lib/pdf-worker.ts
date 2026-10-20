// Carrega o worker do pdfjs via Blob com MIME correto: alguns servidores
// entregam .mjs como text/plain e o navegador recusa o módulo.
let cache: Promise<string> | null = null;

export async function prepararPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!cache) {
    cache = (async () => {
      const local = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      const fontes = [local, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`];
      for (const url of fontes) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const code = await r.text();
          return URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
        } catch {
          /* tenta a próxima */
        }
      }
      cache = null;
      throw new Error("Não foi possível carregar o leitor de PDF.");
    })();
  }
  pdfjs.GlobalWorkerOptions.workerSrc = await cache;
  return pdfjs;
}
