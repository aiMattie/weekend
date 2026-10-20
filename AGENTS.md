# Weekend: guide for AI coding agents

Weekend is an open-source work OS: workspaces, boards, items, columns, views, dashboards, automations, docs, forms, dev sprints, an AI Sidekick, a GraphQL API and an MCP server. It runs locally with only Node.js (no Docker needed).

This file is read by Codex, Cursor and other agents that use `AGENTS.md`. `CLAUDE.md` (Claude Code) and `GEMINI.md` (Gemini CLI) import it. Any other agent: read this file first.

## First run: do this at the start of every new session

The person using you may not be a developer. Before doing anything else:

1. Check Node: `node -v` must be 22 or newer. If Node is missing or too old, tell the user to install the LTS version from https://nodejs.org and stop.
2. If `node_modules/` is missing, run `npm install` (takes a few minutes; say so).
3. Run `npm run setup -- --status`. It prints `set up: yes|no`, the port and the URL.
4. If `set up: no`, greet the user, explain that Weekend is not set up yet and starts empty (no demo data), and ask for their name, e-mail, a password (min. 8 characters) and optionally a company or team name. Then run
   `npm run setup -- --name "<name>" --email "<email>" --password "<password>" --company "<company>"`.
   Never make up a password for them, and don't repeat it back.
5. Offer to start Weekend (see below). When it runs, give the user the URL.
6. If `set up: yes`, just mention the URL and how to start it, then help with what the user asks.
7. Check `git remote -v`. If there is no `origin`, or `origin` is not the user's own GitHub fork, tell the user once: *"Fork Weekend on GitHub so your changes are saved in your own copy and you can still pull updates from the original."* Offer to do it: with the GitHub CLI `gh repo fork --remote` (renames the original to `upstream`, sets `origin` to the fork); otherwise ask them to click **Fork** on GitHub and give you the fork URL, then run `git remote rename origin upstream` and `git remote add origin <fork url>`. Don't push to a repository the user doesn't own.

## Making changes for the user
- Work in the user's fork, on a branch per change (`git switch -c feat/<short-name>`). Before you start, run the gates (`npm run typecheck`, `npm run lint`, `npm test`) so you know the baseline.
- When a change works (gates green, checked in the running app), suggest to the user: *"Shall I commit this and push it to your fork?"* Commit with a clear message and push only when the user agrees.
- After pushing, suggest sharing it: *"Do you want to open a pull request so the original Weekend project can include your change too?"* If yes, run `gh pr create --repo <upstream owner/repo> --base main --head <user>:<branch>` (upstream = `git remote get-url upstream`) with a short title and a description of what changed and how it was tested, or give the user the GitHub "Compare & pull request" link. Only for changes that are useful to everyone; keep personal data, `.env` values and company-specific templates out of it.
- Updates from the original: `git pull upstream main`, then `npm run local` (rebuilds by itself).
- Never commit `.env` or `data/` (both are gitignored).

## Running Weekend

- Start: `npm run local`. First time it builds the app (a few minutes); later starts are quick. It rebuilds automatically after source changes and opens the browser (`--no-open` to skip). It keeps running in the foreground until Ctrl+C, so as an agent start it as a background process and wait until the URL answers.
- Same thing without a terminal: double-click `start.command` (macOS) or `start.bat` (Windows), or run `./start.sh` (Linux).
- Port: setup picks a random free port and stores it in `.env` as `PORT` (with `APP_URL`). Change it with `npm run setup -- --port 4123`. A `PORT` set in the shell is ignored in favour of `.env`.
- Start over: `npm run setup -- --reset --name ... --email ... --password ...` wipes all data and creates a new admin account. Ask the user first: this deletes everything.
- Data lives in `data/` (SQLite `data/app.db` + uploaded files). Back up that folder to keep the data. `.env` holds the secrets; never commit or print it.
- Optional features via `.env` (see `.env.example`): `ANTHROPIC_API_KEY` for AI features, `SMTP_*` for e-mail, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for Google sign-in, `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`/`MICROSOFT_TENANT_ID` for Microsoft sign-in (Admin > Single sign-on shows the setup steps).
- Docker (optional, for servers): `docker compose up -d --build`, host port `HOST_PORT` (default 3058), then once `docker exec -it weekend npm run setup` to create the admin account.

