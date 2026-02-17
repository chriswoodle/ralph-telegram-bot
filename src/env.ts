import "dotenv/config";
import { cleanEnv, str, bool } from "envalid";

export const env = cleanEnv(process.env, {
  TELEGRAM_BOT_TOKEN: str({ desc: "Telegram bot token from @BotFather" }),
  RALPH_PROJECTS_DIR: str({ default: "./projects", desc: "Base directory for Ralph projects" }),
  ALLOWED_USERS: str({ default: "", desc: "Comma-separated Telegram user IDs; empty = allow all" }),
  CLAUDE_LOG_IO: bool({ default: false, desc: "Log Claude input and output to files" }),
  CLAUDE_LOG_DIR: str({ default: "./logs/claude", desc: "Directory for Claude I/O logs when CLAUDE_LOG_IO is enabled" }),
  OPENROUTER_API_KEY: str({ desc: "OpenRouter API key for PRD generation" }),
  OPENROUTER_MODEL: str({ default: "minimax/minimax-m2.5", desc: "OpenRouter model ID" }),
  SESSION_STORE_PATH: str({ default: "./sessions.json", desc: "Path to session persistence file" }),
});
