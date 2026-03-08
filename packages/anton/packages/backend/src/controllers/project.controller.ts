import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { ProjectService } from '../services/project.service';
import { ProjectSchema } from '../models/project.model';

const CreateProjectSchema = z.object({
  displayName: z.string().min(1),
  description: z.string(),
});

class CreateProjectDto extends createZodDto(CreateProjectSchema) {}

@Controller('api/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  async create(@Body() body: CreateProjectDto) {
    return this.projectService.createProject(body.displayName, body.description);
  }

  @Get()
  async list() {
    return this.projectService.listProjects();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const project = await this.projectService.getProject(id);
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }
}
