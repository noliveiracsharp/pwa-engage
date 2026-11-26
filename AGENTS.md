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

- Browser confirm/prompt/alert are forbidden; use `confirmar`/`perguntar`/`avisar` from src/components/layout/DialogoGlobal.tsx (themed, white-label safe).
- Régua de cobrança roda na Edge Function `cobranca-regua` do Supabase do usuário (código em Files); regras puras espelhadas em src/lib/regua-cobranca.ts — mantenha as duas iguais.
- E-mails HTML (cobrança/Ofertas) recebem o banner de upsell via marca `<!--BANNER:contexto:cor-->` trocada no envio pela Edge Function a partir de `email_banners`; site sempre com target=_blank.
- Offer follow-ups reuse the existing external billing mail engine; database jobs own scheduling and unique send claims to prevent duplicate sends.
- Phone verification is shared through PhoneInput and authenticated server functions; unavailable provider responses must never be saved as negative results.
- Mixed billing: each Oferta item may name its own payer (`faturar_para_id`); `titulosDaOferta(orc, itens)` splits receivables per payer and stores `cliente_atendido_id` — always pass the saved items when generating titles.
- Finance receiving, paying and cash tabs share bank summaries using the existing bank engine and company-scoped table cache; unknown balances remain unknown and totals identify incomplete coverage to avoid misleading cash figures.
- Rateio de títulos: linhas em financeiro_titulos_itens geradas por src/lib/rateio.ts (puro, testado) via inserirTitulos({fontes}); o título continua único para bater com banco/conciliação.
- SDR Radar de Leads: descoberta via OpenStreetMap (Nominatim) e enriquecimento por CNPJ (BrasilAPI) em src/lib/sdr-radar.functions.ts; leads ficam em sdr_leads por empresa_id — fontes gratuitas sem chave, trocáveis por Google Places depois.
- Item categories are per-company rows in `itens_categorias` (default cost center, account, fiscal); `useCategoriasItens` falls back to the factory list in src/lib/itens-categorias.ts when a company has none, so new tenants work before onboarding.

- Approval workflows (Ofertas and Cotações) follow the same pattern: per-company config table + immutable vote table; config buttons and strategic data are gated by child Funções (`/<tela>/workflow`, `/orcamentos/estrategico`) so access is managed per perfil.

- i18n: custom dependency-free engine in src/lib/i18n.ts (dictionaries + Intl formatters); add keys to all three dictionaries together — keeps bundle small and SSR-safe.
- Monetary inputs use the shared i18n currency formatter with BRL as the default; locale changes presentation only, never denomination, because stored prices are not converted. Explicit currency overrides must reflect the actual source currency.
- Offer editors initialize after item loading and reconcile saved rows only after awaited persistence succeeds; background cache refreshes must not overwrite drafts, and persisted rows must retain their editor keys to avoid reopening them as new items.

