// Placa do interfone para acrílico A6 (10 × 15 cm) desenhada em canvas a 300 DPI.
// Uma única arte serve para Baixar (PNG) e Imprimir, garantindo o mesmo visual.
const W = 1181, H = 1772;

function corPrimaria(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return v && CSS.supports("color", v) ? v : "#0f766e";
}
function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });
}
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}
function ajustar(c: CanvasRenderingContext2D, t: string, max: number, tam: number, peso = 800): number {
  let s = tam; c.font = `${peso} ${s}px system-ui, sans-serif`;
  while (c.measureText(t).width > max && s > 30) { s -= 2; c.font = `${peso} ${s}px system-ui, sans-serif`; }
  return s;
}

export async function gerarPlacaInterfone(nome: string, qrDataUrl: string): Promise<string> {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  const cor = corPrimaria();
  c.textAlign = "center"; c.textBaseline = "middle";

  // Fundo e faixa superior
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
  c.fillStyle = cor; c.fillRect(0, 0, W, 430);

  c.fillStyle = "rgba(255,255,255,0.85)";
  c.font = "700 40px system-ui, sans-serif";
  c.fillText("INTERFONE DIGITAL  •  VÍDEO E VOZ", W / 2, 120);
  c.fillStyle = "#ffffff";
  ajustar(c, nome.toUpperCase(), W - 160, 84);
  c.fillText(nome.toUpperCase(), W / 2, 230);
  c.font = "500 44px system-ui, sans-serif";
  c.fillText("Aponte a câmera do celular", W / 2, 340);

  // Cartão do QR com cantos-guia
  const q = 700, qx = (W - q) / 2, qy = 500;
  c.shadowColor = "rgba(0,0,0,0.18)"; c.shadowBlur = 40; c.shadowOffsetY = 12;
  c.fillStyle = "#ffffff"; rr(c, qx - 50, qy - 50, q + 100, q + 100, 48); c.fill();
  c.shadowColor = "transparent";
  c.drawImage(await carregar(qrDataUrl), qx, qy, q, q);
  c.strokeStyle = cor; c.lineWidth = 14; c.lineCap = "round";
  const L = 80, o = qx - 30, p = qy - 30, e = q + 60;
  for (const [x, y, dx, dy] of [[o, p, 1, 1], [o + e, p, -1, 1], [o, p + e, 1, -1], [o + e, p + e, -1, -1]] as const) {
    c.beginPath(); c.moveTo(x + dx * L, y); c.lineTo(x, y); c.lineTo(x, y + dy * L); c.stroke();
  }

  // 3 passos
  const passos: [string, string][] = [["Escaneie", "com a câmera"], ["Escolha", "unidade ou portaria"], ["Fale", "por vídeo ou voz"]];
  const py = 1390, col = W / 3;
  passos.forEach(([t, d], i) => {
    const cx = col * i + col / 2;
    c.fillStyle = cor; c.beginPath(); c.arc(cx, py, 46, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffffff"; c.font = "800 48px system-ui, sans-serif"; c.fillText(String(i + 1), cx, py + 2);
    c.fillStyle = "#111827"; c.font = "700 42px system-ui, sans-serif"; c.fillText(t, cx, py + 90);
    c.fillStyle = "#4b5563"; c.font = "400 30px system-ui, sans-serif"; c.fillText(d, cx, py + 135);
  });

  // Rodapé de confiança
  c.fillStyle = "#f3f4f6"; c.fillRect(0, H - 150, W, 150);
  c.fillStyle = "#374151"; c.font = "500 30px system-ui, sans-serif";
  c.fillText("Sem aplicativo  •  Nenhum dado de morador é exibido", W / 2, H - 95);
  c.fillStyle = "#6b7280"; c.font = "400 26px system-ui, sans-serif";
  c.fillText("Uso exclusivo na entrada do condomínio", W / 2, H - 50);

  return cv.toDataURL("image/png");
}

// Folha A4 (300 DPI) com 4 placas em grade 2×2 e linhas tracejadas de corte — igual à impressão.
export async function gerarFolhaA4Placas(placaPng: string): Promise<string> {
  const FW = 2480, FH = 3508, cw = FW / 2, ch = FH / 2;
  const pw = Math.round((95 / 210) * FW), ph = Math.round((142.5 / 297) * FH);
  const cv = document.createElement("canvas"); cv.width = FW; cv.height = FH;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, FW, FH);
  const img = await carregar(placaPng);
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * cw + (cw - pw) / 2, y = Math.floor(i / 2) * ch + (ch - ph) / 2;
    c.drawImage(img, x, y, pw, ph);
  }
  c.strokeStyle = "#999999"; c.lineWidth = 4; c.setLineDash([24, 18]);
  c.beginPath(); c.moveTo(cw, 0); c.lineTo(cw, FH); c.moveTo(0, ch); c.lineTo(FW, ch); c.stroke();
  c.setLineDash([]); c.fillStyle = "#999999"; c.font = "400 28px system-ui, sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
  c.fillText("✂ recorte nas linhas tracejadas", cw + 24, 24);
  return cv.toDataURL("image/png");
}

/** Imprime uma folha A4 com 4 placas (95×142,5 mm) e linhas de corte, sem abrir popup. */
export function imprimirFolhaPlacas(png: string): void {
  const w = document.createElement("iframe");
  w.style.position = "fixed"; w.style.width = "0"; w.style.height = "0"; w.style.border = "0";
  document.body.appendChild(w);
  const d = w.contentDocument!;
  d.open();
  const cel = `<div class="c"><img src="${png}"/></div>`;
  d.write(`<html><head><title>Interfone</title><style>@page{size:A4;margin:0}html,body{margin:0}
.f{width:210mm;height:297mm;display:grid;grid-template-columns:105mm 105mm;grid-template-rows:148.5mm 148.5mm;position:relative}
.c{display:flex;align-items:center;justify-content:center}.c img{width:95mm;height:142.5mm;display:block}
.v{position:absolute;left:105mm;top:0;bottom:0;border-left:0.3mm dashed #999}.h{position:absolute;top:148.5mm;left:0;right:0;border-top:0.3mm dashed #999}
.t{position:absolute;font:7pt sans-serif;color:#999;left:107mm;top:2mm}</style></head><body><div class="f">${cel}${cel}${cel}${cel}<div class="v"></div><div class="h"></div><span class="t">✂ recorte nas linhas tracejadas</span></div></body></html>`);
  d.close();
  const img = d.querySelector("img")!;
  const go = () => { w.contentWindow?.print(); setTimeout(() => w.remove(), 1000); };
  if (img.complete) setTimeout(go, 100); else img.onload = go;
}
