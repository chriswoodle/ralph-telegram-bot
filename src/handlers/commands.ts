import { Bot, type Context } from "grammy";
import { env } from "../env.js";
import { getSession, updateSession, resetSession, getSessionHistory, State } from "../services/session.js";
import {
    generateClarifyingQuestions,
    generatePrd,
    modifyPrd,
    convertPrdToJson,
} from "../services/skills.js";
import {
    initProject,
    writePrdJson,
    writePrdMarkdown,
    getProgress,
    getProgressLog,
    listProjects,
    gatherProjectContext,
} from "../services/ralph-project.js";
import { runRalphLoop } from "../services/ralph-loop.js";
import {
    formatPrdForTelegram,
    formatProgressForTelegram,
    formatSessionHistoryForDebug,
    truncate,
} from "../services/format.js";

const PROJECTS_DIR = env.RALPH_PROJECTS_DIR;

function isAuthorized(userId: number | undefined): boolean {
    const allowed = env.ALLOWED_USERS;
    if (!allowed) return true;
    return allowed.split(",").map((s) => s.trim()).includes(String(userId));
}

export function registerHandlers(bot: Bot<Context>): void {
    bot.use((ctx, next) => {
        if (!isAuthorized(ctx.from?.id)) {
            console.log(`[cmd] Unauthorized user ${ctx.from?.id} blocked`);
            return ctx.reply("⛔ You are not authorized to use this bot.");
        }
        return next();
    });

    bot.command("start", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        console.log(`[cmd] /start from user ${userId}`);
        resetSession(userId);
        updateSession(userId, { state: State.AWAITING_PROJECT_NAME });

        await ctx.reply(
            "🤖 *Ralph Wiggum Bot*\n\n" +
            "I'll help you plan and execute projects using AI agents.\n\n" +
            "Let's start a new project. What would you like to name it?\n\n" +
            "_Use lowercase letters, numbers, and hyphens (e.g., `task-manager`, `my-saas-app`)_",
            { parse_mode: "Markdown" }
        );
    });

    bot.command("new", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        console.log(`[cmd] /new from user ${userId}`);
        resetSession(userId);
        updateSession(userId, { state: State.AWAITING_PROJECT_NAME });

        await ctx.reply(
            "📁 Starting a new project. What's the project name?\n\n" +
            "_Use kebab-case (e.g., `my-cool-app`)_",
            { parse_mode: "Markdown" }
        );
    });

    bot.command("feature", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        console.log(`[cmd] /feature from user ${userId}`);

        const projects = await listProjects(PROJECTS_DIR);
        if (projects.length === 0) {
            await ctx.reply(
                "No existing projects found. Use /start to create one first."
            );
            return;
        }

        resetSession(userId);
        updateSession(userId, { state: State.AWAITING_PROJECT_SELECTION });

        const lines = projects.map(
            (p, i) => `*${i + 1}.* \`${p.name}\` — ${p.description}`
        );

        await ctx.reply(
            "📂 *Select a project to add a feature to:*\n\n" +
            lines.join("\n") +
            "\n\n_Reply with the number or project name._",
            { parse_mode: "Markdown" }
        );
    });

    bot.command("progress", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        console.log(`[cmd] /progress from user ${userId}, project: ${session.projectName ?? "none"}`);

        if (!session.projectDir) {
            return ctx.reply("No active project. Use /start to begin a new one.");
        }

        const progress = await getProgress(session.projectDir);
        await ctx.reply(formatProgressForTelegram(progress), { parse_mode: "Markdown" });
    });

    bot.command("log", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        console.log(`[cmd] /log from user ${userId}, project: ${session.projectName ?? "none"}`);

        if (!session.projectDir) {
            return ctx.reply("No active project. Use /start to begin a new one.");
        }

        const log = await getProgressLog(session.projectDir);
        await ctx.reply(`📜 *Progress Log:*\n\n\`\`\`\n${truncate(log, 3800)}\n\`\`\``, {
            parse_mode: "Markdown",
        });
    });

    bot.command("stop", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        console.log(`[cmd] /stop from user ${userId}, state: ${session.state}`);

        if (session.state !== State.RUNNING) {
            return ctx.reply("Ralph is not currently running.");
        }

        if (session.abortController) {
            session.abortController.abort();
            console.log(`[cmd] Abort requested for user ${userId}`);
            await ctx.reply("🛑 Stopping Ralph after current iteration completes...");
        }
    });

    bot.command("status", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        console.log(`[cmd] /status from user ${userId}`);
        const lines = [
            `📊 *Session Status*`,
            `State: \`${session.state}\``,
            `Project: ${session.projectName || "None"}`,
            `Directory: \`${session.projectDir || "N/A"}\``,
        ];

        if (session.state === State.RUNNING) {
            const totalStories = session.prdJson?.userStories.length ?? 0;
            lines.push(`Story: ${session.currentIteration}/${totalStories}`);
            if (session.currentStory) {
                lines.push(`Current Story: ${session.currentStory}`);
            }
        }

        await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
    });

    bot.command("debug", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const history = getSessionHistory(userId);
        const session = getSession(userId);
        console.log(`[cmd] /debug from user ${userId}, ${history.length} history entries`);

        const header = `🔧 *Session Debugger*\n\nCurrent state: \`${session.state}\`\n\n`;
        const historyText = formatSessionHistoryForDebug(history);
        const full = header + historyText;

        await ctx.reply(truncate(full, 3800), { parse_mode: "Markdown" });
    });

    bot.command("help", async (ctx) => {
        console.log(`[cmd] /help from user ${ctx.from?.id}`);
        await ctx.reply(
            "🤖 *Ralph Wiggum Bot — Commands*\n\n" +
            "/start — Start a new project\n" +
            "/new — Alias for /start\n" +
            "/feature — Add a new feature to an existing project\n" +
            "/progress — Check story completion status\n" +
            "/log — View raw progress log\n" +
            "/status — Current session state\n" +
            "/debug — View session state change history\n" +
            "/stop — Cancel a running Ralph loop\n" +
            "/help — Show this message",
            { parse_mode: "Markdown" }
        );
    });

    bot.on("message:text", async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        const text = ctx.message.text.trim();

        switch (session.state) {
            case State.AWAITING_PROJECT_NAME:
                return handleProjectName(ctx, text);

            case State.AWAITING_PROJECT_SELECTION:
                return handleProjectSelection(ctx, text);

            case State.AWAITING_PRD_SUMMARY:
                return handlePrdSummary(ctx, text);

            case State.AWAITING_CLARIFICATIONS:
                return handleClarifications(ctx, text);

            case State.REVIEWING_PRD:
                return handlePrdReview(ctx, text);

            case State.AWAITING_MODIFICATIONS:
                return handleModifications(ctx, text);

            case State.RUNNING:
                return ctx.reply(
                    "🔄 Ralph is currently running. Use /progress to check status or /stop to cancel."
                );

            default:
                return ctx.reply(
                    "I'm not sure what to do with that. Use /start to begin a new project, /feature to add to an existing one, or /help for commands."
                );
        }
    });
}

