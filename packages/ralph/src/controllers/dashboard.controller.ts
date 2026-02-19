import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionService } from '../services/session.service';
import { ProjectService } from '../services/project.service';
import {
  HealthResponseDto,
  DashboardStatusResponseDto,
  SessionListResponseDto,
  SessionDetailResponseDto,
  ErrorResponseDto,
  ProjectListResponseDto,
  ProjectDetailResponseDto,
  ProjectLogResponseDto,
  UserIdParamDto,
  ProjectNameParamDto,
} from '../dto/dashboard.dto';

@ApiTags('dashboard')
@Controller('api')
export class DashboardController {
  private readonly startTime = Date.now();

  constructor(
    private readonly sessionService: SessionService,
    private readonly projectService: ProjectService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Dashboard status overview' })
  @ApiOkResponse({ type: DashboardStatusResponseDto })
  async getStatus(): Promise<DashboardStatusResponseDto> {
    const sessions = this.sessionService.getAllSessions();
    const projects = await this.projectService.listProjects(this.projectService.projectsDir);

    let runningSessions = 0;
    for (const [, session] of sessions) {
      if (session.state === 'RUNNING') runningSessions++;
    }

    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      sessions: {
        total: sessions.size,
        running: runningSessions,
      },
      projects: {
        total: projects.length,
      },
    };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all active sessions' })
  @ApiOkResponse({ type: SessionListResponseDto })
  getSessions(): SessionListResponseDto {
    const sessions = this.sessionService.getAllSessions();
    const items = [];

    for (const [userId, session] of sessions) {
      items.push({
        userId,
        state: session.state,
        projectName: session.projectName,
        currentIteration: session.currentIteration,
        totalStories: session.prdJson?.userStories.length ?? 0,
        currentStory: session.currentStory,
        completed: session.completed,
        startedAt: session.startedAt,
        estimatedEndAt: session.estimatedEndAt,
      });
    }

    return { items };
  }

  @Get('sessions/:userId')
  @ApiOperation({ summary: 'Get session detail by user ID' })
  @ApiOkResponse({ type: SessionDetailResponseDto })
  getSession(@Param() params: UserIdParamDto): SessionDetailResponseDto | ErrorResponseDto {
    const id = Number(params.userId);
    if (Number.isNaN(id)) {
      return { error: 'Invalid user ID' };
    }

    const sessions = this.sessionService.getAllSessions();
    const session = sessions.get(id);
    if (!session) {
      return { error: 'Session not found' };
    }

    const history = this.sessionService.getSessionHistory(id);

    return {
      userId: id,
      state: session.state,
      projectName: session.projectName,
      projectDir: session.projectDir,
      currentIteration: session.currentIteration,
      totalStories: session.prdJson?.userStories.length ?? 0,
      currentStory: session.currentStory,
      completed: session.completed,
      startedAt: session.startedAt,
      estimatedEndAt: session.estimatedEndAt,
      prdJson: session.prdJson,
      recentHistory: history.slice(-10).map((h) => ({
        timestamp: h.timestamp,
        updates: Object.keys(h.updates).filter((k) => k !== 'abortController'),
        snapshotState: h.snapshot.state,
      })),
    };
  }

  @Get('projects')
  @ApiOperation({ summary: 'List all projects with progress' })
  @ApiOkResponse({ type: ProjectListResponseDto })
  async getProjects(): Promise<ProjectListResponseDto> {
    const projects = await this.projectService.listProjects(this.projectService.projectsDir);
    const items = [];

    for (const project of projects) {
      const progress = await this.projectService.getProgress(project.projectDir);
      items.push({
        name: project.name,
        description: project.description,
        total: progress.total,
        done: progress.done,
        percent: progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0,
      });
    }

    return { items };
  }

  @Get('projects/:name')
  @ApiOperation({ summary: 'Get project detail with full progress' })
  @ApiOkResponse({ type: ProjectDetailResponseDto })
  async getProject(@Param() params: ProjectNameParamDto): Promise<ProjectDetailResponseDto | ErrorResponseDto> {
    const projects = await this.projectService.listProjects(this.projectService.projectsDir);
    const project = projects.find((p) => p.name === params.name);

    if (!project) {
      return { error: 'Project not found' };
    }

    const progress = await this.projectService.getProgress(project.projectDir);

    return {
      name: project.name,
      description: project.description,
      progress: {
        total: progress.total,
        done: progress.done,
        percent: progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0,
        current: progress.current,
        stories: progress.stories,
      },
    };
  }

  @Get('projects/:name/log')
  @ApiOperation({ summary: 'Get project progress log' })
  @ApiOkResponse({ type: ProjectLogResponseDto })
  async getProjectLog(@Param() params: ProjectNameParamDto): Promise<ProjectLogResponseDto | ErrorResponseDto> {
    const projects = await this.projectService.listProjects(this.projectService.projectsDir);
    const project = projects.find((p) => p.name === params.name);

    if (!project) {
      return { error: 'Project not found' };
    }

    const log = await this.projectService.getProgressLog(project.projectDir);
    return { name: project.name, log };
  }
}
