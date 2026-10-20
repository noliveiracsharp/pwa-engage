/** Geocodificação por endereço/CEP (OpenStreetMap Nominatim, sem chave). */
export type Coordenadas = { latitude: number; longitude: number };

async function nominatim(params: Record<string, string>): Promise<Coordenadas | null> {
  const qs = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br", ...params });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${qs}`, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const d = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!d[0]) return null;
  return { latitude: Number(Number(d[0].lat).toFixed(7)), longitude: Number(Number(d[0].lon).toFixed(7)) };
}

/** Tenta do mais preciso (rua + número) ao menos preciso (CEP, cidade). */
export async function geocodificar(e: {
  endereco?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; livre?: string;
}): Promise<Coordenadas | null> {
  const cep = (e.cep ?? "").replace(/\D/g, "");
  const tentativas: Record<string, string>[] = [];
  if (e.endereco && e.cidade) tentativas.push({ street: [e.numero, e.endereco].filter(Boolean).join(" "), city: e.cidade, state: e.uf ?? "" });
  if (e.livre) tentativas.push({ q: e.livre });
  if (cep.length === 8) tentativas.push({ postalcode: `${cep.slice(0, 5)}-${cep.slice(5)}` });
  if (e.cidade) tentativas.push({ city: e.cidade, state: e.uf ?? "" });
  for (const t of tentativas) {
    try { const r = await nominatim(t); if (r) return r; } catch { /* tenta a próxima */ }
  }
  return null;
}

export function gpsNavegador(): Promise<Coordenadas | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: Number(p.coords.latitude.toFixed(7)), longitude: Number(p.coords.longitude.toFixed(7)) }),
      () => resolve(null), { timeout: 10000 },
    );
  });
}

export const coordNum = (v: string): number | null => {
  const n = Number(String(v).replace(",", ".").trim());
  return v.trim() === "" || isNaN(n) ? null : n;
};
