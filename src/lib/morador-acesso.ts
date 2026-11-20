// Regras do acesso de morador (unidade sem função de gestão): o que vê e o que pode fazer.

export type PermsSecao = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };

const LER: PermsSecao = { canRead: true, canCreate: false, canUpdate: false, canDelete: false };
const ABRIR: PermsSecao = { canRead: true, canCreate: true, canUpdate: false, canDelete: false };

/** Seções do portal do morador; somente Atendimentos permite criar (abrir chamado próprio). */
export const SECOES_MORADOR: Record<string, PermsSecao> = {
  painel: LER, unidade: LER, meu: LER, equipe: LER, obras: LER,
  avisos: LER, assembleias: LER, atendimentos: ABRIR, enquetes: LER, docs: LER, interfone: LER,
};

export const permsMorador = (secao: string): PermsSecao => SECOES_MORADOR[secao] ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

/** Visibilidades de documento por papel: proprietário também vê os restritos a proprietários. */
export const visibilidadesDocumento = (papel: string | null | undefined) =>
  papel === "proprietario" ? ["moradores", "proprietarios"] : ["moradores"];

/** Acesso de unidade só entra na gestão quando o vínculo tem função de gestão — nunca pela permissão global do login. */
export const entraNaGestao = (ehGestorDoVinculo: boolean) => ehGestorDoVinculo;

export const ASSEMBLEIA_ATIVA = ["convocada", "em_andamento", "sessao_permanente"];
export const chamadoAberto = (status: unknown) => String(status ?? "") !== "finalizado";

/** Permissão efetiva do morador na ficha: perfil (teto da plataforma) E switch do condomínio (morador_edita_dados). Excluir dados nunca. */
export const permsFichaMorador = (perfilPodeAlterar: boolean, condominioPermite: unknown) => {
  const pode = perfilPodeAlterar && condominioPermite === true;
  return { canCreate: pode, canUpdate: pode, canDelete: pode };
};
export const SOMENTE_LEITURA = { canCreate: false, canUpdate: false, canDelete: false };

/** Rota da função (tela Funções) que libera cada aba do portal do morador. Painel e Minha unidade são a base do acesso. */
export const ROTA_SECAO_MORADOR: Record<string, string | null> = {
  painel: null, unidade: null,
  meu: "/condominios/meu", interfone: "/condominios/interfone", avisos: "/condominios/avisos",
  assembleias: "/condominios/assembleias", atendimentos: "/condominios/atendimentos", enquetes: "/condominios/enquetes",
  equipe: "/condominios/equipe", obras: "/condominios/obras", docs: "/condominios/documentos",
};

/**
 * Aba visível ao morador: liberada em Funções (Ler) para o perfil dele.
 * Ações continuam limitadas pelo teto do morador (permsMorador) — ativar "Criar" em Funções não dá poder de gestão.
 */
export const secaoMoradorLiberada = (secao: string, perfilPodeLer: (rota: string) => boolean) => {
  if (!(secao in ROTA_SECAO_MORADOR)) return false;
  const rota = ROTA_SECAO_MORADOR[secao];
  return rota === null || perfilPodeLer(rota!);
};
