/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface CreateProjectDto {
  /** @minLength 1 */
  displayName: string;
  description: string;
}

export interface SubmitInputDto {
  text: string;
  /** @default [] */
  assets?: {
    fileName: string;
    filePath: string;
    mimeType?: string;
  }[];
}

export interface AnswerQuestionsDto {
  answers: {
    question: string;
    answer: string;
  }[];
}

export interface ModifyPrdDto {
  /** @minLength 1 */
  modificationRequest: string;
}

export interface UploadAssetDto {
  /** @minLength 1 */
  fileName: string;
  /** @minLength 1 */
  fileBase64: string;
  mimeType?: string;
}

export interface GenerateTasksDto {
  /**
   * @format uuid
   * @pattern ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$
   */
  prdId: string;
}

export interface EditStoryDto {
  /** @minLength 1 */
  editPrompt: string;
}

export interface ReorderStoriesDto {
  /** @minItems 1 */
  storyIds: string[];
}

export interface ConfigureExecutionDto {
  /**
   * @format uuid
   * @pattern ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$
   */
  taskSetId: string;
  /**
   * @min 1
   * @max 10
   */
  parallelCount: number;
}

export interface PickWinnerDto {
  /** @minLength 1 */
  worktreeId: string;
}
