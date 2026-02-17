import { env } from "./env.js";
import { Bot } from "grammy";
import { registerHandlers, registerRunHandler } from "./handlers/commands.js";
import { loadSessions } from "./services/session.js";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

registerRunHandler(bot); // Must run before text handler so "run" is not treated as PRD modification
registerHandlers(bot);

const shutdown = (signal: string) => {
  console.log(`[bot] ${signal} received. Shutting down...`);
  bot.stop();
  process.exit(0);
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

const restored = loadSessions();
if (restored > 0) {
  console.log(`[bot] Restored ${restored} session(s) from disk`);
}

console.log("[bot] Starting Ralph Wiggum Bot...");

bot.start({
  onStart: () => {
    console.log("[bot] Bot launched");
  },
}).catch((err) => {
  console.error("[bot] Failed to start:", err);
  process.exit(1);
});
