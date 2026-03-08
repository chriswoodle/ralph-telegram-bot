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

import {
  AnswerQuestionsDto,
  ConfigureExecutionDto,
  CreateProjectDto,
  EditStoryDto,
  GenerateTasksDto,
  ModifyPrdDto,
  PickWinnerDto,
  ReorderStoriesDto,
  SubmitInputDto,
  UploadAssetDto,
} from "./data-contracts";
import { ContentType, HttpClient, RequestParams } from "./http-client";

export class Api<SecurityDataType = unknown> {
  http: HttpClient<SecurityDataType>;

  constructor(http: HttpClient<SecurityDataType>) {
    this.http = http;
  }

  /**
   * No description
   *
   * @tags Project
   * @name ProjectControllerCreate
   * @request POST:/api/projects
   */
  projectControllerCreate = (
    data: CreateProjectDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Project
   * @name ProjectControllerList
   * @request GET:/api/projects
   */
  projectControllerList = (params: RequestParams = {}) =>
    this.http.request<void, any>({
      path: `/api/projects`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Project
   * @name ProjectControllerGet
   * @request GET:/api/projects/{id}
   */
  projectControllerGet = (id: string, params: RequestParams = {}) =>
    this.http.request<void, any>({
      path: `/api/projects/${id}`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerStartAuthoring
   * @request POST:/api/projects/{projectId}/prds/start
   */
  prdControllerStartAuthoring = (
    projectId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/start`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerList
   * @request GET:/api/projects/{projectId}/prds
   */
  prdControllerList = (projectId: string, params: RequestParams = {}) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerGet
   * @request GET:/api/projects/{projectId}/prds/{prdId}
   */
  prdControllerGet = (
    projectId: string,
    prdId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerSubmitInput
   * @request POST:/api/projects/{projectId}/prds/{prdId}/input
   */
  prdControllerSubmitInput = (
    projectId: string,
    prdId: string,
    data: SubmitInputDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/input`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerGenerateQuestions
   * @request POST:/api/projects/{projectId}/prds/{prdId}/questions/generate
   */
  prdControllerGenerateQuestions = (
    projectId: string,
    prdId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/questions/generate`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerAnswerQuestions
   * @request POST:/api/projects/{projectId}/prds/{prdId}/questions/answer
   */
  prdControllerAnswerQuestions = (
    projectId: string,
    prdId: string,
    data: AnswerQuestionsDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/questions/answer`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerGeneratePrd
   * @request POST:/api/projects/{projectId}/prds/{prdId}/generate
   */
  prdControllerGeneratePrd = (
    projectId: string,
    prdId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/generate`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerModifyPrd
   * @request POST:/api/projects/{projectId}/prds/{prdId}/modify
   */
  prdControllerModifyPrd = (
    projectId: string,
    prdId: string,
    data: ModifyPrdDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/modify`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerApprovePrd
   * @request POST:/api/projects/{projectId}/prds/{prdId}/approve
   */
  prdControllerApprovePrd = (
    projectId: string,
    prdId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/approve`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerCancelPrd
   * @request POST:/api/projects/{projectId}/prds/{prdId}/cancel
   */
  prdControllerCancelPrd = (
    projectId: string,
    prdId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/cancel`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Prd
   * @name PrdControllerUploadAsset
   * @request POST:/api/projects/{projectId}/prds/{prdId}/assets
   */
  prdControllerUploadAsset = (
    projectId: string,
    prdId: string,
    data: UploadAssetDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/prds/${prdId}/assets`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerGenerateTasks
   * @request POST:/api/projects/{projectId}/tasks/generate
   */
  taskControllerGenerateTasks = (
    projectId: string,
    data: GenerateTasksDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/generate`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerListTaskSets
   * @request GET:/api/projects/{projectId}/tasks
   */
  taskControllerListTaskSets = (
    projectId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerGetLatestTaskSet
   * @request GET:/api/projects/{projectId}/tasks/latest
   */
  taskControllerGetLatestTaskSet = (
    projectId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/latest`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerGetTaskSet
   * @request GET:/api/projects/{projectId}/tasks/{taskSetId}
   */
  taskControllerGetTaskSet = (
    projectId: string,
    taskSetId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/${taskSetId}`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerDeleteStory
   * @request DELETE:/api/projects/{projectId}/tasks/{taskSetId}/stories/{storyId}
   */
  taskControllerDeleteStory = (
    projectId: string,
    taskSetId: string,
    storyId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/${taskSetId}/stories/${storyId}`,
      method: "DELETE",
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerEditStory
   * @request POST:/api/projects/{projectId}/tasks/{taskSetId}/stories/{storyId}/edit
   */
  taskControllerEditStory = (
    projectId: string,
    taskSetId: string,
    storyId: string,
    data: EditStoryDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/${taskSetId}/stories/${storyId}/edit`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Task
   * @name TaskControllerReorderStories
   * @request POST:/api/projects/{projectId}/tasks/{taskSetId}/reorder
   */
  taskControllerReorderStories = (
    projectId: string,
    taskSetId: string,
    data: ReorderStoriesDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/tasks/${taskSetId}/reorder`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerConfigure
   * @request POST:/api/projects/{projectId}/executions/configure
   */
  executionControllerConfigure = (
    projectId: string,
    data: ConfigureExecutionDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions/configure`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerList
   * @request GET:/api/projects/{projectId}/executions
   */
  executionControllerList = (projectId: string, params: RequestParams = {}) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerGet
   * @request GET:/api/projects/{projectId}/executions/{executionId}
   */
  executionControllerGet = (
    projectId: string,
    executionId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions/${executionId}`,
      method: "GET",
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerStart
   * @request POST:/api/projects/{projectId}/executions/{executionId}/start
   */
  executionControllerStart = (
    projectId: string,
    executionId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions/${executionId}/start`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerAbort
   * @request POST:/api/projects/{projectId}/executions/{executionId}/abort
   */
  executionControllerAbort = (
    projectId: string,
    executionId: string,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions/${executionId}/abort`,
      method: "POST",
      ...params,
    });
  /**
   * No description
   *
   * @tags Execution
   * @name ExecutionControllerPickWinner
   * @request POST:/api/projects/{projectId}/executions/{executionId}/pick-winner
   */
  executionControllerPickWinner = (
    projectId: string,
    executionId: string,
    data: PickWinnerDto,
    params: RequestParams = {},
  ) =>
    this.http.request<void, any>({
      path: `/api/projects/${projectId}/executions/${executionId}/pick-winner`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
}
