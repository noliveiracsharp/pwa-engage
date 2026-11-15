/** Regras puras de Manutenções & Patrimônio do condomínio (reaproveita o motor de src/lib/manutencoes.ts). */

export const STATUS_PATRIMONIO = [
  { value: "ativo", label: "Ativo", cls: "bg-success/15 text-success" },
  { value: "em_manutencao", label: "Em manutenção", cls: "bg-warning/15 text-warning" },
  { value: "inativo", label: "Inativo", cls: "bg-muted text-muted-foreground" },
  { value: "baixado", label: "Baixado", cls: "bg-destructive/15 text-destructive" },
];

export type SituacaoPlano = "no_prazo" | "proximo" | "vencido";
export const SITUACAO_PLANO: Record<SituacaoPlano, { label: string; cls: string }> = {
  no_prazo: { label: "No prazo", cls: "bg-success/15 text-success" },
  proximo: { label: "Vence em breve", cls: "bg-warning/15 text-warning" },
  vencido: { label: "Vencido", cls: "bg-destructive/15 text-destructive" },
};

/** Vencido = data passou; próximo = vence em até 15 dias; senão no prazo. */
export function situacaoPlano(proximaData: string, hojeIso: string, janelaDias = 15): SituacaoPlano {
  const d = proximaData.slice(0, 10), h = hojeIso.slice(0, 10);
  if (d < h) return "vencido";
  const lim = new Date(`${h}T00:00:00Z`);
  lim.setUTCDate(lim.getUTCDate() + janelaDias);
  return d <= lim.toISOString().slice(0, 10) ? "proximo" : "no_prazo";
}

/** Cargos avisados quando uma manutenção é concluída ou tem não conformidade. */
export const CARGOS_AVISADOS = ["sindico_morador", "sindico_profissional", "subsindico", "gerente"];

type Membro = { nome?: unknown; cargo?: unknown; celular?: unknown; fim?: unknown };
/** Responsáveis com celular e mandato vigente, sem telefones repetidos. */
export function destinatariosAviso(equipe: Membro[], hojeIso: string) {
  const vistos = new Set<string>();
  const out: { nome: string; celular: string }[] = [];
  for (const m of equipe) {
    const cel = String(m.celular ?? "").replace(/\D/g, "");
    const fim = String(m.fim ?? "").slice(0, 10);
    if (!CARGOS_AVISADOS.includes(String(m.cargo ?? "")) || cel.length < 10 || (fim && fim < hojeIso.slice(0, 10)) || vistos.has(cel)) continue;
    vistos.add(cel);
    out.push({ nome: String(m.nome ?? ""), celular: cel });
  }
  return out;
}

/** Texto do aviso aos responsáveis. */
export function mensagemResponsaveis(d: { condominio: string; numero: string; tipo: string; titulo: string; quando: string; total: number; naoConformes: number; link: string }) {
  return [
    `🔧 *${d.condominio}*`,
    `Manutenção ${d.tipo} *${d.numero}* concluída: ${d.titulo}`,
    `Concluída em ${d.quando}.`,
    d.total ? (d.naoConformes ? `⚠️ ${d.naoConformes} de ${d.total} itens NÃO conformes — requer providência.` : `✅ Todos os ${d.total} itens conformes.`) : "",
    `Relatório com fotos: ${d.link}`,
  ].filter(Boolean).join("\n");
}
