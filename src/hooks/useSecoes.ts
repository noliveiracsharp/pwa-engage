import { useMemo } from "react";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useTableRows, rowId } from "@/lib/crud";
import { pick } from "@/lib/row";
import { secoesComPermissao, type SecaoPerms } from "@/lib/secoes-permissao";

/**
 * Permissão de cada seção interna (aba) de uma tela, identificada pelo caminho
 * `${pagePath}/${key}` cadastrado em Funções como filha da tela (menu_ativo = false).
 * Seção não cadastrada herda a permissão da tela; sem "Ler" fica oculta.
 */
export function useSecoes(pagePath: string, base: Array<{ key: string; label: string }>) {
  const perms = usePagePermissions(pagePath);
  const { data: funcoes = [] } = useTableRows("funcoes");
  const chave = base.map((b) => b.key).join(",");
  return useMemo(() => {
    const doPath = funcoes.filter((x) => String(pick(x, ["path"]) ?? "") === pagePath);
    const pai = doPath.find((x) => !pick(x, ["funcoes_pai_id"])) ?? doPath[0];
    const paiId = pai ? String(rowId(pai) ?? "") : "";
    const keyDe = new Map<string, string>();
    for (const x of funcoes) {
      if (!paiId || String(pick(x, ["funcoes_pai_id"]) ?? "") !== paiId || x["status"] === false) continue;
      const p = String(pick(x, ["path"]) ?? "");
      if (p.startsWith(`${pagePath}/`)) keyDe.set(String(rowId(x) ?? ""), p.slice(pagePath.length + 1));
    }
    const definidas = new Set(keyDe.values());
    const liberadas = perms.subtabs
      .filter((t) => keyDe.has(t.id))
      .map((t) => ({ ...t, kind: keyDe.get(t.id)!, label: t.descricao }));
    const pai2: SecaoPerms = { canRead: perms.canRead, canCreate: perms.canCreate, canUpdate: perms.canUpdate, canDelete: perms.canDelete };
    const lista = secoesComPermissao(base.map((b) => ({ ...b, kind: b.key })), pai2, definidas, liberadas);
    const mapa: Record<string, SecaoPerms | undefined> = {};
    for (const s of lista) mapa[s.key] = s.perms;
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcoes, perms, pagePath, chave]);
}
