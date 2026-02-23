import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkflowRouter } from './workflow.router';
import { CommandHandler } from './command.handler';
import { SessionService } from './services/session.service';
import { ProjectService } from './services/project.service';
import { PrdService } from './services/prd.service';
import { FormatService } from './services/format.service';
import { RalphLoopService } from './services/ralph-loop.service';
import { OpenRouterService } from './services/openrouter.service';
import { ResourceLoaderService } from './services/resource-loader.service';
import { ClaudeService } from './services/claude.service';
import { ProjectNameStep } from './steps/project-name.step';
import { ProjectSelectionStep } from './steps/project-selection.step';
import { PrdSummaryStep } from './steps/prd-summary.step';
import { ClarificationsStep } from './steps/clarifications.step';
import { PrdReviewStep } from './steps/prd-review.step';
import { ModificationsStep } from './steps/modifications.step';
import { RunStep } from './steps/run.step';
import { State } from './types/session.types';
import type { PrdJson } from './types/session.types';
import type { WorkflowContext } from './types/workflow.types';
import type { Conversation } from './types/openrouter.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(userId = 1): WorkflowContext & { messages: string[] } {
    const messages: string[] = [];
    return {
        userId,
        messages,
        reply: jest.fn(async (text: string) => { messages.push(text); }),
        replyFormatted: jest.fn(async (text: string) => { messages.push(text); }),
        replySilent: jest.fn(async (text: string) => { messages.push(text); }),
    };
}

const FAKE_CONVERSATION: Conversation = { messages: [{ role: 'system', content: 'test' }] };

