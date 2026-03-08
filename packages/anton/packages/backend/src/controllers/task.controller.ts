import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { TaskBuildingService } from '../services/task-building.service';

const GenerateTasksSchema = z.object({
  prdId: z.string().uuid(),
});

class GenerateTasksDto extends createZodDto(GenerateTasksSchema) {}

const EditStorySchema = z.object({
  editPrompt: z.string().min(1),
});

class EditStoryDto extends createZodDto(EditStorySchema) {}

const ReorderStoriesSchema = z.object({
  storyIds: z.array(z.string()).min(1),
});

class ReorderStoriesDto extends createZodDto(ReorderStoriesSchema) {}

@Controller('api/projects/:projectId/tasks')
export class TaskController {
  constructor(private readonly taskBuildingService: TaskBuildingService) {}

  @Post('generate')
  async generateTasks(
    @Param('projectId') projectId: string,
    @Body() body: GenerateTasksDto,
  ) {
    return this.taskBuildingService.generateTasks(projectId, body.prdId);
  }

  @Get()
  async listTaskSets(@Param('projectId') projectId: string) {
    return this.taskBuildingService.listTaskSets(projectId);
  }

  @Get('latest')
  async getLatestTaskSet(@Param('projectId') projectId: string) {
    return this.taskBuildingService.getLatestTaskSet(projectId);
  }

  @Get(':taskSetId')
  async getTaskSet(
    @Param('projectId') projectId: string,
    @Param('taskSetId') taskSetId: string,
  ) {
    return this.taskBuildingService.getTaskSet(projectId, taskSetId);
  }

  @Delete(':taskSetId/stories/:storyId')
  async deleteStory(
    @Param('projectId') projectId: string,
    @Param('taskSetId') taskSetId: string,
    @Param('storyId') storyId: string,
  ) {
    return this.taskBuildingService.deleteStory(projectId, taskSetId, storyId);
  }

  @Post(':taskSetId/stories/:storyId/edit')
  async editStory(
    @Param('projectId') projectId: string,
    @Param('taskSetId') taskSetId: string,
    @Param('storyId') storyId: string,
    @Body() body: EditStoryDto,
  ) {
    return this.taskBuildingService.editStory(
      projectId,
      taskSetId,
      storyId,
      body.editPrompt,
    );
  }

  @Post(':taskSetId/reorder')
  async reorderStories(
    @Param('projectId') projectId: string,
    @Param('taskSetId') taskSetId: string,
    @Body() body: ReorderStoriesDto,
  ) {
    return this.taskBuildingService.reorderStories(
      projectId,
      taskSetId,
      body.storyIds,
    );
  }
}
