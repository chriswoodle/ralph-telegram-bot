# Ralph Wiggum Telegram Bot

A Telegram bot for orchestrating Ralph autonomous agent loops. Plan features via PRD, review, approve, and let Ralph implement them autonomously — all from Telegram.

## Flow

```
/start → Project Name → PRD Summary → Clarifying Questions → Review PRD → Approve → Run Ralph
```

1. **Start a project** — `/start` or `/new`, provide a kebab-case name
2. **Describe the feature** — Free-form summary of what you want built
3. **Answer clarifying questions** — Bot generates 3-5 questions with lettered options (reply "1A, 2C, 3B")
4. **Review the PRD** — Full markdown PRD shown in chat; approve, modify, or redo
5. **Run Ralph** — Type `run` (or `run 15` for custom max iterations)
6. **Monitor progress** — `/progress` for story status, `/log` for raw log, `/stop` to cancel

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Start a new project |
| `/new` | Alias for `/start` |
| `/progress` | Check story completion status |
| `/log` | View raw progress log |
| `/status` | Current session state |
| `/stop` | Cancel running Ralph loop |
| `/help` | Show available commands |
| `run` | Start Ralph execution |
| `run N` | Start with N max iterations |

## Setup

### Prerequisites

- Node.js ≥ 20
- Yarn Berry (corepack)
- Claude Code CLI (`claude`) installed and authenticated
- A Telegram Bot Token from [@BotFather](https://t.me/BotFather)

### Install

```bash
corepack enable
yarn install
yarn dlx @yarnpkg/sdks vscode 
```

### Configure

```bash
cp .env.example .env
# Edit .env with your bot token and preferences
```

### Run

```bash
yarn build && yarn start
# or for development with auto-reload (runs TypeScript directly):
yarn dev
```

## Architecture

```
src/
├── index.ts                 # Entry point, Telegraf setup
├── handlers/
│   └── commands.ts          # Telegram command + message handlers
└── services/
    ├── session.ts           # Per-user state machine
    ├── claude.ts            # Claude CLI wrapper (PRD gen, Ralph iterations)
    ├── ralph-project.ts     # Project init, prd.json, progress
    ├── ralph-loop.ts        # Ralph iteration loop
    └── format.ts            # Telegram message formatting
```

### State Machine

```
IDLE
  └→ AWAITING_PROJECT_NAME
       └→ AWAITING_PRD_SUMMARY
            └→ AWAITING_CLARIFICATIONS
                 └→ REVIEWING_PRD ←─┐
                      ├→ AWAITING_MODIFICATIONS ──┘
                      └→ RUNNING
                           └→ IDLE (complete/stopped/error)
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | (required) | Bot token from BotFather |
| `RALPH_PROJECTS_DIR` | `./projects` | Base dir for project folders |
| `RALPH_MAX_ITERATIONS` | `10` | Default max iterations per run |
| `ALLOWED_USERS` | (empty=all) | Comma-separated Telegram user IDs |

## Project Directory Structure

When you create a project named `my-app`, Ralph creates:

```
projects/my-app/
├── .git/
├── prd.json            # Ralph-format PRD
├── progress.txt        # Iteration log
├── .last-branch        # Branch tracking for archival
├── tasks/
│   └── prd-my-app.md   # Full markdown PRD
└── archive/            # Previous runs
```
