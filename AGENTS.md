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

## Project rules
- Team accounts are created by admins via server functions using the admin client (no public signup after the first user); the first registered user becomes admin via DB trigger — keeps the system internal.
- Roles live in `public.user_roles` checked with `has_role()`; never on profiles — prevents privilege escalation.
- Client onboarding timestamps (`contract_signed_at`, `onboarding_completed_at`) are set by the `clients_track` DB trigger — single source of truth for the timer.
- Status/commission rules live in `src/lib/crm.ts` with tests in `crm.test.ts`.
- The public contract webhook is diagnostic-only until sender verification is configured; never persist unverified payloads or update clients, to prevent forged signatures and exposed personal data.
- Client diagnostic answers use nullable booleans and a shared validation schema; unanswered is distinct from No and general notes are separate from commercial notes.
- Onboarding release requires payment and server-managed signature verification; a database trigger enforces prerequisites and timestamps independently of the UI.
- Every client field is declared once in `src/lib/client-form.ts` (validation schema, form state, save payload, missing-field list) and reused by the new-client form and the client sheet — add fields there, not per screen.
- Onboarding models are versioned: only `rascunho` models are editable (DB triggers block edits to published/archived models and their phases/steps/checklist); change a published model via `duplicar_modelo` → edit → `publicar_modelo`, which archives the previous version — running onboardings keep the copy they started with.
- DocuSign envelopes arrive only through `/api/public/docusign` with a valid Connect HMAC (`DOCUSIGN_CONNECT_HMAC_KEY`, comma-separated for rotation; unset = reject all). Linking (auto in the `docusign_auto_vincular` trigger, manual via admin server functions) is the only path that marks a contract verified from DocuSign; users never write `docusign_envelopes` directly.
- Sales arrive only through `/api/public/vendas`, open by business decision (if `VENDAS_WEBHOOK_TOKEN` is set, Bearer/X-Webhook-Token becomes required) into `vendas_recebidas` as `pendente`; they become clients only when a reviewer (admin/vendedor) approves via the prefilled Novo contrato form or links an existing client. Received data is immutable (trigger); content hash dedupes resends.
- Which onboardings a sold product starts lives in `produto_onboardings` (admin-managed on /vinculos; a product can start several). Release (`clients_inicia_onboarding`) and `iniciar_onboardings_pendentes` both expand links via `onboardings_previstos`; the "Enviar para onboarding" dialog (`src/components/app/enviar-onboarding.tsx`, plan logic in `src/lib/plano-onboarding.ts`) is the single entry point from the commercial side.
- Retention cases come only from the gestão API (`src/lib/retencao-api.ts`, key in `RETENCAO_API_CHAVE`, never in code) via the Netlify scheduled function `netlify/functions/retencao-sync.mts` (11h/17h UTC) or the "Sincronizar agora" server function; cases take the API status (Pendente/Não Iniciado/Em Andamento, Finalizado C/D/X → finalizado/downgrade/revertido); on later syncs the local status is only overwritten when the API status changes (`status_api`). The 48h first-contact clock starts at `data_preenchimento`; the first gestão note (`anotacoes`) counts as first contact. CS work (status, tags, contacts) is in `retencao_casos`/`retencao_atividades`; deadlines (48h first contact, 5 business days in progress) are computed in `retencao_casos_situacao` and `src/lib/retencao.ts`.
- Retention product counting rules live in `servicosParaContagem` (`src/lib/retencao.ts`): Black is a package (any "black" product collapses the whole request to one "Black"), Facebook counts as Redes, Discador only counts when it is the only service (it is a bonus of every product). Raw services stay in `servicos_api` and are shown in the case panel.

## Base total de clientes e churn da carteira

- API: POST `cliente/listarServicosExterno` com `{ chave }` (mesma chave da retenção, `RETENCAO_API_CHAVE`; `CLIENTES_API_CHAVE` sobrescreve). Traz só a foto de hoje: `id_cliente`, `nome`, `contexto` (carteira), `sucessodonto`, `produtos` (nomes). Sem datas nem valores.
- Coleta diária às 07h BRT (`netlify/functions/clientes-base-sync.mts`) e botão "Atualizar base" no dash. Tudo é gravado pela função `sincronizar_clientes_base` (migração 0017): `clientes_base` (estado atual), `clientes_base_fotos` (foto diária dos ativos), `clientes_base_eventos` (produto que entrou/saiu, a partir da 2ª coleta). Coleta com bem menos ativos que a anterior (<70%) é recusada.
- `id_cliente` da base = `id_appcrc` da retenção.
- Churn da carteira = cancelamentos da retenção no período ÷ base ativa no início. Sem foto anterior ao início, a base é estimada (foto + quem cancelou entre o início e a foto). Nomes de produto unificados em `produtoCanonico` (retencao.ts).

## Carteira, entrada manual no onboarding e responsável da etapa

- Carteira do cliente em `clients.carteira` (`infinity` | `select` | `select_club` | `nenhuma`), obrigatória no Novo contrato / revisão da venda (`clientBaseSchema`) e editável na ficha. Rótulos e o mapa contexto da base → carteira em `src/lib/carteira.ts`; o selo é `CarteiraBadge` (ui.tsx), mostrado em Contratos, Clientes, Painel, onboarding, Minhas etapas e Retenção (na retenção a carteira vem do `contexto` da base via `carteiras_retencao()`).
- Entrada manual no onboarding (downgrade/reonboarding): botão "Adicionar cliente" no Painel (`src/components/app/onboarding-manual.tsx`), busca na base com `buscar_clientes_base` e grava tudo em `onboarding_manual` (migração 0018). Reaproveita o cliente pelo id ou por `codigo_externo` = id da base; senão cria um cliente `origem = 'base'`, que fica fora da etapa de contratos (`useClients` filtra `origem = 'contrato'`), das comissões e do webhook de finalizado. `onboardings.tipo` = `novo` | `downgrade` | `reonboarding`.
- Um onboarding concluído não impede outro do mesmo produto só na entrada manual (`_criar_onboarding(..., _tipo)`); o fluxo normal (`novo`) continua sem recriar produto concluído. Índice `onboardings_um_ativo` vale para onboardings não concluídos e não cancelados.
- Responsável da etapa: qualquer perfil que opera (`pode_operar`) escolhe no painel da etapa; a troca entra no histórico (`onboarding_eventos.tipo = 'responsavel'`). Prazo, SLA e estrutura continuam só com o gestor do produto.