const FAKE_PRD_JSON: PrdJson = {
    project: 'test-app',
    branchName: 'ralph/test-app',
    description: 'A test application',
    userStories: [
        {
            id: 'US-1',
            title: 'First story',
            description: 'First story description',
            acceptanceCriteria: ['criterion 1'],
            priority: 1,
            passes: false,
        },
        {
            id: 'US-2',
            title: 'Second story',
            description: 'Second story description',
            acceptanceCriteria: ['criterion 2'],
            priority: 2,
            passes: false,
        },
    ],
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

beforeAll(() => {
    Logger.overrideLogger(false);
});

describe('Workflow Integration', () => {
    let module: TestingModule;
    let workflowRouter: WorkflowRouter;
    let commandHandler: CommandHandler;
    let sessionService: SessionService;
    let projectService: jest.Mocked<ProjectService>;
    let prdService: jest.Mocked<PrdService>;
    let ralphLoopService: jest.Mocked<RalphLoopService>;

    beforeEach(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    load: [() => ({
                        NODE_ENV: 'test',
                        SESSION_STORE_PATH: '/tmp/ralph-test-sessions.json',
                        RALPH_PROJECTS_DIR: '/tmp/ralph-test-projects',
                    })],
                }),
            ],
            providers: [
                SessionService,
                FormatService,
                CommandHandler,
                WorkflowRouter,
                ProjectNameStep,
                ProjectSelectionStep,
                PrdSummaryStep,
                ClarificationsStep,
                PrdReviewStep,
                ModificationsStep,
                RunStep,
                {
                    provide: ProjectService,
                    useValue: {
                        projectsDir: '/tmp/ralph-test-projects',
                        initProject: jest.fn().mockResolvedValue('/tmp/ralph-test-projects/test-app'),
                        writePrdMarkdown: jest.fn().mockResolvedValue(undefined),
                        writePrdJson: jest.fn().mockResolvedValue(undefined),
                        listProjects: jest.fn().mockResolvedValue([]),
                        getProgress: jest.fn().mockResolvedValue({
                            project: 'test-app', total: 2, done: 2, current: null, stories: FAKE_PRD_JSON.userStories,
                        }),
                        getProgressLog: jest.fn().mockResolvedValue('No progress log found.'),
                        gatherProjectContext: jest.fn().mockResolvedValue('existing context'),
                    },
                },
                {
                    provide: PrdService,
                    useValue: {
                        generateClarifyingQuestions: jest.fn().mockResolvedValue({
                            questions: '1. What framework?\n2. Auth needed?',
                            conversation: FAKE_CONVERSATION,
                        }),
                        generatePrd: jest.fn().mockResolvedValue({
                            prd: '# PRD: test-app\n\nA great test app.',
                            conversation: FAKE_CONVERSATION,
                        }),
                        modifyPrd: jest.fn().mockResolvedValue({
                            prd: '# PRD: test-app\n\nModified PRD content.',
                            conversation: FAKE_CONVERSATION,
                        }),
                        convertPrdToJson: jest.fn().mockResolvedValue(FAKE_PRD_JSON),
                        createConversationFromPrd: jest.fn().mockResolvedValue(FAKE_CONVERSATION),
                    },
                },
                {
                    provide: RalphLoopService,
                    useValue: {
                        runRalphLoop: jest.fn().mockResolvedValue({ completed: true, iterations: 2 }),
                    },
                },
                { provide: OpenRouterService, useValue: {} },
                { provide: ResourceLoaderService, useValue: {} },
                { provide: ClaudeService, useValue: {} },
            ],
        }).compile();

        module.useLogger(false);

        // Override onModuleInit to prevent file I/O in tests
        const svc = module.get(SessionService);
        jest.spyOn(svc, 'onModuleInit').mockImplementation(() => {});
        await module.init();

        workflowRouter = module.get(WorkflowRouter);
        commandHandler = module.get(CommandHandler);
        sessionService = module.get(SessionService);
        projectService = module.get(ProjectService) as jest.Mocked<ProjectService>;
        prdService = module.get(PrdService) as jest.Mocked<PrdService>;
        ralphLoopService = module.get(RalphLoopService) as jest.Mocked<RalphLoopService>;
    });

    afterEach(async () => {
        await module.close();
    });

    // -----------------------------------------------------------------------
    // Happy-path: full flow via text input
    // -----------------------------------------------------------------------

    describe('happy path: /start → name → summary → clarifications → approve → run', () => {
        const userId = 42;

        it('walks through the entire workflow', async () => {
            const ctx = createMockContext(userId);

            // Step 1: /start
            await commandHandler.handleStart(ctx);
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_NAME);
            expect(ctx.messages.length).toBeGreaterThan(0);

            // Step 2: provide project name
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'test-app');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(sessionService.getSession(userId).projectName).toBe('test-app');
            expect(projectService.initProject).toHaveBeenCalledWith('/tmp/ralph-test-projects', 'test-app');

            // Step 3: provide PRD summary
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'Build a task management app with drag and drop');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_CLARIFICATIONS);
            expect(sessionService.getSession(userId).prdSummary).toBe('Build a task management app with drag and drop');
            expect(prdService.generateClarifyingQuestions).toHaveBeenCalled();
            expect(ctx.messages.some((m) => m.includes('Clarifying Questions'))).toBe(true);

            // Step 4: answer clarifying questions
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, '1A, 2B');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
            expect(sessionService.getSession(userId).prdMarkdown).toBe('# PRD: test-app\n\nA great test app.');
            expect(prdService.generatePrd).toHaveBeenCalled();
            expect(ctx.messages.some((m) => m.includes('Generated PRD'))).toBe(true);

            // Step 5: approve PRD
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'approve');
            expect(prdService.convertPrdToJson).toHaveBeenCalled();
            expect(projectService.writePrdJson).toHaveBeenCalled();
            expect(sessionService.getSession(userId).prdJson).toEqual(FAKE_PRD_JSON);
            // After converting, state stays REVIEWING_PRD waiting for "run"
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
            expect(ctx.messages.some((m) => m.includes('run'))).toBe(true);

            // Step 6: trigger run via handleRun (which is what adapter calls for "run" text)
            // Make runRalphLoop return a never-resolving promise so state stays RUNNING
            let resolveLoop!: (v: { completed: boolean; iterations: number }) => void;
            ralphLoopService.runRalphLoop.mockReturnValueOnce(
                new Promise((resolve) => { resolveLoop = resolve; }),
            );
            ctx.messages.length = 0;
            await workflowRouter.handleRun(ctx);
            expect(sessionService.getSession(userId).state).toBe(State.RUNNING);
            expect(ralphLoopService.runRalphLoop).toHaveBeenCalled();
            // Clean up: resolve the pending promise to avoid unhandled rejection
            resolveLoop({ completed: true, iterations: 2 });
        });
    });

    // -----------------------------------------------------------------------
    // Happy-path: /start → name → upload .md → approve → run
    // -----------------------------------------------------------------------

    describe('happy path: .md file upload skips clarifications', () => {
        const userId = 43;

        it('goes from upload directly to review', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'upload-project');

            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);

            ctx.messages.length = 0;
            await workflowRouter.handleDocument(ctx, {
                fileName: 'feature.md',
                fileSize: 100,
                fetchContent: async () => '# PRD\n\nUploaded content here.',
            });

            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
            expect(sessionService.getSession(userId).prdMarkdown).toBe('# PRD\n\nUploaded content here.');
            expect(prdService.createConversationFromPrd).toHaveBeenCalled();
            expect(ctx.messages.some((m) => m.includes('Uploaded PRD'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Modification loop: review → modify → review
    // -----------------------------------------------------------------------

    describe('modification loop', () => {
        const userId = 44;

        it('handles "modify:" and returns to REVIEWING_PRD', async () => {
            const ctx = createMockContext(userId);

            // Get to REVIEWING_PRD state
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'mod-project');
            await workflowRouter.handleText(ctx, 'Build something cool');
            await workflowRouter.handleText(ctx, '1A, 2A');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);

            // Request modification
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'modify: add a dark mode section');
            expect(prdService.modifyPrd).toHaveBeenCalled();
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
            expect(sessionService.getSession(userId).prdMarkdown).toBe('# PRD: test-app\n\nModified PRD content.');
            expect(ctx.messages.some((m) => m.includes('Updated PRD'))).toBe(true);
        });

        it('treats unrecognized text in REVIEWING_PRD as modification', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'mod-project-2');
            await workflowRouter.handleText(ctx, 'Build something');
            await workflowRouter.handleText(ctx, '1B');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'please add authentication');
            expect(prdService.modifyPrd).toHaveBeenCalled();
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
        });
    });

    // -----------------------------------------------------------------------
    // Redo: review → redo → AWAITING_PRD_SUMMARY
    // -----------------------------------------------------------------------

    describe('redo from review', () => {
        const userId = 45;

        it('resets back to AWAITING_PRD_SUMMARY', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'redo-project');
            await workflowRouter.handleText(ctx, 'Build a blog');
            await workflowRouter.handleText(ctx, 'answers');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'redo');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(sessionService.getSession(userId).prdMarkdown).toBeNull();
            expect(sessionService.getSession(userId).prdConversation).toBeNull();
            expect(ctx.messages.some((m) => m.includes('start over'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // /feature flow: project selection → PRD
    // -----------------------------------------------------------------------

    describe('/feature flow with project selection', () => {
        const userId = 46;

        it('selects an existing project by number and proceeds to PRD', async () => {
            const ctx = createMockContext(userId);

            projectService.listProjects.mockResolvedValue([
                { name: 'existing-app', projectDir: '/tmp/ralph-test-projects/existing-app', description: 'An existing app' },
            ]);

            await commandHandler.handleFeature(ctx);
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_SELECTION);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, '1');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(sessionService.getSession(userId).projectName).toBe('existing-app');
            expect(sessionService.getSession(userId).projectContext).toBe('existing context');
            expect(projectService.gatherProjectContext).toHaveBeenCalled();
        });

        it('selects an existing project by name', async () => {
            const ctx = createMockContext(userId);

            projectService.listProjects.mockResolvedValue([
                { name: 'my-saas', projectDir: '/tmp/ralph-test-projects/my-saas', description: 'SaaS app' },
            ]);

            await commandHandler.handleFeature(ctx);
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'my-saas');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(sessionService.getSession(userId).projectName).toBe('my-saas');
        });

        it('rejects invalid selection', async () => {
            const ctx = createMockContext(userId);

            projectService.listProjects.mockResolvedValue([
                { name: 'only-one', projectDir: '/tmp/only-one', description: 'The only one' },
            ]);

            await commandHandler.handleFeature(ctx);
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, '99');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_SELECTION);
            expect(ctx.messages.some((m) => m.includes('Could not match'))).toBe(true);
        });

        it('handles /feature with no projects', async () => {
            const ctx = createMockContext(userId);

            projectService.listProjects.mockResolvedValue([]);
            await commandHandler.handleFeature(ctx);
            // State should remain IDLE since reset happened but no projects found
            expect(ctx.messages.some((m) => m.includes('No existing projects'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Project name validation
    // -----------------------------------------------------------------------

    describe('project name validation', () => {
        const userId = 47;

        it('rejects names shorter than 2 characters', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'a');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_NAME);
            expect(ctx.messages.some((m) => m.includes('Invalid project name'))).toBe(true);
        });

        it('sanitizes project names to kebab-case', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'My Cool App!');
            expect(sessionService.getSession(userId).projectName).toBe('my-cool-app');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
        });
    });

    // -----------------------------------------------------------------------
    // IDLE state: text sent with no active workflow
    // -----------------------------------------------------------------------

    describe('IDLE state handling', () => {
        const userId = 48;

        it('prompts user to use /start when text is sent in IDLE state', async () => {
            const ctx = createMockContext(userId);
            await workflowRouter.handleText(ctx, 'random text');
            expect(ctx.messages.some((m) => m.includes('/start'))).toBe(true);
        });

        it('rejects document uploads outside of PRD summary step', async () => {
            const ctx = createMockContext(userId);
            await workflowRouter.handleDocument(ctx, {
                fileName: 'test.md',
                fileSize: 100,
                fetchContent: async () => 'content',
            });
            expect(ctx.messages.some((m) => m.includes('only accept'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Document upload validation
    // -----------------------------------------------------------------------

    describe('document upload validation', () => {
        const userId = 49;

        it('rejects non-.md files', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'doc-project');

            ctx.messages.length = 0;
            await workflowRouter.handleDocument(ctx, {
                fileName: 'feature.txt',
                fileSize: 100,
                fetchContent: async () => 'content',
            });

            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(ctx.messages.some((m) => m.includes('.md'))).toBe(true);
        });

        it('rejects files that are too large', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'large-file-project');

            ctx.messages.length = 0;
            await workflowRouter.handleDocument(ctx, {
                fileName: 'huge.md',
                fileSize: 600 * 1024, // 600 KB > 512 KB limit
                fetchContent: async () => 'content',
            });

            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(ctx.messages.some((m) => m.includes('too large'))).toBe(true);
        });

        it('rejects empty files', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'empty-file-project');

            ctx.messages.length = 0;
            await workflowRouter.handleDocument(ctx, {
                fileName: 'empty.md',
                fileSize: 10,
                fetchContent: async () => '   ',
            });

            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(ctx.messages.some((m) => m.includes('empty'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // PRD review: approve synonyms
    // -----------------------------------------------------------------------

    describe('PRD review approve synonyms', () => {
        const userId = 50;

        async function getToReviewState(ctx: ReturnType<typeof createMockContext>) {
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'synonym-test');
            await workflowRouter.handleText(ctx, 'build something');
            await workflowRouter.handleText(ctx, 'answers');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
        }

        it.each(['yes', 'ok', 'lgtm', 'APPROVE', 'Ok'])('accepts "%s" as approval', async (word) => {
            const ctx = createMockContext(userId);
            // Reset session for each iteration
            sessionService.resetSession(userId);
            await getToReviewState(ctx);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, word);
            expect(prdService.convertPrdToJson).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Command handlers
    // -----------------------------------------------------------------------

    describe('command handlers', () => {
        const userId = 51;

        it('/status shows current state', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleStatus(ctx);
            expect(ctx.messages.some((m) => m.includes('Session Status'))).toBe(true);
            expect(ctx.messages.some((m) => m.includes('IDLE'))).toBe(true);
        });

        it('/help shows commands', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleHelp(ctx);
            expect(ctx.messages.some((m) => m.includes('/start'))).toBe(true);
            expect(ctx.messages.some((m) => m.includes('/stop'))).toBe(true);
        });

        it('/stop when not running', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleStop(ctx);
            expect(ctx.messages.some((m) => m.includes('not currently running'))).toBe(true);
        });

        it('/progress with no active project', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleProgress(ctx);
            expect(ctx.messages.some((m) => m.includes('No active project'))).toBe(true);
        });

        it('/log with no active project', async () => {
            const ctx = createMockContext(userId);
            await commandHandler.handleLog(ctx);
            expect(ctx.messages.some((m) => m.includes('No active project'))).toBe(true);
        });

        it('/new resets and starts fresh', async () => {
            const ctx = createMockContext(userId);
            // First get into some state
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'old-project');
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);

            // /new resets everything
            ctx.messages.length = 0;
            await commandHandler.handleNew(ctx);
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_NAME);
            expect(sessionService.getSession(userId).projectName).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // RunStep: text while running
    // -----------------------------------------------------------------------

    describe('text while running', () => {
        const userId = 52;

        it('tells user Ralph is busy when text is sent in RUNNING state', async () => {
            const ctx = createMockContext(userId);

            // Manually put session into RUNNING state
            sessionService.updateSession(userId, { state: State.RUNNING });

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'hello?');
            expect(ctx.messages.some((m) => m.includes('currently running'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // RunStep: executeRun guards
    // -----------------------------------------------------------------------

    describe('RunStep guards', () => {
        const userId = 53;

        it('rejects run with no PRD', async () => {
            const ctx = createMockContext(userId);
            await workflowRouter.handleRun(ctx);
            expect(ctx.messages.some((m) => m.includes('No PRD ready'))).toBe(true);
        });

        it('rejects run when already running', async () => {
            const ctx = createMockContext(userId);

            // Set up a running state
            sessionService.updateSession(userId, {
                state: State.RUNNING,
                prdJson: FAKE_PRD_JSON,
                projectDir: '/tmp/test',
            });

            ctx.messages.length = 0;
            await workflowRouter.handleRun(ctx);
            expect(ctx.messages.some((m) => m.includes('already running'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Session isolation: different users don't interfere
    // -----------------------------------------------------------------------

    describe('session isolation between users', () => {
        it('different users have independent sessions', async () => {
            const ctx1 = createMockContext(100);
            const ctx2 = createMockContext(200);

            await commandHandler.handleStart(ctx1);
            expect(sessionService.getSession(100).state).toBe(State.AWAITING_PROJECT_NAME);
            expect(sessionService.getSession(200).state).toBe(State.IDLE);

            await commandHandler.handleStart(ctx2);
            await workflowRouter.handleText(ctx2, 'user-two-project');
            expect(sessionService.getSession(200).state).toBe(State.AWAITING_PRD_SUMMARY);
            expect(sessionService.getSession(100).state).toBe(State.AWAITING_PROJECT_NAME);
        });
    });

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    describe('error handling', () => {
        const userId = 54;

        it('handles project init failure gracefully', async () => {
            const ctx = createMockContext(userId);
            projectService.initProject.mockRejectedValueOnce(new Error('disk full'));

            await commandHandler.handleStart(ctx);
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'fail-project');
            expect(ctx.messages.some((m) => m.includes('disk full'))).toBe(true);
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PROJECT_NAME);
        });

        it('handles clarifying questions generation failure', async () => {
            const ctx = createMockContext(userId);
            prdService.generateClarifyingQuestions.mockRejectedValueOnce(new Error('API down'));

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'api-fail-project');
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'some feature');
            expect(ctx.messages.some((m) => m.includes('API down'))).toBe(true);
            expect(sessionService.getSession(userId).state).toBe(State.AWAITING_PRD_SUMMARY);
        });

        it('handles PRD generation failure', async () => {
            const ctx = createMockContext(userId);
            prdService.generatePrd.mockRejectedValueOnce(new Error('timeout'));

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'prd-fail-project');
            await workflowRouter.handleText(ctx, 'feature description');
            // Now in AWAITING_CLARIFICATIONS
            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'answers');
            expect(ctx.messages.some((m) => m.includes('timeout'))).toBe(true);
        });

        it('handles modification failure and stays in REVIEWING_PRD', async () => {
            const ctx = createMockContext(userId);
            prdService.modifyPrd.mockRejectedValueOnce(new Error('modification failed'));

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'mod-fail-project');
            await workflowRouter.handleText(ctx, 'build app');
            await workflowRouter.handleText(ctx, 'answers');
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'modify: something');
            expect(ctx.messages.some((m) => m.includes('modification failed'))).toBe(true);
            // Should recover back to REVIEWING_PRD
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
        });

        it('handles PRD JSON conversion failure', async () => {
            const ctx = createMockContext(userId);
            prdService.convertPrdToJson.mockRejectedValueOnce(new Error('invalid json'));

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'json-fail-project');
            await workflowRouter.handleText(ctx, 'build app');
            await workflowRouter.handleText(ctx, 'answers');

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, 'approve');
            expect(ctx.messages.some((m) => m.includes('invalid json'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Session history tracking
    // -----------------------------------------------------------------------

    describe('session history', () => {
        const userId = 55;

        it('records state transitions in history', async () => {
            const ctx = createMockContext(userId);

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'history-project');
            await workflowRouter.handleText(ctx, 'feature desc');

            const history = sessionService.getSessionHistory(userId);
            // Should have: IDLE→AWAITING_PROJECT_NAME, name+state, summary+state
            expect(history.length).toBeGreaterThanOrEqual(3);

            const states = history.map((h) => h.updates.state).filter(Boolean);
            expect(states).toContain(State.AWAITING_PROJECT_NAME);
            expect(states).toContain(State.AWAITING_PRD_SUMMARY);
            expect(states).toContain(State.AWAITING_CLARIFICATIONS);
        });

        it('/debug shows session history', async () => {
            const ctx = createMockContext(userId);
            sessionService.resetSession(userId);

            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'debug-project');

            ctx.messages.length = 0;
            await commandHandler.handleDebug(ctx);
            expect(ctx.messages.some((m) => m.includes('Session Debugger'))).toBe(true);
            expect(ctx.messages.some((m) => m.includes('AWAITING_PROJECT_NAME'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // /stop aborts running loop
    // -----------------------------------------------------------------------

    describe('/stop command', () => {
        const userId = 56;

        it('aborts a running session', async () => {
            const ctx = createMockContext(userId);

            const abortController = new AbortController();
            sessionService.updateSession(userId, {
                state: State.RUNNING,
                abortController,
            });

            await commandHandler.handleStop(ctx);
            expect(abortController.signal.aborted).toBe(true);
            expect(ctx.messages.some((m) => m.includes('Stopping'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // /progress and /log with active project
    // -----------------------------------------------------------------------

    describe('/progress and /log with active project', () => {
        const userId = 57;

        it('/progress shows story status', async () => {
            const ctx = createMockContext(userId);
            sessionService.updateSession(userId, {
                projectDir: '/tmp/ralph-test-projects/test-app',
                projectName: 'test-app',
            });

            await commandHandler.handleProgress(ctx);
            expect(projectService.getProgress).toHaveBeenCalled();
            expect(ctx.messages.length).toBeGreaterThan(0);
        });

        it('/log shows progress log', async () => {
            const ctx = createMockContext(userId);
            sessionService.updateSession(userId, {
                projectDir: '/tmp/ralph-test-projects/test-app',
                projectName: 'test-app',
            });

            await commandHandler.handleLog(ctx);
            expect(projectService.getProgressLog).toHaveBeenCalled();
            expect(ctx.messages.some((m) => m.includes('Progress Log'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // /status with running state shows story progress
    // -----------------------------------------------------------------------

    describe('/status while running', () => {
        const userId = 58;

        it('shows story progress info', async () => {
            const ctx = createMockContext(userId);
            sessionService.updateSession(userId, {
                state: State.RUNNING,
                projectName: 'running-project',
                projectDir: '/tmp/running',
                prdJson: FAKE_PRD_JSON,
                currentIteration: 1,
                currentStory: 'US-1: First story',
            });

            await commandHandler.handleStatus(ctx);
            expect(ctx.messages.some((m) => m.includes('Story: 1/2'))).toBe(true);
            expect(ctx.messages.some((m) => m.includes('US-1: First story'))).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Alternative modify prefixes
    // -----------------------------------------------------------------------

    describe('alternative modify prefixes', () => {
        const userId = 59;

        async function getToReview(ctx: ReturnType<typeof createMockContext>) {
            sessionService.resetSession(userId);
            await commandHandler.handleStart(ctx);
            await workflowRouter.handleText(ctx, 'prefix-test');
            await workflowRouter.handleText(ctx, 'feature');
            await workflowRouter.handleText(ctx, 'answers');
        }

        it.each(['change: something', 'edit: something'])('handles "%s" prefix', async (text) => {
            const ctx = createMockContext(userId);
            await getToReview(ctx);

            ctx.messages.length = 0;
            await workflowRouter.handleText(ctx, text);
            expect(prdService.modifyPrd).toHaveBeenCalled();
            expect(sessionService.getSession(userId).state).toBe(State.REVIEWING_PRD);
        });
    });
});
