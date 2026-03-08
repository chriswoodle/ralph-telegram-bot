import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ExecutionService } from '../services/execution.service';

const ConfigureExecutionSchema = z.object({
  taskSetId: z.string().uuid(),
  parallelCount: z.number().int().min(1).max(10),
});

class ConfigureExecutionDto extends createZodDto(ConfigureExecutionSchema) {}

const PickWinnerSchema = z.object({
  worktreeId: z.string().min(1),
});

class PickWinnerDto extends createZodDto(PickWinnerSchema) {}

@Controller('api/projects/:projectId/executions')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post('configure')
  async configure(
    @Param('projectId') projectId: string,
    @Body() body: ConfigureExecutionDto,
  ) {
    return this.executionService.configureExecution(
      projectId,
      body.taskSetId,
      body.parallelCount,
    );
  }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.executionService.listExecutions(projectId);
  }

  @Get(':executionId')
  async get(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.executionService.getExecution(projectId, executionId);
  }

  @Post(':executionId/start')
  async start(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.executionService.startExecution(projectId, executionId);
  }

  @Post(':executionId/abort')
  async abort(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.executionService.abortExecution(projectId, executionId);
  }

  @Post(':executionId/pick-winner')
  async pickWinner(
    @Param('projectId') projectId: string,
    @Param('executionId') executionId: string,
    @Body() body: PickWinnerDto,
  ) {
    return this.executionService.pickWinner(
      projectId,
      executionId,
      body.worktreeId,
    );
  }
}
