import { runClaude } from "./claude.js";
import { loadResource } from "../utils/load-skill.js";
import { ensureProgressFile } from "./ralph-project.js";
import type { UserStory } from "./session.js";

export interface RalphStatus {
  type: string;
  iteration: number;
  totalStories: number;
  currentStory?: UserStory | null;
  message: string;
}

interface RunRalphLoopOpts {
  projectDir: string;
  stories: UserStory[];
  signal?: AbortSignal;
  onProgress: (status: RalphStatus) => void | Promise<void>;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const h = Math.floor(min / 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (min % 60 > 0) parts.push(`${min % 60}m`);
  if (sec % 60 > 0 || parts.length === 0) parts.push(`${sec % 60}s`);
  return parts.join(" ");
}

function formatTimeInfo(elapsedMs: number, eteMs?: number): string {
  const elapsed = formatDuration(elapsedMs);
  if (eteMs == null || eteMs <= 0) return `⏱ Elapsed: ${elapsed}`;
  return `⏱ Elapsed: ${elapsed} | ETE: ~${formatDuration(eteMs)} remaining`;
}

export async function runRalphLoop(opts: RunRalphLoopOpts): Promise<{
  completed: boolean;
  iterations: number;
}> {
  const { projectDir, stories, signal, onProgress } = opts;
  const totalStories = stories.length;

  console.log(`[ralph] Starting loop for ${projectDir}, ${totalStories} stories (claude)`);

  await ensureProgressFile(projectDir);

  const loopStartTime = Date.now();
  const iterationDurations: number[] = [];

  for (let i = 0; i < totalStories; i++) {
    const storyNum = i + 1;
    const story = stories[i];

    if (signal?.aborted) {
      console.log(`[ralph] Loop aborted at story ${storyNum}`);
      const elapsed = Date.now() - loopStartTime;
      await onProgress({
        type: "aborted",
        iteration: storyNum,
        totalStories,
        message: `Ralph loop was cancelled.\n${formatTimeInfo(elapsed)}`,
      });
      return { completed: false, iterations: i };
    }

    const elapsedBeforeIter = Date.now() - loopStartTime;
    const avgMs = iterationDurations.length > 0
      ? iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length
      : 0;
    const remainingIters = totalStories - i;
    const etaMs = avgMs > 0 ? avgMs * remainingIters : undefined;

    await onProgress({
      type: "iteration_start",
      iteration: storyNum,
      totalStories,
      currentStory: story,
      message: `🔄 Story ${storyNum}/${totalStories} — ${story.id}: ${story.title}\n${formatTimeInfo(elapsedBeforeIter, etaMs)}`,
    });

    const iterStartTime = Date.now();

    try {
      const { completed } = await runRalphIteration(projectDir, storyNum, signal);

      const iterDuration = Date.now() - iterStartTime;
      iterationDurations.push(iterDuration);
      const elapsed = Date.now() - loopStartTime;

      if (completed) {
        console.log(`[ralph] All tasks complete at story ${storyNum}`);
        await onProgress({
          type: "complete",
          iteration: storyNum,
          totalStories,
          message: `✅ Ralph completed all tasks at story ${storyNum}/${totalStories}!\n${formatTimeInfo(elapsed)}`,
        });
        return { completed: true, iterations: storyNum };
      }
    } catch (err) {
      const iterDuration = Date.now() - iterStartTime;
      iterationDurations.push(iterDuration);
      const elapsed = Date.now() - loopStartTime;

      const error = err as Error & { name?: string };
      if (error.name === "AbortError") {
        await onProgress({
          type: "aborted",
          iteration: storyNum,
          totalStories,
          message: `Ralph loop was cancelled.\n${formatTimeInfo(elapsed)}`,
        });
        return { completed: false, iterations: i };
      }

      // Like ralph.sh: continue on claude errors (|| true)
      console.error(`[ralph] Error in story ${storyNum} (${story.id}):`, error);
      const avgMsAfter = iterationDurations.reduce((a, b) => a + b, 0) / iterationDurations.length;
      const remainingItersAfter = totalStories - storyNum;
      const etaMsAfter = remainingItersAfter > 0 ? avgMsAfter * remainingItersAfter : 0;

      await onProgress({
        type: "error",
        iteration: storyNum,
        totalStories,
        message: `⚠️ Error in story ${storyNum} (${story.id}): ${error.message}. Continuing...\n${formatTimeInfo(elapsed, etaMsAfter)}`,
      });
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  const elapsed = Date.now() - loopStartTime;
  console.log(`[ralph] All ${totalStories} stories processed`);
  await onProgress({
    type: "all_stories_done",
    iteration: totalStories,
    totalStories,
    message: `✅ Ralph processed all ${totalStories} stories.\n${formatTimeInfo(elapsed)}`,
  });

  return { completed: true, iterations: totalStories };
}

async function runRalphIteration(
  projectDir: string,
  iteration: number,
  signal?: AbortSignal
): Promise<{ output: string; completed: boolean }> {
  console.log(`[ralph] Story ${iteration} for ${projectDir}`);
  const prompt = await loadResource("CLAUDE.md");
  const output = await runClaude({ prompt, cwd: projectDir, signal });
  const completed = output.includes("<promise>COMPLETE</promise>");
  console.log(`[ralph] Story ${iteration} complete, all done: ${completed}`);
  return { output, completed };
}
