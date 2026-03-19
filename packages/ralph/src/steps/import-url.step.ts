import { Injectable, Logger } from '@nestjs/common';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import { State } from '../types/session.types';
import type { StepHandler, WorkflowContext } from '../types/workflow.types';

const SSH_URL_REGEX = /^git@[\w.-]+:[\w./-]+\.git$/;
const CLONE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class ImportUrlStep implements StepHandler {
    private readonly logger = new Logger(ImportUrlStep.name);
    readonly state = State.AWAITING_IMPORT_URL;

    constructor(
        private readonly sessionService: SessionService,
        private readonly projectService: ProjectService,
    ) {}

    async handleText(ctx: WorkflowContext, text: string): Promise<void> {
        const url = text.trim();

        if (!SSH_URL_REGEX.test(url)) {
            await ctx.replyFormatted(
                '❌ Invalid Git SSH URL format.\n\n' +
                'Please provide a valid SSH URL in this format:\n' +
                '`git@github.com:username/repo-name.git`\n\n' +
                '_Make sure it starts with `git@` and ends with `.git`_',
            );
            return;
        }

        // Extract repo name from SSH URL (e.g., git@github.com:user/repo-name.git -> repo-name)
        const repoName = url.split('/').pop()!.replace(/\.git$/, '');

        // Check if project directory already exists
        const projectDir = path.resolve(this.projectService.projectsDir, repoName);
        try {
            await access(projectDir);
            this.logger.warn(`Import rejected: project directory already exists at ${projectDir}`);
            await ctx.replyFormatted(
                '❌ A project with this name already exists. Please use a different repository or rename first.',
            );
            return;
        } catch {
            // Directory doesn't exist — safe to proceed
        }

        this.logger.log(`User ${ctx.userId} provided import URL: ${url} (repo: ${repoName})`);

        await ctx.replyFormatted(
            `⏳ Cloning repository \`${repoName}\`...\n` +
            '_This may take a few minutes for large repositories._',
        );

        try {
            await this.cloneRepository(url, projectDir);
        } catch (error) {
            // Clean up partial clone on failure
            await rm(projectDir, { recursive: true, force: true }).catch(() => {});

            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Clone failed for ${url}: ${message}`);

            if (message.includes('timed out')) {
                await ctx.replyFormatted(
                    '❌ Clone timed out after 5 minutes. The repository may be too large or the server is unresponsive.',
                );
            } else if (
                message.includes('Permission denied') ||
                message.includes('Host key verification failed') ||
                message.includes('Could not read from remote repository')
            ) {
                await ctx.replyFormatted(
                    '❌ Authentication failed. Please check that:\n' +
                    '• The SSH URL is correct\n' +
                    '• The bot server has SSH access to this repository\n' +
                    '• The SSH key is added to your Git hosting provider',
                );
            } else {
                await ctx.replyFormatted(
                    `❌ Failed to clone repository.\n\nError: \`${message}\``,
                );
            }
            return;
        }

        this.logger.log(`Successfully cloned ${url} to ${projectDir}`);

        // Validate the cloned repository
        const warnings = await this.validateRepository(projectDir);

        // Create minimal prd.json for ralph project detection
        await this.createPrdJson(projectDir, repoName, url);

        this.sessionService.updateSession(ctx.userId, {
            state: State.IDLE,
            projectName: repoName,
            projectDir,
        });

        let successMsg =
            `✅ Repository imported successfully!\n` +
            `📦 Project: *${repoName}*\n` +
            `📁 Location: \`${projectDir}\``;

        if (warnings.length > 0) {
            successMsg += `\n\n⚠️ Warnings:\n${warnings.map((w) => `• ${w}`).join('\n')}`;
        }

        await ctx.replyFormatted(successMsg);
    }

    private async validateRepository(projectDir: string): Promise<string[]> {
        const warnings: string[] = [];

        // Verify .git directory exists (valid git repo)
        try {
            await access(path.join(projectDir, '.git'));
        } catch {
            warnings.push('Not a valid Git repository (.git directory missing)');
        }

        // Check for common dependency/project files
        const dependencyFiles = [
            { file: 'package.json', label: 'Node.js (package.json)' },
            { file: 'Cargo.toml', label: 'Rust (Cargo.toml)' },
            { file: 'go.mod', label: 'Go (go.mod)' },
            { file: 'requirements.txt', label: 'Python (requirements.txt)' },
            { file: 'pyproject.toml', label: 'Python (pyproject.toml)' },
            { file: 'pom.xml', label: 'Java/Maven (pom.xml)' },
            { file: 'build.gradle', label: 'Java/Gradle (build.gradle)' },
            { file: 'Gemfile', label: 'Ruby (Gemfile)' },
            { file: 'composer.json', label: 'PHP (composer.json)' },
        ];

        let foundAny = false;
        for (const { file } of dependencyFiles) {
            try {
                await access(path.join(projectDir, file));
                foundAny = true;
                break;
            } catch {
                // File not found, continue checking
            }
        }

        if (!foundAny) {
            warnings.push(
                'No common dependency file found (e.g., package.json, Cargo.toml, go.mod). ' +
                'This repository may need manual configuration.',
            );
        }

        return warnings;
    }

    private async createPrdJson(projectDir: string, repoName: string, repoUrl: string): Promise<void> {
        const prd = {
            name: repoName,
            repoUrl,
            importedAt: new Date().toISOString(),
        };
        const ralphDir = path.join(projectDir, 'ralph');
        await mkdir(ralphDir, { recursive: true });
        const prdPath = path.join(ralphDir, 'prd.json');
        await writeFile(prdPath, JSON.stringify(prd, null, 2) + '\n', 'utf-8');
        this.logger.log(`Created prd.json at ${prdPath}`);
    }

    private cloneRepository(url: string, targetDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proc = spawn('git', ['clone', '--progress', url, targetDir], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const timeout = setTimeout(() => {
                proc.kill('SIGTERM');
                reject(new Error('Clone timed out after 5 minutes'));
            }, CLONE_TIMEOUT_MS);

            let stderr = '';
            proc.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(stderr.trim() || `git clone exited with code ${code}`));
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
}
