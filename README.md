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
- An [OpenRouter](https://openrouter.ai/) API key (used for PRD generation)

### Install

```bash
corepack enable
yarn install
yarn dlx @yarnpkg/sdks vscode
```

### Configure

```bash
cp .env.example .env
# Edit .env with your bot token, OpenRouter key, and preferences
```

### Run

```bash
yarn build && yarn start
```

## Architecture

```
src/
├── index.ts                 # Entry point, Grammy bot setup
├── env.ts                   # Environment config (envalid)
├── handlers/
│   └── commands.ts          # Telegram command + message handlers
├── services/
│   ├── session.ts           # Per-user state machine (persisted to disk)
│   ├── skills.ts            # PRD generation, clarifying questions, modifications
│   ├── openrouter.ts        # Multi-turn OpenRouter API client
│   ├── claude.ts            # Claude CLI wrapper (Ralph iterations)
│   ├── ralph-project.ts     # Project init, prd.json, progress
│   ├── ralph-loop.ts        # Ralph iteration loop
│   └── format.ts            # Telegram message formatting
└── utils/
    └── load-skill.ts        # Load skill prompts from resources/

resources/
├── CLAUDE.md                # Instructions given to Ralph agent
├── prd-skill.md             # Prompts for PRD generation flow
└── ralph-skill.md           # Prompts for prd.json conversion
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
| `OPENROUTER_API_KEY` | (required) | API key for PRD generation |
| `OPENROUTER_MODEL` | `minimax/minimax-m2.5` | OpenRouter model for PRD generation |
| `RALPH_PROJECTS_DIR` | `./projects` | Base dir for project folders |
| `ALLOWED_USERS` | (empty=all) | Comma-separated Telegram user IDs |
| `SESSION_STORE_PATH` | `./sessions.json` | Path to session persistence file |
| `CLAUDE_LOG_IO` | `false` | Log Claude CLI input/output to files |
| `CLAUDE_LOG_DIR` | `./logs/claude` | Directory for Claude I/O logs |

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
