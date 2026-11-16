/** Regras puras do módulo Terceirizados (prestadores PJ/PF e seus colaboradores). */
/** Prestador = linha de `empresas` (id) + vínculo com o condomínio. */
export type Terceirizado = { id: string; nome: string; titulo?: string | null; tipo_pessoa: string | null; is_tenant?: boolean; telefone_contato?: string | null; documento: string | null; atividade: string | null; contato: string | null; telefone: string | null; email: string | null; observacoes: string | null; vinculo_id: string; vinculo_ativo: boolean; obs_acesso: string | null; colaboradores: number };
export type Colaborador = { id: string; empresa_id: string; nome: string; funcao: string | null; rg: string | null; cpf: string | null; celular: string | null; foto_url: string | null; ativo: boolean; observacoes: string | null };

export const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return String(doc ?? "");
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Busca única por texto: nome, atividade, contato, documento ou telefone. */
export function filtrarTerceirizados(lista: Terceirizado[], busca: string, ativos: boolean): Terceirizado[] {
  const q = norm(busca.trim()); const qd = soDigitos(busca);
  return lista
    .filter((t) => t.vinculo_ativo === ativos)
    .filter((t) => !q || norm([t.nome, t.titulo, t.atividade, t.contato].join(" ")).includes(q) || (qd.length >= 3 && (soDigitos(t.documento).includes(qd) || soDigitos(t.telefone).includes(qd) || soDigitos(t.telefone_contato).includes(qd))))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Consulta da portaria: localiza colaboradores por nome ou CPF/RG. */
export function buscarColaborador(lista: Colaborador[], busca: string): Colaborador[] {
  const q = norm(busca.trim()); const qd = soDigitos(busca);
  if (!q) return [];
  return lista.filter((c) => norm(c.nome).includes(q) || (qd.length >= 3 && (soDigitos(c.cpf).includes(qd) || soDigitos(c.rg).includes(qd))))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Liberação na portaria: só entra se a empresa está ativa no condomínio E o colaborador está ativo. */
export function liberacaoAcesso(empresaAtiva: boolean, colaboradorAtivo: boolean): { liberado: boolean; motivo: string } {
  if (!empresaAtiva) return { liberado: false, motivo: "Empresa inativa neste condomínio" };
  if (!colaboradorAtivo) return { liberado: false, motivo: "Colaborador inativo" };
  return { liberado: true, motivo: "Acesso liberado" };
}
