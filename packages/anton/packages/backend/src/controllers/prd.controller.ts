import {
  Controller,
  Get,
  Post,
  Param,
  Body,
} from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PrdAuthoringService } from '../services/prd-authoring.service';

const SubmitInputSchema = z.object({
  text: z.string(),
  assets: z.array(z.object({
    fileName: z.string(),
    filePath: z.string(),
    mimeType: z.string().optional(),
  })).default([]),
});

class SubmitInputDto extends createZodDto(SubmitInputSchema) {}

const AnswerQuestionsSchema = z.object({
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

class AnswerQuestionsDto extends createZodDto(AnswerQuestionsSchema) {}

const ModifyPrdSchema = z.object({
  modificationRequest: z.string().min(1),
});

class ModifyPrdDto extends createZodDto(ModifyPrdSchema) {}

const UploadAssetSchema = z.object({
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
  mimeType: z.string().optional(),
});

class UploadAssetDto extends createZodDto(UploadAssetSchema) {}

@Controller('api/projects/:projectId/prds')
export class PrdController {
  constructor(private readonly prdAuthoringService: PrdAuthoringService) {}

  @Post('start')
  async startAuthoring(@Param('projectId') projectId: string) {
    return this.prdAuthoringService.startAuthoring(projectId);
  }

  @Get()
  async list(@Param('projectId') projectId: string) {
    return this.prdAuthoringService.listPrds(projectId);
  }

  @Get(':prdId')
  async get(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
  ) {
    return this.prdAuthoringService.getPrdEntry(projectId, prdId);
  }

  @Post(':prdId/input')
  async submitInput(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
    @Body() body: SubmitInputDto,
  ) {
    return this.prdAuthoringService.submitInput(
      projectId,
      prdId,
      body.text,
      body.assets,
    );
  }

  @Post(':prdId/questions/generate')
  async generateQuestions(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
  ) {
    return this.prdAuthoringService.generateClarifyingQuestions(projectId, prdId);
  }

  @Post(':prdId/questions/answer')
  async answerQuestions(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
    @Body() body: AnswerQuestionsDto,
  ) {
    return this.prdAuthoringService.answerQuestions(
      projectId,
      prdId,
      body.answers,
    );
  }

  @Post(':prdId/generate')
  async generatePrd(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
  ) {
    return this.prdAuthoringService.generatePrd(projectId, prdId);
  }

  @Post(':prdId/modify')
  async modifyPrd(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
    @Body() body: ModifyPrdDto,
  ) {
    return this.prdAuthoringService.modifyPrd(
      projectId,
      prdId,
      body.modificationRequest,
    );
  }

  @Post(':prdId/approve')
  async approvePrd(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
  ) {
    return this.prdAuthoringService.approvePrd(projectId, prdId);
  }

  @Post(':prdId/cancel')
  async cancelPrd(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
  ) {
    return this.prdAuthoringService.cancelPrd(projectId, prdId);
  }

  @Post(':prdId/assets')
  async uploadAsset(
    @Param('projectId') projectId: string,
    @Param('prdId') prdId: string,
    @Body() body: UploadAssetDto,
  ) {
    const buffer = Buffer.from(body.fileBase64, 'base64');
    return this.prdAuthoringService.uploadAsset(
      projectId,
      prdId,
      body.fileName,
      buffer,
      body.mimeType,
    );
  }
}
