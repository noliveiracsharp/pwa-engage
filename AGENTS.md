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
