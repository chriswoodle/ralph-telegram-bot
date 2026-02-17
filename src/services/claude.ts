import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../env.js";

interface RunClaudeOpts {
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
}

async function logToFile(input: string, output: string): Promise<void> {
  if (!env.CLAUDE_LOG_IO) return;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = env.CLAUDE_LOG_DIR;
  await mkdir(dir, { recursive: true });
  const path = join(dir, `claude-${ts}.log`);
  const content = `=== INPUT ===\n${input}\n\n=== OUTPUT ===\n${output}\n`;
  await writeFile(path, content, "utf-8");
  console.log(`[claude] Logged I/O to ${path}`);
}

export async function runClaude(opts: RunClaudeOpts): Promise<string> {
  const { prompt, cwd, signal } = opts;

  console.log(`[claude] Running in ${cwd}, prompt length: ${prompt.length}`);

  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["--print", "--dangerously-skip-permissions"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", async (code) => {
      if (code === 0 || stdout.length > 0) {
        console.log(`[claude] Exited code ${code}, output length: ${stdout.length}`);
        await logToFile(prompt, stdout).catch((err) => console.error("[claude] Log write failed:", err));
        resolve(stdout);
      } else {
        console.error(`[claude] Exited with error code ${code}:`, stderr);
        await logToFile(prompt, `[ERROR] exit ${code}\n${stderr}`).catch((err) => console.error("[claude] Log write failed:", err));
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      }
    });

    child.on("error", (err) => {
      console.error("[claude] Spawn error:", err);
      reject(err);
    });

    child.stdin!.write(prompt);
    child.stdin!.end();
  });
}
