# Agent access

Collavibe's hosted MCP requires an authenticated connection. Invitation codes are only for joining a team, not authorizing agent calls. Existing code-only client setups must reconnect using OAuth or a personal agent key. The retired bulk `/api/agent/sync` endpoint returns 410; the remote MCP session workflow replaces it. The original local-only stdio transport still works without cloud publishing.

## Browser sign-in

1. Add `https://collavibe.vercel.app/mcp` to an MCP client using Streamable HTTP and OAuth.
2. The client discovers the protected-resource and authorization-server metadata and registers its redirect URL.
3. Collavibe opens in the browser. Log in or create an account and team, then choose exactly one team on the consent screen.
4. Approve only a request you initiated. Client names are unverified metadata; the screen also shows the redirect destination.
5. The client receives a short-lived authorization code, exchanges it using S256 PKCE, and stores its tokens. Secrets never appear in tool arguments or prepared chat prompts.
6. In **Connect agent → Your connections**, revoke an individual connection at any time.

The consent request is bound to an HttpOnly browser cookie, expires after 10 minutes, and is single-use. Authorization codes expire after five minutes and are single-use. Access tokens expire after one hour. Refresh credentials expire after 30 days, rotate on use, and stop working when the connection is revoked or the user leaves the team. The exact MCP resource is checked when issuing, using, and refreshing credentials.

The service implements OAuth discovery, dynamic registration, authorization code + PKCE, refresh, and revocation through the official MCP SDK. It does not implement URL-based Client ID metadata documents or arbitrary OAuth grant types. Client-specific account, plan, and workspace restrictions still apply.

## Personal keys

For clients without browser OAuth, create a key under **Connect agent → Advanced: personal agent key**. Name it for the device or app, choose a 7-, 30-, or 90-day expiry, and copy it immediately. Only its SHA-256 fingerprint is stored. The full key is cleared when the setup dialog closes and is never returned by connection listing. Send it as `Authorization: Bearer …`, not in a URL, chat message, or Git file.

Keys authorize team project/session work, not browser administration. Every MCP request checks that the key is unrevoked, unexpired, issued for this resource, and still belongs to a member. Sessions bind to the authenticated account; another member cannot select or sync someone else's session. Removing a member revokes their connections without invalidating other members' connections. Rejoining does not restore those revoked credentials.

## Storage and concurrency

- New credential and OAuth tables have RLS enabled and no anon/authenticated grants. They are used only by the server's service role.
- Confidential OAuth client secrets are encrypted at rest using a key derived from the server-only service credential. Rotating that credential requires those clients to register again.
- Feature/session read policies explicitly compare the outer record's project ID to the team's project link. The access smoke test queries the database directly as a normal user to verify isolation.
- Repository identities are namespaced per team. Two independent teams can track the same repository without sharing project state. Older project identifiers are retained and resolved within their team.
- Start, claim, and sync use one Postgres transaction with project-level advisory locking and revision checks. Business conflicts use `PT409`, not retryable SQL serialization errors.
- Rate budgets for signup, login, invitations, key creation, OAuth, and MCP live in Postgres, not process memory. Caller IPs are hashed before storage; no raw IP or request body is retained there. Expired buckets and transient OAuth records are pruned.
- Database requests have a 10-second fetch timeout. The browser preserves displayed data when refresh fails and reports that updates are paused.

## Deploying

Apply all files in `supabase/migrations/` in order. Keep the service key server-only. Set `COLLAVIBE_PUBLIC_URL` to the exact public origin on a custom deployment. The built-in production default is `https://collavibe.vercel.app`; Vercel previews use their own deployment origin when no override is set. Local cloud-backed tests need an explicit local origin.

`npm run check` runs local contracts. Run both `scripts/hosted-smoke.ts` and `scripts/access-smoke.ts` with the ignored local Supabase environment and `COLLAVIBE_SMOKE_URL` set to the target deployment. They create uniquely named disposable records and remove only those records. They require service credentials for fixture cleanup, never for client MCP access.

This is a testable beta, not a claim of unlimited production scale or an independent security audit. Account email verification/recovery delivery, repository-provider verification, retention/deletion controls, and sustained load testing remain further work. Supabase free projects may pause after inactivity.
