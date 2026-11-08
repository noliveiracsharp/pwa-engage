/** Regras puras da Equipe & Corpo Diretivo do condomínio. */
export const CARGOS = [
  { value: "sindico_morador", label: "Síndico morador", grupo: "diretoria" },
  { value: "sindico_profissional", label: "Síndico profissional", grupo: "diretoria" },
  { value: "subsindico", label: "Subsíndico", grupo: "diretoria" },
  { value: "conselheiro", label: "Conselheiro", grupo: "diretoria" },
  { value: "gerente", label: "Gerente predial", grupo: "operacao" },
  { value: "assistente", label: "Assistente administrativo", grupo: "operacao" },
  { value: "zelador", label: "Zelador", grupo: "operacao" },
  { value: "porteiro", label: "Porteiro", grupo: "operacao" },
  { value: "seguranca", label: "Segurança / Vigia", grupo: "operacao" },
  { value: "limpeza", label: "Auxiliar de limpeza", grupo: "operacao" },
  { value: "manutencao", label: "Manutenção", grupo: "operacao" },
  { value: "outro", label: "Outro", grupo: "operacao" },
] as const;

export const VINCULOS = [
  { value: "administradora", label: "Funcionário da administradora" },
  { value: "facilities", label: "Funcionário da facilities / portaria" },
  { value: "morador", label: "Morador do condomínio" },
  { value: "proprio", label: "Contratado pelo condomínio" },
  { value: "terceiro", label: "Outro terceiro" },
];

export const rotuloCargo = (v: string) => CARGOS.find((c) => c.value === v)?.label ?? v;
export const ehDiretoria = (cargo: string) => CARGOS.some((c) => c.value === cargo && c.grupo === "diretoria");

/** Síndico morador precisa de unidade; quem vem de empresa terceira precisa da empresa. */
export function validarMembro(m: { nome?: string; cargo?: string; vinculo?: string; cond_unidade_id?: string; empresa_id?: string; inicio?: string; fim?: string }): string | null {
  if (!m.nome?.trim()) return "Informe o nome.";
  if (!m.cargo) return "Informe o cargo.";
  if ((m.cargo === "sindico_morador" || m.vinculo === "morador") && !m.cond_unidade_id) return "Informe a unidade do morador.";
  if (m.vinculo === "terceiro" && !m.empresa_id) return "Informe a empresa do terceiro.";
  if (m.inicio && m.fim && m.fim < m.inicio) return "O fim do mandato/contrato não pode ser antes do início.";
  return null;
}

/** Vínculo sugerido ao escolher o cargo. */
export function vinculoPadrao(cargo: string): string {
  if (cargo === "sindico_morador" || cargo === "subsindico" || cargo === "conselheiro") return "morador";
  if (cargo === "porteiro" || cargo === "seguranca") return "facilities";
  if (cargo === "sindico_profissional") return "terceiro";
  return "proprio";
}

/** Funções diretivas definidas no cadastro da pessoa na unidade → rótulo exibido em Equipe & Diretoria. */
export const FUNCOES_DIRETIVAS_UNIDADE: Record<string, { label: string; ordem: number }> = {
  sindico: { label: "Síndico morador", ordem: 0 },
  subsindico: { label: "Subsíndico", ordem: 2 },
  conselheiro_consultivo: { label: "Conselheiro consultivo", ordem: 3 },
  conselheiro_fiscal: { label: "Conselheiro fiscal", ordem: 3 },
};
export const ehFuncaoDiretiva = (f: string) => f in FUNCOES_DIRETIVAS_UNIDADE;

/** Mandato vigente na data (ISO yyyy-mm-dd). */
export function vigente(m: { status?: boolean; inicio?: string | null; fim?: string | null }, hoje: string): boolean {
  if (m.status === false) return false;
  if (m.inicio && m.inicio > hoje) return false;
  if (m.fim && m.fim < hoje) return false;
  return true;
}
