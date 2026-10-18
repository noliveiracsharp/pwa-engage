<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Dismissed notifications are tombstoned by event key in the local store so polling cannot recreate them.
- Cost center tree: `buildTree` + `DataTable` ID expansion in `ApoioCrud`.
- Ofertas: all math is pure in src/lib/orcamentos.ts and computed values are stored in `orcamentos`/`orcamento_itens`; reports read stored values.
- Ofertas save (header + line sync) lives in src/hooks/useSaveOrcamento.ts; `#ano-seq` comes from DB trigger, client numbering is only a fallback.
- Item price changes re-price Ofertas via pure src/lib/reajuste-itens.ts; approved/won/Ativação Ofertas only change cost, never sale price.
- Long lists use `SearchSelect`; states use `success`/`warning` tokens, never fixed colors.
- Laudos/Cotações helpers in src/lib/laudos.ts; approving a cotação creates the Oferta through `useSaveOrcamento`.
- Every manual atendimento stage change goes through `useChecklistGate` before CSAT.
- Menu is built from `funcoes_pai_id`: visible children are sidebar submenus, hidden children are page tabs rendered only by SubmenuTabs (src/lib/submenu-registry.tsx).
- Projects: Projeto → Tarefa → Atividade → Checklist; task progress is stored by `sincronizarTarefa` (src/lib/projetos.ts).
- Commissions: pure math in src/lib/comissoes.ts, configurable roles per company, snapshots in `orcamento_comissoes`.
- Sheet widths are centralized via data-panel-side in global CSS; Kanban colors are semantic keys resolved by kanban-cores.ts.
- Fluxos: React Flow graph as jsonb; pure engine src/lib/fluxos-motor.ts pauses on external steps (Sval, AI Gateway); Z-API webhook writes via company-scoped SECURITY DEFINER RPCs.
- Image compression only through `comprimirImagem` (src/lib/image-compress.ts) with `UploadInfo`.
- DRE de Ofertas: pure src/lib/dre-ofertas.ts over stored values.
- Finance: single `financeiro_titulos` table (origem_tipo/origem_id), pure src/lib/financeiro.ts, `inserirTitulos`; Pix BR Code generated locally (no mTLS on server).
- Maintenance: `manutencao_*` tables, pure src/lib/manutencoes.ts, single `ManutencaoSheet`; public links only via SECURITY DEFINER RPCs.
- Reimbursements: pure src/lib/reembolsos.ts; approval creates a finance title.
- LGPD audit: DB triggers write immutable `auditoria_logs`; UI only reads.
- Documents: templates in `documento_modelos` with {{key}} vars, issued in `documentos` (entidade_tipo/entidade_id), helpers in src/lib/documentos.ts, `DocumentosButton` in record forms.
