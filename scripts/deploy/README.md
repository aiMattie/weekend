# Deploy and remote development

## Continuous deploy (pull-based)

`main` is production. With the optional cron setup below, every push/merge to `main` is deployed within ~5 minutes
plus the Docker build (~20 min):

1. GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, tests and `next build` on every PR and on `main`.
2. Cron on the production host runs `scripts/deploy/auto-deploy.sh` every 5 minutes. When `origin/main` moved it
   checks it out in a clean clone (`$DEPLOY_DIR`, `.env` symlinked to `$ENV_FILE`), builds the image while the old
   container keeps serving, swaps the container, waits for the healthcheck, runs `db:migrate`, and rolls back to the
   `:previous` image if the new container never becomes healthy.
3. Logs are written to `$LOG_DIR`. Deployed commit: `$DEPLOY_DIR/.deployed-sha`.

The script requires `REPO` (the git URL to clone; there is no default). Optional overrides: `DEPLOY_DIR`,
`ENV_FILE`, `BRANCH` (default `main`), `LOG_DIR`, `LOCK`. Example crontab entry (`crontab -l`):

```
*/5 * * * * REPO=git@github.com:<owner>/<repo>.git /path/to/checkout/scripts/deploy/auto-deploy.sh
```

Manual redeploy of the current `main`: `scripts/deploy/auto-deploy.sh --force`. A failing build is not retried
for the same commit: push a fix (or use `--force`).

Production data lives in the Docker volume `weekend_data`; it is the same volume no matter which
checkout runs `docker compose`, because the compose project name is fixed (`name: weekend`).

## Changing the code with Claude

- **Claude Code on the host**: `cd <checkout> && claude`. Work on a branch, push, open a PR.
- **Remote Control** (drive a session on this host from claude.ai or the Claude app): `claude remote-control`
  in a `tmux` session on the host, then open the session from claude.ai/code or the mobile app.
- **Claude Code on the web** (claude.ai/code): select this repository (install the Claude GitHub app on the
  owner once). Claude works in a cloud sandbox and opens a PR; merging it deploys.
- **From inside the app**: the MCP tools `request_change` / `list_change_requests` file feature requests and bugs
  as items on the change-request board (`CHANGE_REQUEST_BOARD_ID`, default the Weekend dev "Taken" board). A
  scheduled Claude routine can pick up items that are ready, implement them and open a PR.
