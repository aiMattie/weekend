# Weekend

Weekend is an open-source work OS for teams: workspaces, boards and items with rich column types, table / kanban / timeline / calendar / gantt views, dashboards, automations, docs, forms, dev sprints, time tracking, an AI Sidekick, a GraphQL API and an MCP server for AI assistants.

It runs on your own computer (macOS, Windows or Linux) with only Node.js. No Docker, no cloud account.

## Why this project exists

Weekend started as an experiment: how far can today's AI models get when you ask them to "one-shot" a complete, real-world project, from an empty folder to a working product, with as little human steering as possible? We use random, practical projects as test cases and compare what different models produce.

This time the test case was a work-management tool, because we actually needed one right now. So Weekend is both: a benchmark of what AI coding agents can build, and a tool we use ourselves. Expect rough edges, and feel free to fork it, point your own AI agent at it and see how far *your* model takes it.

## Quick start

1. Install **Node.js 22 or newer** (the LTS version) from https://nodejs.org.
2. **Fork this repository** on GitHub (the **Fork** button at the top right), then clone *your* fork:
   `git clone https://github.com/<your-username>/<your-fork>.git`.
   With your own fork you (or your AI agent) can change Weekend, commit and push without touching the original, and still pull in updates later (see [Your own copy](#your-own-copy-fork)). Just trying it out? Downloading the ZIP works too.
3. Start Weekend:
   - **macOS**: double-click `start.command` (the first time: right-click > Open if macOS warns about it).
   - **Windows**: double-click `start.bat`.
   - **Linux**: run `./start.sh` in a terminal.
   - Or in any terminal: `npm run local`.

The first start installs dependencies, asks for your name, e-mail and a password (your admin account) and builds the app. That takes a few minutes; later starts take seconds. Your browser opens Weekend when it is ready. Stop it with Ctrl+C (or close the window).

Weekend starts empty: one account, your admin user and an empty workspace. There is no demo data; create your own boards or import from monday.com.

## With an AI coding agent

Open this folder in Claude Code, Codex, Gemini CLI, Cursor or another coding agent and say hi. The agent reads `AGENTS.md` (Claude Code via `CLAUDE.md`, Gemini via `GEMINI.md`), checks whether Weekend is set up, asks for your admin account details, and can start it for you. If your agent does not pick it up by itself, tell it: "read AGENTS.md and set up Weekend".

## Good to know

| What | How |
|---|---|
| Port | A random free port is chosen on the first setup and stored in `.env` (`PORT`, `APP_URL`). Change it: `npm run setup -- --port 4123` |
| Status | `npm run setup -- --status` shows whether Weekend is set up and its URL |
| Start over | `npm run setup -- --reset` (asks for a new admin account). This deletes all data |
| Your data | `data/` (SQLite database + uploaded files). Copy that folder to back it up |
| Secrets | `.env` (created by setup, never commit it). All options are listed in `.env.example` |
| AI features | Set `ANTHROPIC_API_KEY` in `.env` |
| Single sign-on | Sign in with Google and/or Microsoft: set the client id/secret in `.env` (see `.env.example`); Admin > Single sign-on walks you through it |
| Language | The interface is Dutch by default; switch to English in your profile |
| Import | Import an existing monday.com account under Admin > Import |

Setup without prompts (scripts, agents):

```bash
npm install
npm run setup -- --name "Ada" --email ada@example.com --password "a-strong-password" --company "My team"
npm run local            # add --no-open to skip the browser, --rebuild to force a fresh build
```

## Your own copy (fork)

Weekend is meant to be changed: ask your AI agent for a new column type, another view, your own templates. Do that in **your own fork**, so your changes are saved in your GitHub account and never mix with the original repository.

- Already cloned the original instead of a fork? Fork it on GitHub, then point your copy at the fork:
  `git remote rename origin upstream && git remote add origin https://github.com/<your-username>/<your-fork>.git`
  (or, with the GitHub CLI: `gh repo fork --remote`).
- Save your work: make changes on a branch (`git switch -c feat/my-change`), then `git add -A && git commit -m "..." && git push -u origin feat/my-change`. Your agent can do this for you.
- Share it: made something others would like too? Open a pull request from your fork to the original repository (GitHub shows a **Compare & pull request** button after you push, or run `gh pr create`). Describe what you changed and how you tested it. Your agent can write the description.
- Get updates from the original: `git pull upstream main` (add it first with `git remote add upstream <original repository URL>` if needed).
- `.env` and `data/` are never committed, so your data and secrets stay on your computer.

## Running on a server (Docker)

```bash
cp .env.example .env     # fill in SESSION_SECRET (openssl rand -base64 48), APP_URL, ...
docker compose up -d --build
docker exec -it weekend npm run setup   # create your admin account
```

## Development

See `AGENTS.md` for the stack, commands and test gates, and `docs/ARCHITECTURE.md` for how the code is organised. User manual (Dutch): `docs/handleiding/`.

```bash
npm run dev          # development server
npm test             # unit tests (Vitest)
npm run typecheck && npm run lint && npm run build
```

## License

MIT, see [LICENSE](LICENSE). Contributions via pull requests are welcome and are released under the same license.

Weekend is an independent project. It is not affiliated with, endorsed by or sponsored by monday.com Ltd. "monday.com" is a trademark of its owner and is named here only to describe the importer. The UI uses [Vibe](https://github.com/mondaycom/vibe) (`@vibe/core`), an open-source design system published under the MIT license.
