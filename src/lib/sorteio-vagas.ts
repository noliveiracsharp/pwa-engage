/**
 * Sorteio de vagas auditável: mesma semente + mesmas entradas = mesmo resultado.
 * Ordem: vagas PCD para unidades PCD, vagas Idoso para unidades Idoso, depois sorteio geral.
 * Cada unidade recebe no máximo uma vaga; vagas privativas nunca entram.
 */
export type VagaSorteio = { id: string; pcd?: boolean; idoso?: boolean };
export type ParticipanteSorteio = { unidadeId: string; pcd?: boolean; idoso?: boolean };
export type Criterio = "pcd" | "idoso" | "geral" | "sem_vaga";
export type ResultadoSorteio = { unidadeId: string; vagaId: string | null; criterio: Criterio; ordem: number };

/** Hash 32 bits estável de texto (FNV-1a). */
function hash(txt: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function gerador(semente: string): () => number {
  let a = hash(semente);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(lista: T[], rnd: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function sortearVagas(vagas: VagaSorteio[], participantes: ParticipanteSorteio[], semente: string): ResultadoSorteio[] {
  const rnd = gerador(semente);
  // Ordena entradas antes de embaralhar para que a ordem da tela não mude o resultado.
  const porId = <T,>(k: (x: T) => string) => (x: T, y: T) => k(x).localeCompare(k(y));
  let livres = embaralhar([...vagas].sort(porId((v) => v.id)), rnd);
  const fila = embaralhar([...participantes].sort(porId((p) => p.unidadeId)), rnd);
  const feito = new Map<string, ResultadoSorteio>();
  let ordem = 0;

  const rodada = (criterio: "pcd" | "idoso", quer: (p: ParticipanteSorteio) => boolean, serve: (v: VagaSorteio) => boolean) => {
    for (const p of fila) {
      if (feito.has(p.unidadeId) || !quer(p)) continue;
      const v = livres.find(serve);
      if (!v) return;
      livres = livres.filter((x) => x !== v);
      feito.set(p.unidadeId, { unidadeId: p.unidadeId, vagaId: v.id, criterio, ordem: ++ordem });
    }
  };
  rodada("pcd", (p) => !!p.pcd, (v) => !!v.pcd);
  rodada("idoso", (p) => !!p.idoso, (v) => !!v.idoso);
  for (const p of fila) {
    if (feito.has(p.unidadeId)) continue;
    const v = livres.shift();
    feito.set(p.unidadeId, { unidadeId: p.unidadeId, vagaId: v?.id ?? null, criterio: v ? "geral" : "sem_vaga", ordem: ++ordem });
  }
  return [...feito.values()].sort((a, b) => a.ordem - b.ordem);
}

/** Semente criptográfica legível para a ata. */
export function novaSemente(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Placa brasileira: antiga (ABC1234) ou Mercosul (ABC1D23). Retorna sem hífen ou null. */
export function normalizarPlaca(txt: string): string | null {
  const p = txt.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) ? p : null;
}
