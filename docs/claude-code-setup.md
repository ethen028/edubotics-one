# Using Claude Code on Edubotics One

This repo carries a small, shared setup for [Claude Code](https://claude.com/claude-code) so everyone who works on it with Claude gets the same design skills and tools.

## What is in the repo

| Path | What it is | When Claude uses it |
|---|---|---|
| `.claude/skills/impeccable/` | Impeccable 4.6 (Apache 2.0): design, audit, polish and harden app UI | Any work on the signed-in app: forms, tables, dashboards, approvals, settings, mobile layouts |
| `.claude/skills/design-taste-frontend/` | taste-skill v2 (MIT): art direction for public web pages | Only the public careers page (`/careers`) and any future marketing page. It says itself it is not for dashboards or app screens |
| `.gitignore` | `.omc/*` ignored except `.omc/skills/` | Keeps oh-my-claudecode run logs and transcripts out of git |
| `eslint.config.mjs`, `.dockerignore` | `.claude/` and `.omc/` excluded | Keeps CI lint and the Docker image limited to app code |

Both skills are plain instructions plus helper scripts. Impeccable's helper downloads a small checksum-verified engine from its own GitHub releases the first time it is used.

## One-time setup on your computer

1. Install Node 22+ and Claude Code: `npm install -g @anthropic-ai/claude-code`, then run `claude` and sign in.
2. Optional, for multi-agent work: `npm i -g oh-my-claude-sisyphus@latest` (this installs the `omc` command).
3. Open this folder in Claude Code (`cd edubotics-one && claude`) and trust the folder when asked.

## Team plugins (to add by hand)

Create `.claude/settings.json` with the content below and commit it if the whole team should get these plugins. It is not committed yet because it switches on third-party plugins and hooks for everyone who opens the repo, so a person should decide that.

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./backups/**)"
    ]
  },
  "extraKnownMarketplaces": {
    "omc": {
      "source": {
        "source": "github",
        "repo": "Yeachan-Heo/oh-my-claudecode"
      }
    }
  },
  "enabledPlugins": {
    "oh-my-claudecode@omc": true,
    "playwright@claude-plugins-official": true
  }
}
```

- **deny rules** stop Claude reading `.env` (database password, session secret) and the office backups.
- **oh-my-claudecode** adds multi-agent orchestration (planner, executor, reviewer agents). After the first install, run `/omc-setup` inside Claude Code once.
- **Playwright** lets Claude open the app in a real browser at `http://localhost:3000`, click through flows and take screenshots. Use test logins, never a real employee's.

Each person installs a plugin from an outside marketplace once; Claude Code prompts for it after the folder is trusted.

Not added on purpose:

- **Supabase**: the app uses its own PostgreSQL through Prisma (see `docker-compose.yml`). Add the Supabase plugin only if the database moves to Supabase.
- **Vercel**: the app runs on the office computer with Docker (`docs/run-on-your-computer.md`), not on Vercel.

## Ground rules for Claude in this repo

- Read the Next.js 16 docs in `node_modules/next/dist/docs/` before changing routing, server actions or caching (see `AGENTS.md`).
- Database changes go through a new Prisma migration (`npm run db:migrate`); never edit an applied migration.
- Never point Claude at the office database or a real `.env`. Use a local test database.
- Before a pull request, run what CI runs: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run build`.
