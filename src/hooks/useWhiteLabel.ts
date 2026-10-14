import { useEffect } from "react";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";

const HEX = /^#([0-9a-f]{6})$/i;

/** Texto legível sobre a cor: escuro em cores claras, claro em cores escuras. */
function contraste(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? "oklch(0.15 0.03 255)" : "oklch(0.99 0.005 247)";
}

function bloco(seletor: string, cor: string) {
  if (!HEX.test(cor)) return "";
  const fg = contraste(cor);
  return `${seletor}{--primary:${cor};--primary-foreground:${fg};--ring:${cor};--sidebar-primary:${cor};--sidebar-primary-foreground:${fg};}`;
}

/** Aplica cores, favicon e título da empresa ativa à interface. */
export function useWhiteLabel() {
  const { claro, escuro, favicon, logo, titulo } = useEmpresaAtiva();

  useEffect(() => {
    const id = "white-label-cores";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    const css = bloco(":root", claro ?? "") + bloco(".dark", escuro || claro || "");
    if (!css) { el?.remove(); return; }
    if (!el) { el = document.createElement("style"); el.id = id; document.head.appendChild(el); }
    el.textContent = css;
  }, [claro, escuro]);

  useEffect(() => {
    const href = favicon || logo;
    if (!href) return;
    const links = document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']");
    const anteriores = Array.from(links).map((l) => [l, l.href] as const);
    if (links.length === 0) {
      const l = document.createElement("link"); l.rel = "icon"; document.head.appendChild(l);
      l.href = href;
      return () => l.remove();
    }
    links.forEach((l) => { l.href = href; });
    return () => anteriores.forEach(([l, h]) => { l.href = h; });
  }, [favicon, logo]);

  useEffect(() => {
    if (titulo && !document.title.includes(titulo)) document.title = titulo;
  }, [titulo]);
}