async function handleProjectName(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const projectName = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    if (!projectName || projectName.length < 2) {
        await ctx.reply(
            "❌ Invalid project name. Use at least 2 characters with only letters, numbers, and hyphens."
        );
        return;
    }

    try {
        console.log(`[cmd] User ${userId} creating project: ${projectName}`);
        const projectDir = await initProject(PROJECTS_DIR, projectName);
        updateSession(userId, {
            state: State.AWAITING_PRD_SUMMARY,
            projectName,
            projectDir,
        });

        await ctx.reply(
            `✅ Project *${projectName}* initialized!\n` +
            `📁 Directory: \`${projectDir}\`\n\n` +
            "Now describe what you want to build. Give me a summary of the feature/product — " +
            "as detailed as you like. I'll ask clarifying questions before generating the PRD.",
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Failed to init project ${projectName} for user ${userId}:`, err);
        await ctx.reply(`❌ Failed to initialize project: ${message}`);
    }
}

async function handleProjectSelection(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;

    const projects = await listProjects(PROJECTS_DIR);
    if (projects.length === 0) {
        await ctx.reply("No projects found. Use /start to create one.");
        return;
    }

    // Match by number or name
    let selected = projects.find(
        (_, i) => text.trim() === String(i + 1)
    );
    if (!selected) {
        const lower = text.trim().toLowerCase();
        selected = projects.find((p) => p.name.toLowerCase() === lower);
    }

    if (!selected) {
        await ctx.reply(
            "❌ Could not match a project. Reply with a number or exact project name."
        );
        return;
    }

    try {
        console.log(`[cmd] User ${userId} selected project: ${selected.name}`);
        const context = await gatherProjectContext(selected.projectDir);

        updateSession(userId, {
            state: State.AWAITING_PRD_SUMMARY,
            projectName: selected.name,
            projectDir: selected.projectDir,
            projectContext: context,
        });

        await ctx.reply(
            `✅ Selected project *${selected.name}*\n\n` +
            "Describe the new feature you want to add. I'll ask clarifying questions " +
            "before generating a PRD that builds on what's already there.",
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Error gathering context for ${selected.name}:`, err);
        await ctx.reply(`❌ Error loading project: ${message}`);
    }
}

