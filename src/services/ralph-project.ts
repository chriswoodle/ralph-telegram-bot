import { mkdir, readFile, readdir, writeFile, copyFile, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import type { PrdJson, UserStory } from "./session.js";

export interface RalphProjectPaths {
    projectDir: string;
    tasksDir: string;
    archiveDir: string;
    progressTxt: string;
    gitignore: string;
    prdJson: string;
    lastBranch: string;
    prdMarkdown: string;
}

export interface ProgressResult {
    project: string;
    total: number;
    done: number;
    current: UserStory | null;
    stories: UserStory[];
}

function progressHeader(): string {
    return [
        "# Ralph Progress Log",
        `Started: ${new Date().toISOString()}`,
        "---",
        "",
    ].join("\n");
}

/**
 * Returns all paths for a Ralph project. Does not create any folders or files.
 */
export function getRalphProjectPaths(baseDir: string, projectName: string): RalphProjectPaths {
    const projectDir = path.resolve(baseDir, projectName);
    const ralphDir = path.join(projectDir, "ralph");
    const tasksDir = path.join(ralphDir, "tasks");

    return {
        projectDir,
        tasksDir,
        archiveDir: path.join(ralphDir, "archive"),
        progressTxt: path.join(ralphDir, "progress.txt"),
        gitignore: path.join(projectDir, ".gitignore"),
        prdJson: path.join(ralphDir, "prd.json"),
        lastBranch: path.join(ralphDir, ".last-branch"),
        prdMarkdown: path.join(tasksDir, `prd-${projectName}.md`),
    };
}

function pathsFromProjectDir(projectDir: string): RalphProjectPaths {
    return getRalphProjectPaths(path.dirname(projectDir), path.basename(projectDir));
}

export async function initProject(baseDir: string, projectName: string): Promise<string> {
    const paths = getRalphProjectPaths(baseDir, projectName);
    console.log(`[ralph] Initializing project ${projectName} at ${paths.projectDir}`);
    await mkdir(paths.projectDir, { recursive: true });

    execSync("git init", { cwd: paths.projectDir, stdio: "pipe" });

    await mkdir(paths.tasksDir, { recursive: true });
    await mkdir(paths.archiveDir, { recursive: true });

    await writeFile(paths.progressTxt, progressHeader());

    console.log(`[ralph] Project ${projectName} initialized`);
    return paths.projectDir;
}

export async function writePrdJson(projectDir: string, prdJson: PrdJson): Promise<void> {
    const paths = pathsFromProjectDir(projectDir);
    console.log(`[ralph] Writing prd.json for ${prdJson.project}, ${prdJson.userStories?.length ?? 0} stories`);

    try {
        await access(paths.prdJson);
        const lastBranch = await readFile(paths.lastBranch, "utf-8").catch(() => "");

        // Archive when branch changed (like ralph.sh: CURRENT_BRANCH != LAST_BRANCH)
        if (
            prdJson.branchName &&
            lastBranch.trim() &&
            prdJson.branchName !== lastBranch.trim()
        ) {
            const date = new Date().toISOString().split("T")[0];
            const folderName = lastBranch.trim().replace(/^ralph\//, "");
            const archiveFolder = path.join(paths.archiveDir, `${date}-${folderName}`);

            await mkdir(archiveFolder, { recursive: true });
            await copyFile(paths.prdJson, path.join(archiveFolder, "prd.json"));
            try {
                await copyFile(paths.progressTxt, path.join(archiveFolder, "progress.txt"));
            } catch {
                // progress.txt might not exist
            }

            await writeFile(paths.progressTxt, progressHeader());
        }
    } catch {
        // No existing prd.json — first run
    }

    await writeFile(paths.prdJson, JSON.stringify(prdJson, null, 2));

    if (prdJson.branchName) {
        await writeFile(paths.lastBranch, prdJson.branchName);
    }
}

export async function writePrdMarkdown(
    projectDir: string,
    projectName: string,
    markdown: string
): Promise<void> {
    const paths = pathsFromProjectDir(projectDir);
    await mkdir(paths.tasksDir, { recursive: true });
    await writeFile(paths.prdMarkdown, markdown);
}

export async function getProgress(projectDir: string): Promise<ProgressResult> {
    const paths = pathsFromProjectDir(projectDir);

    try {
        const prd = JSON.parse(await readFile(paths.prdJson, "utf-8")) as PrdJson;
        const stories = prd.userStories || [];
        const done = stories.filter((s) => s.passes).length;
        const current = stories.find((s) => !s.passes) || null;

        return {
            project: prd.project,
            total: stories.length,
            done,
            current,
            stories,
        };
    } catch {
        return { project: "Unknown", total: 0, done: 0, current: null, stories: [] };
    }
}

export async function getCurrentStory(projectDir: string): Promise<UserStory | null> {
    const paths = pathsFromProjectDir(projectDir);
    try {
        const prd = JSON.parse(await readFile(paths.prdJson, "utf-8")) as PrdJson;
        return (prd.userStories || []).find((s) => !s.passes) || null;
    } catch {
        return null;
    }
}

export async function getProgressLog(projectDir: string): Promise<string> {
    const paths = pathsFromProjectDir(projectDir);
    try {
        return await readFile(paths.progressTxt, "utf-8");
    } catch {
        return "No progress log found.";
    }
}

export async function ensureProgressFile(projectDir: string): Promise<void> {
    const paths = pathsFromProjectDir(projectDir);
    try {
        await access(paths.progressTxt);
    } catch {
        await writeFile(paths.progressTxt, progressHeader());
    }
}

// ── Project listing & context ────────────────────────────────────────

export interface ProjectInfo {
    name: string;
    projectDir: string;
    description: string;
}

/**
 * Scans the projects directory and returns info for each project that has a prd.json.
 * Handles both layouts: ralph/prd.json (current) and prd.json at project root (legacy).
 */
export async function listProjects(baseDir: string): Promise<ProjectInfo[]> {
    const resolved = path.resolve(baseDir);
    let entries: string[];
    try {
        entries = await readdir(resolved);
    } catch {
        return [];
    }

    const projects: ProjectInfo[] = [];

    for (const name of entries) {
        const projectDir = path.join(resolved, name);
        // Current layout: ralph/prd.json
        const currentPath = path.join(projectDir, "ralph", "prd.json");
        // Legacy layout: prd.json at project root
        const legacyPath = path.join(projectDir, "prd.json");

        let prdPath: string | null = null;
        try {
            await access(currentPath);
            prdPath = currentPath;
        } catch {
            try {
                await access(legacyPath);
                prdPath = legacyPath;
            } catch {
                // No prd.json in either location
            }
        }

        if (prdPath) {
            try {
                const prd = JSON.parse(await readFile(prdPath, "utf-8")) as PrdJson;
                projects.push({
                    name,
                    projectDir,
                    description: prd.description || "No description",
                });
            } catch {
                projects.push({ name, projectDir, description: "Could not read PRD" });
            }
        }
    }

    return projects;
}

const CONTEXT_MAX_CHARS = 4000;

/**
 * Reads existing project state and returns a markdown context string.
 * Includes current PRD description, completed stories, codebase patterns from
 * progress.txt, and archived feature PRD summaries.
 */
export async function gatherProjectContext(projectDir: string): Promise<string> {
    const paths = pathsFromProjectDir(projectDir);
    const sections: string[] = [];

    // Current PRD info
    try {
        const prd = JSON.parse(await readFile(paths.prdJson, "utf-8")) as PrdJson;
        sections.push(`## Current Feature: ${prd.project}`);
        sections.push(prd.description || "");

        const completed = (prd.userStories || []).filter((s) => s.passes);
        if (completed.length > 0) {
            sections.push("\n### Completed Stories");
            for (const s of completed) {
                sections.push(`- ${s.title}`);
            }
        }

        const pending = (prd.userStories || []).filter((s) => !s.passes);
        if (pending.length > 0) {
            sections.push("\n### Pending Stories");
            for (const s of pending) {
                sections.push(`- ${s.title}`);
            }
        }
    } catch {
        // No current prd.json
    }

    // Codebase patterns from progress.txt
    try {
        const progress = await readFile(paths.progressTxt, "utf-8");
        const patternsMatch = progress.match(/## Codebase Patterns[\s\S]*?(?=\n## |\n---|\Z)/);
        if (patternsMatch) {
            sections.push("\n" + patternsMatch[0].trim());
        }
    } catch {
        // No progress.txt
    }

    // Archived feature PRDs
    try {
        const archiveEntries = await readdir(paths.archiveDir);
        const archiveSummaries: string[] = [];
        for (const entry of archiveEntries) {
            const archivePrdPath = path.join(paths.archiveDir, entry, "prd.json");
            try {
                const prd = JSON.parse(await readFile(archivePrdPath, "utf-8")) as PrdJson;
                const storyCount = prd.userStories?.length ?? 0;
                const doneCount = (prd.userStories || []).filter((s) => s.passes).length;
                archiveSummaries.push(
                    `- **${prd.project}**: ${prd.description || "No description"} (${doneCount}/${storyCount} stories done)`
                );
            } catch {
                // Skip unreadable archives
            }
        }
        if (archiveSummaries.length > 0) {
            sections.push("\n## Previous Features");
            sections.push(...archiveSummaries);
        }
    } catch {
        // No archive dir
    }

    let context = sections.join("\n");
    if (context.length > CONTEXT_MAX_CHARS) {
        context = context.slice(0, CONTEXT_MAX_CHARS - 3) + "...";
    }
    return context;
}