## Stack
- Next.js 16 (App Router, `src/app`), React 19, TypeScript, Tailwind CSS 4, ESLint. UI: `@vibe/core` (Vibe design system). DB: SQLite (better-sqlite3 + Drizzle) in `data/`. Node.js 22+.
- Next.js 16 has breaking changes vs. older releases: read `node_modules/next/dist/docs/` before writing Next code (see the block at the end of this file).

## Development commands
- Dev server: `npm run dev` (or `NEXT_DIST_DIR=.next-<name> DATABASE_URL=file:data/<name>.db npx next dev -p <port>` to run several side by side; never share one `.next` between servers)
- DB: `npm run db:reset && npm run db:seed -- --templates` loads the **test fixture** (role-named users `admin@example.com` etc., placeholder workspaces, Delivery + Development + klant-template boards) for development and tests only; end users always start blank via `npm run setup`; `npm run db:migrate`; new migration: `npm run db:generate -- <module> --name <what>`
- Gates: `npx tsc --noEmit` (`npm run typecheck`), `npm run lint`, `npm test` (Vitest, in-memory SQLite), `npm run build`
- E2E (Playwright, own port + DB, needs `E2E_RESET=1` on the server): against a running server `E2E_PORT=3111 E2E_REUSE=1 npx playwright test e2e/<module> --workers=1` (modules: smoke.spec.ts, columns, table-ux, views, dev, automations, boards-extra, platform, migration, admin, ai, user-journey.spec.ts; `PW_OUTPUT_DIR=/tmp/...` keeps output out of the tree). Without `E2E_REUSE` the config starts its own `next dev`. E2E logs in with `SEED_PASSWORD` (default `Welkom123!`).
- Manuals + screenshots: `npm run manuals` (regenerates `docs/handleiding/img`); MCP/GraphQL smoke: `BASE_URL=http://localhost:<port> npx tsx scripts/mcp-smoke.ts`
- **Read `docs/ARCHITECTURE.md` before changing code**: layout, ownership rules, how to add a column type / view / widget / automation block / MCP tool / schema file / service / e2e spec.

## Architecture
- Business logic only in `src/server/services/*` (zod in, permission checks via `requireBoard`/`assertCan`); REST (`src/app/api/v1`), GraphQL (`/api/graphql`, `/api/v2`), MCP (`/api/mcp`), automations and UI call the services.
- Registries are the extension points: columns, views (`src/server/views`), widgets, automation blocks, MCP tools, nav (`src/components/shell/nav-registry.ts`), board templates (`src/server/templates`).
- Notifications are stored in the recipient's language (`notify()` takes an i18n key); UI texts live in `src/lib/i18n/{nl,en}.ts` plus per-module dictionaries. Default UI language is Dutch; users can switch to English.
- Vibe injects its CSS from JS: `src/lib/vibe-ssr-init.ts` + `VibeSsrStyles` print it during SSR. Figtree is bundled via `@fontsource/figtree`.
- MCP server (`/api/mcp`, tools in `src/server/mcp/tools/*`). Auth: API token (`Authorization: Bearer wkd_…`, Admin > API) or OAuth 2.1 (`src/server/services/oauth.ts`, discovery `/.well-known/oauth-*`, DCR `/api/oauth/register`, consent `/oauth/authorize`, token `/api/oauth/token`; redirect hosts `OAUTH_REDIRECT_HOSTS`, default claude.ai/claude.com + loopback).
- Import from monday.com: Admin > Import or `scripts/import-monday.ts` (`MONDAY_API_KEY`), read-only against the monday.com API.
- Import from Jira Cloud: Admin > Import (link the site, schedule a sync) or `scripts/migrate-jira.ts` (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`), read-only against Jira; `--fixtures` rehearses against `scripts/fixtures/jira`. Code: `src/server/services/jira-migration.ts` + `src/server/services/migration/jira-*.ts`.

## Deploy (optional)
- CI: `.github/workflows/ci.yml` (typecheck, lint, test, build). `scripts/deploy/auto-deploy.sh` is an optional pull-based deploy for a Docker host (requires `REPO=<git url>`); details in `scripts/deploy/README.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