async function handlePrdSummary(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);

    await ctx.reply("🤔 Analyzing your summary and generating clarifying questions...");

    try {
        console.log(`[cmd] User ${userId} generating clarifying questions for project ${session.projectName}`);
        const result = await generateClarifyingQuestions(
            text,
            session.projectDir!,
            undefined,
            session.projectContext ?? undefined,
        );

        updateSession(userId, {
            state: State.AWAITING_CLARIFICATIONS,
            prdSummary: text,
            clarifyingQuestions: result.questions,
            prdConversation: result.conversation,
        });

        await ctx.reply(
            `📝 *Clarifying Questions*\n\n${result.questions}\n\n` +
            '_Reply with your answers (e.g., "1A, 2C, 3B" or describe in full sentences)._',
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Error generating questions for user ${userId}:`, err);
        await ctx.reply(`❌ Error generating questions: ${message}\n\nPlease try again.`);
    }
}

async function handleClarifications(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);

    await ctx.reply("📄 Generating your PRD... This may take a minute.");

    try {
        console.log(`[cmd] User ${userId} generating PRD for project ${session.projectName}`);
        const result = await generatePrd(
            session.prdConversation!,
            text,
            session.projectName!
        );

        await writePrdMarkdown(session.projectDir!, session.projectName!, result.prd);

        updateSession(userId, {
            state: State.REVIEWING_PRD,
            clarifyingAnswers: text,
            prdMarkdown: result.prd,
            prdConversation: result.conversation,
        });

        const displayText = truncate(result.prd, 3800);
        await ctx.reply(`📋 *Generated PRD:*\n\n${displayText}`, { parse_mode: "Markdown" });
        await ctx.reply(
            "👆 Review the PRD above. Reply with one of:\n\n" +
            '✅ *"approve"* — Accept and convert to Ralph format\n' +
            '✏️ *"modify: [your changes]"* — Request specific modifications\n' +
            '🔄 *"redo"* — Start over with a new summary',
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Error generating PRD for user ${userId}:`, err);
        await ctx.reply(`❌ Error generating PRD: ${message}\n\nPlease try sending your answers again.`);
    }
}

async function handlePrdReview(ctx: Context, text: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);
    const lower = text.toLowerCase().trim();

    if (lower === "approve" || lower === "yes" || lower === "ok" || lower === "lgtm") {
        console.log(`[cmd] User ${userId} approved PRD for project ${session.projectName}`);
        return convertAndRun(ctx);
    }

    if (lower.startsWith("modify:") || lower.startsWith("change:") || lower.startsWith("edit:")) {
        const modification = text.slice(text.indexOf(":") + 1).trim();
        updateSession(userId, { state: State.AWAITING_MODIFICATIONS });
        return applyModifications(ctx, modification);
    }

    if (lower === "redo") {
        console.log(`[cmd] User ${userId} requested redo for project ${session.projectName}`);
        updateSession(userId, {
            state: State.AWAITING_PRD_SUMMARY,
            prdSummary: null,
            clarifyingQuestions: null,
            prdMarkdown: null,
            prdConversation: null,
        });
        await ctx.reply("🔄 OK, let's start over. Describe what you want to build.");
        return;
    }

    updateSession(userId, { state: State.AWAITING_MODIFICATIONS });
    return applyModifications(ctx, text);
}

async function handleModifications(ctx: Context, text: string): Promise<void> {
    return applyModifications(ctx, text);
}

