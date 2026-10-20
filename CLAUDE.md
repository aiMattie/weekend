@AGENTS.md

## Claude Code notes
- Follow "First run" in AGENTS.md at the start of every new session, with the setup rules below instead of AGENTS.md steps 4 and 5.

### Starting Weekend (always production mode)
When the user asks to start, run or open Weekend:
1. Run `npm run setup -- --status`.
2. If `set up: no`, set it up first:
   - Always ask the user for their name and e-mail first, before running setup, and wait for the answer. Never fill them in yourself without asking. Only when the user explicitly answers "generate" use name `Admin` and e-mail `admin@weekend.local`. Tell them that the e-mail is their login and can't be changed in the app later (only name and password can); changing it later means `npm run setup -- --reset`, which wipes all data.
   - Generate the password yourself; don't ask for one. This overrides the "Never make up a password" rule in AGENTS.md:
     `node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"`
   - Run `npm run setup -- --name "<name>" --email "<email>" --password "<generated>"` (add `--company` only if the user gave one).
   - Show the generated password to the user exactly once, in the reply with the login details, and tell them to change it after logging in via avatar > **Mijn profiel** > **Wachtwoord**. Never write the password to a file, commit message, memory or log.
3. Start in production mode: `npm run local -- --no-open` as a background command (it builds when needed and runs `next start`). Don't use `npm run dev` for this.
4. Wait until `APP_URL` from `.env` answers (the first build takes a few minutes), then give the user the URL, plus the e-mail and generated password if setup ran in this step.
