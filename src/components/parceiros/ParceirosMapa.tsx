import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Row } from "@/lib/row";
import { categoriaPin, coordenadas, type CategoriaPin } from "@/lib/parceiros-mapa";
import { formatPhoneDisplay } from "@/lib/input-masks";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function ParceirosMapa({ rows, onAbrir }: { rows: Row[]; onAbrir: (r: Row) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<import("leaflet").Map | null>(null);
  const camada = useRef<import("leaflet").LayerGroup | null>(null);
  const abrirRef = useRef(onAbrir);
  abrirRef.current = onAbrir;

  useEffect(() => {
    let vivo = true;
    void import("leaflet").then((L) => {
      if (!vivo || !el.current || mapa.current) return;
      const m = L.map(el.current, { center: [-15.78, -47.93], zoom: 4 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
      mapa.current = m;
      camada.current = L.layerGroup().addTo(m);
      desenhar(L);
    });
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desenhar = (L: typeof import("leaflet")) => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const pontos: [number, number][] = [];
    for (const r of rows) {
      const c = coordenadas(r);
      if (!c) continue;
      pontos.push(c);
      const cat: CategoriaPin = categoriaPin(r);
      const end = [r["endereco"], r["numero"], r["bairro"], r["cidade"], r["uf"]].filter(Boolean).join(", ");
      const tel = r["telefone"] ? formatPhoneDisplay(String(r["telefone"])) : "";
      const destino = `${c[0]},${c[1]}`;
      const div = document.createElement("div");
      div.innerHTML = `<div style="min-width:200px"><strong>${esc(r["razao_social"] || r["nome_fantasia"])}</strong>
        ${end ? `<div style="margin-top:4px">${esc(end)}</div>` : ""}${tel ? `<div>${esc(tel)}</div>` : ""}
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="#" data-abrir>Ver cadastro</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${destino}" target="_blank" rel="noopener">Google Maps</a>
          <a href="https://waze.com/ul?ll=${destino}&navigate=yes" target="_blank" rel="noopener">Waze</a>
        </div></div>`;
      div.querySelector("[data-abrir]")?.addEventListener("click", (e) => { e.preventDefault(); abrirRef.current(r); });
      L.circleMarker(c, { radius: 8, weight: 2, fillOpacity: 0.9, className: `pin-${cat}` }).bindPopup(div).addTo(g);
    }
    if (pontos.length) m.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 14 });
  };

  useEffect(() => { void import("leaflet").then((L) => desenhar(L)); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="h-[calc(100vh-16rem)] min-h-[420px] w-full overflow-hidden rounded-lg border" />;
}