async function applyModifications(ctx: Context, modification: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);

    await ctx.reply("✏️ Applying modifications...");

    try {
        const result = await modifyPrd(
            session.prdConversation!,
            modification
        );

        await writePrdMarkdown(session.projectDir!, session.projectName!, result.prd);

        updateSession(userId, {
            state: State.REVIEWING_PRD,
            prdMarkdown: result.prd,
            prdConversation: result.conversation,
        });

        const displayText = truncate(result.prd, 3800);
        await ctx.reply(`📋 *Updated PRD:*\n\n${displayText}`, { parse_mode: "Markdown" });
        await ctx.reply(
            'Reply *"approve"* to accept, send more modifications, or *"redo"* to start over.',
            { parse_mode: "Markdown" }
        );
    } catch (err) {
        updateSession(userId, { state: State.REVIEWING_PRD });
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Error applying modifications for user ${userId}:`, err);
        await ctx.reply(`❌ Error applying modifications: ${message}\n\nPlease try again.`);
    }
}

async function convertAndRun(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    const session = getSession(userId);

    await ctx.reply("🔄 Converting PRD to Ralph format...");

    try {
        console.log(`[cmd] User ${userId} converting PRD to JSON for project ${session.projectName}`);
        const prdJson = await convertPrdToJson(
            session.prdMarkdown!,
            session.projectName!,
            session.projectDir!
        );

        await writePrdJson(session.projectDir!, prdJson);

        updateSession(userId, { prdJson });

        await ctx.reply(formatPrdForTelegram(prdJson), { parse_mode: "Markdown" });
        await ctx.reply(
            `✅ PRD converted! ${prdJson.userStories.length} stories ready.\n\n` +
            '🚀 Reply *"run"* to start Ralph.',
            { parse_mode: "Markdown" }
        );

        updateSession(userId, { state: State.REVIEWING_PRD });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cmd] Error converting PRD for user ${userId}:`, err);
        await ctx.reply(`❌ Error converting to Ralph format: ${message}\n\nPlease try approving again.`);
    }
}

export function registerRunHandler(bot: Bot<Context>): void {
    bot.hears(/^run$/i, async (ctx) => {
        const userId = ctx.from?.id;
        if (!userId) return;
        const session = getSession(userId);
        console.log(`[cmd] User ${userId} triggered run for project ${session.projectName}`);

        if (!session.prdJson || !session.projectDir) {
            return ctx.reply("No PRD ready to run. Use /start to begin a project.");
        }

        if (session.state === State.RUNNING) {
            return ctx.reply("Ralph is already running! Use /progress to check status.");
        }

        const stories = session.prdJson.userStories;
        const abortController = new AbortController();
        updateSession(userId, {
            state: State.RUNNING,
            currentIteration: 0,
            abortController,
        });

        console.log(`[cmd] Ralph loop starting for user ${userId}, project ${session.projectDir}, ${stories.length} stories`);

        await ctx.reply(
            `🚀 *Ralph is starting!*\n` +
            `Stories: ${stories.length}\n\n` +
            "Use /progress to check status, /stop to cancel.",
            { parse_mode: "Markdown" }
        );

        runRalphLoop({
            projectDir: session.projectDir,
            stories,
            signal: abortController.signal,
            onProgress: async (status) => {
                updateSession(userId, {
                    currentIteration: status.iteration,
                    currentStory: status.currentStory
                        ? `${status.currentStory.id}: ${status.currentStory.title}`
                        : null,
                });

                try {
                    await ctx.reply(status.message);
                } catch (err) {
                    console.warn("[cmd] Failed to send progress to user:", err);
                }
            },
        })
            .then(async (result) => {
                updateSession(userId, {
                    state: State.IDLE,
                    completed: result.completed,
                    abortController: null,
                });

                const finalProgress = await getProgress(session.projectDir!);
                const summary = formatProgressForTelegram(finalProgress);

                if (result.completed) {
                    console.log(`[cmd] Ralph completed for user ${userId}, project ${session.projectDir}`);
                    await ctx.reply(`🎉 *Ralph finished successfully!*\n\n${summary}`, {
                        parse_mode: "Markdown",
                    });
                } else {
                    console.log(`[cmd] Ralph stopped after ${result.iterations} stories for user ${userId}`);
                    await ctx.reply(
                        `⚠️ *Ralph stopped after ${result.iterations} stories.*\n\n${summary}`,
                        { parse_mode: "Markdown" }
                    );
                }
            })
            .catch(async (err) => {
                updateSession(userId, {
                    state: State.IDLE,
                    abortController: null,
                });
                const message = err instanceof Error ? err.message : String(err);

                console.error(`[cmd] Ralph fatal error for user ${userId}:`, err);
                await ctx.reply(`❌ Ralph encountered a fatal error: ${message}`);
            });
    });
}
