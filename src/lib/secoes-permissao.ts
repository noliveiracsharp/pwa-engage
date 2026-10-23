export type SecaoPerms = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };
export type SecaoBase = { key: string; kind: string; label: string };

/**
 * Permissão de cada seção interna de um formulário.
 * - Seção cadastrada em /funcoes (filha da tela): usa a permissão própria; sem "Ler" fica oculta.
 * - Seção não cadastrada: herda a permissão da tela pai.
 */
export function secoesComPermissao(
  base: SecaoBase[],
  pai: SecaoPerms,
  definidas: Set<string>,
  liberadas: Array<SecaoPerms & { kind: string; label?: string }>,
): Array<SecaoBase & { perms: SecaoPerms }> {
  const out: Array<SecaoBase & { perms: SecaoPerms }> = [];
  for (const s of base) {
    if (!definidas.has(s.kind)) {
      out.push({ ...s, perms: pai });
      continue;
    }
    const p = liberadas.find((l) => l.kind === s.kind);
    if (p?.canRead) out.push({ ...s, label: p.label || s.label, perms: p });
    else if (s.kind === "dados") out.push({ ...s, perms: { canRead: true, canCreate: false, canUpdate: false, canDelete: false } });
  }
  return out;
}
