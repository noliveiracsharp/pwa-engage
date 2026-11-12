import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** Mapa com pin do condomínio (carregado só no navegador). */
export default function MapaCondominio({ lat, lng, nome }: { lat: number; lng: number; nome: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let m: import("leaflet").Map | null = null;
    let vivo = true;
    void import("leaflet").then((L) => {
      if (!vivo || !el.current) return;
      m = L.map(el.current, { center: [lat, lng], zoom: 17, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(m);
      const icone = L.divIcon({
        className: "",
        html: `<svg width="36" height="48" viewBox="0 0 24 32" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" style="fill:var(--primary);stroke:var(--background);stroke-width:1.5"/><circle cx="12" cy="12" r="4.5" style="fill:var(--background)"/></svg>`,
        iconSize: [36, 48], iconAnchor: [18, 48], popupAnchor: [0, -44],
      });
      const t = document.createElement("strong"); t.textContent = nome;
      L.marker([lat, lng], { icon: icone, title: nome, alt: nome }).bindPopup(t).addTo(m);
    });
    return () => { vivo = false; m?.remove(); };
  }, [lat, lng, nome]);
  return <div ref={el} role="region" aria-label={`Mapa com a localização de ${nome}`} className="relative isolate z-0 h-72 w-full overflow-hidden rounded-lg border md:h-full md:min-h-80" />;
}
