/**
 * Regras puras do Interfone Virtual (espelhadas nas funções cond_interfone_* do SQL).
 * Transbordo cumulativo: a cada `toqueSeg` segundos a chamada passa a tocar também
 * para a próxima etapa que tenha alguém; etapas vazias são puladas.
 */
export type Destinatario = { usuarioId: string; papel: string; idade: number | null; interfone: boolean | null };
export type ConfigInterfone = { toqueSeg: number; menoresRecebem: boolean; centralAtiva: boolean };
export const CENTRAL = "central";

const TITULARES = ["proprietario", "inquilino"];
const FAMILIA = ["familiar", "preposto"];

/** Monta as etapas (listas de usuários) na ordem: titulares → demais moradores → prestadores → central. */
export function montarEtapas(pessoas: Destinatario[], cfg: ConfigInterfone): string[][] {
  const recebe = (p: Destinatario) => p.interfone !== false;
  const maior = (p: Destinatario) => cfg.menoresRecebem || p.idade === null || p.idade >= 18;
  const e1 = pessoas.filter((p) => TITULARES.includes(p.papel) && recebe(p) && maior(p)).map((p) => p.usuarioId);
  const e2 = pessoas.filter((p) => FAMILIA.includes(p.papel) && recebe(p) && maior(p)).map((p) => p.usuarioId);
  const e3 = pessoas.filter((p) => p.papel === "prestador" && p.interfone === true).map((p) => p.usuarioId);
  const etapas = [e1, e2, e3].map((l) => [...new Set(l)]).filter((l) => l.length > 0);
  if (cfg.centralAtiva) etapas.push([CENTRAL]);
  return etapas;
}

/** Índice da etapa atual, ou -1 quando o tempo total acabou sem atendimento. */
export function etapaAtual(segundos: number, toqueSeg: number, totalEtapas: number): number {
  if (totalEtapas <= 0) return -1;
  const i = Math.floor(Math.max(0, segundos) / Math.max(5, toqueSeg));
  return i < totalEtapas ? i : -1;
}

/** Quem está sendo chamado agora (cumulativo até a etapa atual). */
export function tocandoPara(etapas: string[][], indice: number): string[] {
  if (indice < 0) return [];
  return [...new Set(etapas.slice(0, indice + 1).flat())];
}

/** Aceita "102", "B-102", "b 102" ou "B102" e devolve bloco (opcional) e número. */
export function lerDiscagem(txt: string): { bloco: string; numero: string } | null {
  const m = txt.trim().toUpperCase().match(/^([A-Z]+)?[\s-]*(\d{1,5}[A-Z]?)$/);
  return m ? { bloco: m[1] ?? "", numero: m[2]! } : null;
}
