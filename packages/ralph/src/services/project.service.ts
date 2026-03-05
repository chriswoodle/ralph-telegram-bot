import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, writeFile, copyFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import type { AppConfig } from '../config';
import type { PrdJson, UserStory } from '../types/session.types';
import type { RalphProjectPaths, ProgressResult, ProjectInfo } from '../types/project.types';

const CONTEXT_MAX_CHARS = 4000;

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly configService: ConfigService<AppConfig>) {}

  get projectsDir(): string {
    return this.configService.get('RALPH_PROJECTS_DIR', './projects');
  }

  getRalphProjectPaths(baseDir: string, projectName: string): RalphProjectPaths {
    const projectDir = path.resolve(baseDir, projectName);
    const ralphDir = path.join(projectDir, 'ralph');
    const tasksDir = path.join(ralphDir, 'tasks');

    return {
      projectDir,
      tasksDir,
      archiveDir: path.join(ralphDir, 'archive'),
      progressTxt: path.join(ralphDir, 'progress.txt'),
      gitignore: path.join(projectDir, '.gitignore'),
      prdJson: path.join(ralphDir, 'prd.json'),
      lastBranch: path.join(ralphDir, '.last-branch'),
      prdMarkdown: path.join(tasksDir, `prd-${projectName}.md`),
    };
  }

  private pathsFromProjectDir(projectDir: string): RalphProjectPaths {
    return this.getRalphProjectPaths(path.dirname(projectDir), path.basename(projectDir));
  }

  private progressHeader(): string {
    return [
      `# ${this.configService.get('BOT_NAME', 'Ralph')} Progress Log`,
      `Started: ${new Date().toISOString()}`,
      '---',
      '',
    ].join('\n');
  }

  async initProject(baseDir: string, projectName: string): Promise<string> {
    const paths = this.getRalphProjectPaths(baseDir, projectName);
    this.logger.log(`Initializing project ${projectName} at ${paths.projectDir}`);
    await mkdir(paths.projectDir, { recursive: true });

    execSync('git init', { cwd: paths.projectDir, stdio: 'pipe' });

    await mkdir(paths.tasksDir, { recursive: true });
    await mkdir(paths.archiveDir, { recursive: true });

    await writeFile(paths.progressTxt, this.progressHeader());

    this.logger.log(`Project ${projectName} initialized`);
    return paths.projectDir;
  }

  async writePrdJson(projectDir: string, prdJson: PrdJson): Promise<void> {
    const paths = this.pathsFromProjectDir(projectDir);
    this.logger.log(`Writing prd.json for ${prdJson.project}, ${prdJson.userStories?.length ?? 0} stories`);

    try {
      await access(paths.prdJson);
      const lastBranch = await readFile(paths.lastBranch, 'utf-8').catch(() => '');

      if (
        prdJson.branchName &&
        lastBranch.trim() &&
        prdJson.branchName !== lastBranch.trim()
      ) {
        const date = new Date().toISOString().split('T')[0];
        const folderName = lastBranch.trim().replace(/^ralph\//, '');
        const archiveFolder = path.join(paths.archiveDir, `${date}-${folderName}`);

        await mkdir(archiveFolder, { recursive: true });
        await copyFile(paths.prdJson, path.join(archiveFolder, 'prd.json'));
        try {
          await copyFile(paths.progressTxt, path.join(archiveFolder, 'progress.txt'));
        } catch {
          // progress.txt might not exist
        }

        await writeFile(paths.progressTxt, this.progressHeader());
      }
    } catch {
      // No existing prd.json — first run
    }

    await writeFile(paths.prdJson, JSON.stringify(prdJson, null, 2));

    if (prdJson.branchName) {
      await writeFile(paths.lastBranch, prdJson.branchName);
    }
  }

  async writePrdMarkdown(
    projectDir: string,
    projectName: string,
    markdown: string,
  ): Promise<void> {
    const paths = this.pathsFromProjectDir(projectDir);
    await mkdir(paths.tasksDir, { recursive: true });
    await writeFile(paths.prdMarkdown, markdown);
  }

  async getProgress(projectDir: string): Promise<ProgressResult> {
    const paths = this.pathsFromProjectDir(projectDir);

    try {
      const prd = JSON.parse(await readFile(paths.prdJson, 'utf-8')) as PrdJson;
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
      return { project: 'Unknown', total: 0, done: 0, current: null, stories: [] };
    }
  }

  async getCurrentStory(projectDir: string): Promise<UserStory | null> {
    const paths = this.pathsFromProjectDir(projectDir);
    try {
      const prd = JSON.parse(await readFile(paths.prdJson, 'utf-8')) as PrdJson;
      return (prd.userStories || []).find((s) => !s.passes) || null;
    } catch {
      return null;
    }
  }

  async getProgressLog(projectDir: string): Promise<string> {
    const paths = this.pathsFromProjectDir(projectDir);
    try {
      return await readFile(paths.progressTxt, 'utf-8');
    } catch {
      return 'No progress log found.';
    }
  }

  async ensureProgressFile(projectDir: string): Promise<void> {
    const paths = this.pathsFromProjectDir(projectDir);
    try {
      await access(paths.progressTxt);
    } catch {
      await writeFile(paths.progressTxt, this.progressHeader());
    }
  }

  async listProjects(baseDir: string): Promise<ProjectInfo[]> {
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
      const currentPath = path.join(projectDir, 'ralph', 'prd.json');
      const legacyPath = path.join(projectDir, 'prd.json');

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
          const prd = JSON.parse(await readFile(prdPath, 'utf-8')) as PrdJson;
          projects.push({
            name,
            projectDir,
            description: prd.description || 'No description',
          });
        } catch {
          projects.push({ name, projectDir, description: 'Could not read PRD' });
        }
      }
    }

    return projects;
  }

  async gatherProjectContext(projectDir: string): Promise<string> {
    const paths = this.pathsFromProjectDir(projectDir);
    const sections: string[] = [];

    try {
      const prd = JSON.parse(await readFile(paths.prdJson, 'utf-8')) as PrdJson;
      sections.push(`## Current Feature: ${prd.project}`);
      sections.push(prd.description || '');

      const completed = (prd.userStories || []).filter((s) => s.passes);
      if (completed.length > 0) {
        sections.push('\n### Completed Stories');
        for (const s of completed) {
          sections.push(`- ${s.title}`);
        }
      }

      const pending = (prd.userStories || []).filter((s) => !s.passes);
      if (pending.length > 0) {
        sections.push('\n### Pending Stories');
        for (const s of pending) {
          sections.push(`- ${s.title}`);
        }
      }
    } catch {
      // No current prd.json
    }

    try {
      const progress = await readFile(paths.progressTxt, 'utf-8');
      const patternsMatch = progress.match(/## Codebase Patterns[\s\S]*?(?=\n## |\n---|\Z)/);
      if (patternsMatch) {
        sections.push('\n' + patternsMatch[0].trim());
      }
    } catch {
      // No progress.txt
    }

    try {
      const archiveEntries = await readdir(paths.archiveDir);
      const archiveSummaries: string[] = [];
      for (const entry of archiveEntries) {
        const archivePrdPath = path.join(paths.archiveDir, entry, 'prd.json');
        try {
          const prd = JSON.parse(await readFile(archivePrdPath, 'utf-8')) as PrdJson;
          const storyCount = prd.userStories?.length ?? 0;
          const doneCount = (prd.userStories || []).filter((s) => s.passes).length;
          archiveSummaries.push(
            `- **${prd.project}**: ${prd.description || 'No description'} (${doneCount}/${storyCount} stories done)`,
          );
        } catch {
          // Skip unreadable archives
        }
      }
      if (archiveSummaries.length > 0) {
        sections.push('\n## Previous Features');
        sections.push(...archiveSummaries);
      }
    } catch {
      // No archive dir
    }

    let context = sections.join('\n');
    if (context.length > CONTEXT_MAX_CHARS) {
      context = context.slice(0, CONTEXT_MAX_CHARS - 3) + '...';
    }
    return context;
  }
}
