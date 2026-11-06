/** Avisos & Comunicados do condomínio — regras puras (sem React/rede). */

export const TIPOS_AVISO = [
  { value: "geral", label: "Aviso geral" },
  { value: "emergencia", label: "Emergência" },
  { value: "assembleia", label: "Convocação de assembleia" },
  { value: "obras", label: "Obras & manutenção" },
  { value: "financeiro", label: "Financeiro" },
] as const;

export const PUBLICOS_AVISO = [
  { value: "todos", label: "Todos (titulares e família)" },
  { value: "titulares", label: "Só titulares (proprietário, inquilino, preposto)" },
  { value: "proprietarios", label: "Só proprietários" },
  { value: "inquilinos", label: "Só inquilinos" },
] as const;
export type PublicoAviso = (typeof PUBLICOS_AVISO)[number]["value"];
export type CanalAviso = "whatsapp" | "email";

const TITULARES = ["proprietario", "inquilino", "preposto"];
const FAMILIA = ["familiar"];

/** Diz se o papel do vínculo entra no público escolhido. Prestadores e visitantes nunca recebem avisos. */
export function papelNoPublico(papel: string, publico: PublicoAviso): boolean {
  if (publico === "proprietarios") return papel === "proprietario";
  if (publico === "inquilinos") return papel === "inquilino";
  if (publico === "titulares") return TITULARES.includes(papel);
  return TITULARES.includes(papel) || FAMILIA.includes(papel);
}

export type Destinatario = {
  condominio_id: string;
  cond_unidade_id: string;
  unidade: string;
  bloco: string;
  usuario_id: string;
  nome: string;
  email: string | null;
  celular: string | null;
  papel: string;
};

export type EnvioPlanejado = {
  condominio_id: string;
  cond_unidade_id: string;
  usuario_id: string;
  nome: string;
  unidades: string;
  canal: CanalAviso;
  destino: string;
};

const emailOk = (e: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const foneOk = (f: string | null) => (f ?? "").replace(/\D/g, "").length >= 10;

/**
 * Monta a lista final de envios: uma mensagem por pessoa, por canal e por condomínio
 * (quem tem duas unidades no mesmo condomínio recebe uma só, citando as duas).
 */
export function planejarEnvios(dest: Destinatario[], publico: PublicoAviso, canais: CanalAviso[]) {
  const grupos = new Map<string, Destinatario[]>();
  for (const d of dest) {
    if (!papelNoPublico(d.papel, publico)) continue;
    const k = `${d.condominio_id}|${d.usuario_id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const envios: EnvioPlanejado[] = [];
  let semContato = 0;
  for (const lista of grupos.values()) {
    const p = lista[0]!;
    const unidades = [...new Set(lista.map((x) => [x.bloco, x.unidade].filter(Boolean).join(" · ")))].join(", ");
    let algum = false;
    for (const canal of canais) {
      const destino = canal === "email" ? (emailOk(p.email) ? p.email!.trim().toLowerCase() : "") : foneOk(p.celular) ? p.celular!.replace(/\D/g, "") : "";
      if (!destino) continue;
      algum = true;
      envios.push({ condominio_id: p.condominio_id, cond_unidade_id: p.cond_unidade_id, usuario_id: p.usuario_id, nome: p.nome, unidades, canal, destino });
    }
    if (!algum) semContato++;
  }
  return { envios, pessoas: grupos.size, semContato };
}

/** Troca {{nome}}, {{unidade}} e {{condominio}} na mensagem. */
export function preencherAviso(texto: string, v: { nome: string; unidade: string; condominio: string }): string {
  const primeiro = v.nome.trim().split(/\s+/)[0] ?? "";
  return texto.replace(/\{\{\s*(nome|unidade|condominio)\s*\}\}/gi, (_, k: string) => (k.toLowerCase() === "nome" ? primeiro : k.toLowerCase() === "unidade" ? v.unidade : v.condominio));
}

export function validarAviso(a: { titulo: string; mensagemTexto: string; canais: CanalAviso[]; condominios: string[] }): string | null {
  if (!a.condominios.length) return "Escolha pelo menos um condomínio.";
  if (!a.titulo.trim()) return "Informe o título do aviso.";
  if (!a.mensagemTexto.trim()) return "Escreva a mensagem do aviso.";
  if (!a.canais.length) return "Ligue pelo menos um canal (WhatsApp ou e-mail).";
  return null;
}