- Company e-mail (SMTP) lives in empresas_email_config/empresas_email_segredos and is edited only in Empresas → E-mail; the cobranca-regua Edge Function resolves it per empresa for every send (including password recovery via action recuperar_senha), so no feature keeps its own SMTP copy.
- E-mail sending channels live in empresas_email_canais (+ secrets table); front passes canal_id via SeletorCanalEmail and the Edge Function falls back finalidade → 'sistema' → empresas_email_config, so tenants without channels keep working.
- Long e-mail texts use TextoRico (HTML); plain-text consumers (WhatsApp) stay Textarea because they cannot render formatting. E-mail HTML is sanitized by mensagemEmailHtml, mirrored in the Edge Function.
- Offer contract sections (geral, A-D) can be overridden per company in contratos_modelos via Documentos → Contrato da Oferta; gerarContratoModular falls back to the built-in text so tenants without the table keep working.
- Sidebar menu is flat (root funcoes only, always clickable); every child funcao is a tab of its root page via SubmenuTabs + SUBMENU_REGISTRY, and reading any tab grants opening the root page — keeps profile setup simple for tenants.
- Condo residents live in public.usuarios (email required) linked via cond_unidades_vinculos; login is created/removed only by cond_liberar_acesso/cond_revogar_acesso RPCs so the profile survives revocation.
- Condo notices send through the module-level queue in src/components/condominios/avisos-fila.ts, which processes 'pendente' rows from the database; new, resend, scheduled and cancellation sends all reuse it so a single path owns delivery and progress.
- Password recovery validates callback evidence and the server-confirmed user before enabling edits; release signout skips the reset page so it cannot destroy a recovery session.
- Unit lease cycle archives (never deletes) the leaving side's vínculos/vehicles via cond_unidade_locacao (arquivado flag); occupancy and vehicle limits ignore archived rows so owners can return with their data intact.
- Condo polls (Enquetes): moradores vote and read results only through SECURITY DEFINER RPCs cond_enquete_* (eligibility mirrored in src/lib/enquetes.ts); secret votes store no user/unit so anonymity holds even for the gestão.
- Interfone points/ramais: extra QR points (cond_interfone_pontos) and ramais reuse the main config's transfer engine via cond_interfone_chamar_v2, so one call path owns ringing, rate limits and LGPD retention.
- Condo assemblies: votes are insert-only via SECURITY DEFINER cond_assembleia_votar (weight, IP, chained SHA-256); SQL only sums, verdicts come from pure src/lib/assembleias.ts so quorum rules live in one tested place.
- Condo maintenance reuses manutencao_* tables tagged with condominio_id (empresa_id = condo); pure rules in src/lib/cond-manutencoes.ts — one maintenance engine for ERP and vertical.
- Condo stock (Estoque & Insumos) lives in cond_estoque_* tables (insert-only Kardex, DB trigger blocks negative balance); OS materials are saida_os rows with os_id so maintenance cost derives from the ledger; pure rules in src/lib/cond-estoque.ts.
- Condo Atendimentos (tickets): cond_atendimentos + cond_atend_mensagens with RLS (gestão via cond_empresas_visiveis, morador only aberto_por/aberto_para); SLA business-hours math, status colors and reputation index live in pure tested src/lib/cond-atendimentos.ts so prazos are computed in one place; mentions are jsonb visible only to gestão to keep complainants anonymous.
- Condo Terceirizados: the provider is a public.empresas row (is_fornecedor); cond_terceirizados_vinculos holds per-condo data and cond_terceirizados_colaboradores belongs to the empresa; writes go through cond_terc_salvar (reuses by CNPJ/CPF, never edits tenant companies) so there is one company record system-wide.
- Web Push: triggers enqueue into push_fila; /api/public/push-enviar (and interfone-whats) drain it via secret-checked RPCs using VAPID_PRIVATE_KEY; public/push-sw.js only handles push/click (no caching) — one queue owns all device notifications.
- Condo regimento/convenção AI reading: PDF → artigos in cond_documentos_artigos (src/lib/cond-documentos-ia.functions.ts); Q&A answers only from stored artigos so replies cite the tenant's own rules.
- Condo space bookings: rules (advance, quotas, weekly hour matrix, holiday/unit blocks, cross-space concurrency) live in pure tested src/lib/cond-reservas.ts; the DB trigger only locks structural hour fields while active bookings exist, so validation has one source.
- Resident portal tabs (/minha-unidade) are shown only when the Morador profile has Ler for the matching /condominios/* funcao (ROTA_SECAO_MORADOR); actions stay capped by permsMorador so Funções can hide modules but never grant management powers.
- Condo management transfers between administradoras go through cond_transferencias + SECURITY DEFINER RPCs (cond_transf_*); approval only re-points parceiros.empresa_id/administradora_id so all cond_* data moves without copying; pure rules in src/lib/cond-transf-gestao.ts.
- Financeiro uses a route-local AuthEscopoFinanceiro keyed by authorized entity, leaving user/profile/global ERP context untouched; strict company filters never retry unscoped. Condo financial IDs reuse existing empresas IDs (no duplicate CNPJ); SQL authorization reads current parceiros ownership so transfer revokes the old manager without moving ledgers. Own-company-only automation and commissions stay unavailable in condo scope until their engines support it.
- Heavy searches/reports read financeiro data through SECURITY DEFINER RPCs scoped by fin_rpc_empresa (SQL in supabase/sql/conectcon-financeiro-procedures-*.sql) via useFinanceiroRpc, querying only on Processar — avoids full-table downloads that time out under RLS.
- Migrated recurrence KPIs use company-scoped monthly receivable aggregates, not synthetic Offers; billing gaps never prove churn and LTV without cancellation history is labeled as an estimate.
- Product/service lists use fn_itens_lista with database filters, ordering and bounded pages; full filtered exports are fetched only on demand, preserving catalog-sharing authorization and table-cache invalidations.
- Projetos tasks load through fn_projetos_tarefas_lista (open + recently concluded + linked task) with direct-read fallback; status-change notices to the task creator come from a DB trigger so every UI path notifies.
- CRM do Cliente (Etapa 1): tabela crm_interacoes + fn_crm_timeline (SQL em supabase/sql/conectcon-crm-cliente.sql); aba CRM na ficha do cliente une interações, ofertas, histórico antigo das ofertas e laudos; o Consultor Comercial IA mora ali (analisarOferta com modo cliente) — o cliente é o centro do relacionamento, não a Oferta.
- CRM Agente (Etapa 2): instâncias com empresas_instancias.agente_crm tratam mensagens de colaboradores no zapi-webhook antes do robô; IA extrai a ação (src/lib/crm-agente.ts, puro/testado) e crm_agente_executar (SQL em supabase/sql/conectcon-crm-agente-whatsapp.sql) grava Lead/interação/visita — o banco valida o remetente pelo token da instância.

- Receipt OCR lives in src/lib/comprovante-ocr.server.ts, shared by the Reembolsos screen and the WhatsApp Agent (crm_agente_reembolso) — one reader, one prompt.
- WhatsApp Agent resolves coworkers via crm_agente_equipe/usuarios before any client lookup; coworkers become reunioes participantes, never empresas rows.
