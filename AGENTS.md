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
