import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WorkflowStateEnum,
  WorkflowState,
} from '../models/workflow.model';
import { DatabaseService } from './database.service';

export type WorkflowStateValue = z.infer<typeof WorkflowStateEnum>;
import { z } from 'zod';

/** Map of valid transitions: fromState -> set of allowed toStates */
const VALID_TRANSITIONS: Record<WorkflowStateValue, WorkflowStateValue[]> = {
  created: ['prd_authoring'],
  prd_authoring: ['prd_questions', 'created'],
  prd_questions: ['prd_review', 'prd_authoring'],
  prd_review: ['tasks_generated', 'prd_authoring'],
  tasks_generated: ['execution_config', 'prd_authoring'],
  execution_config: ['executing', 'tasks_generated'],
  executing: ['execution_review', 'execution_config'],
  execution_review: ['merging', 'execution_config', 'executing'],
  merging: ['idle', 'execution_review'],
  idle: ['prd_authoring'],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly fromState: WorkflowStateValue,
    public readonly toState: WorkflowStateValue,
  ) {
    super(
      `Invalid workflow transition from "${fromState}" to "${toState}"`,
    );
    this.name = 'InvalidTransitionError';
  }
}

@Injectable()
export class WorkflowStateMachineService {
  private readonly logger = new Logger(WorkflowStateMachineService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get the current workflow state for a project.
   */
  async getState(projectId: string): Promise<WorkflowState | null> {
    const db = await this.databaseService.read();
    return db.workflows[projectId] ?? null;
  }

  /**
   * Initialize workflow state for a new project.
   */
  async initializeState(projectId: string): Promise<WorkflowState> {
    const now = new Date().toISOString();
    const state: WorkflowState = {
      projectId,
      currentState: 'created',
      previousState: null,
      transitionedAt: now,
      transitionHistory: [],
    };

    await this.databaseService.update((db) => ({
      ...db,
      workflows: { ...db.workflows, [projectId]: state },
    }));

    this.logger.log(`Initialized workflow state for project ${projectId}`);
    return state;
  }

  /**
   * Transition to a new state. Validates the transition is allowed.
   * Throws InvalidTransitionError if the transition is not valid.
   */
  async transition(
    projectId: string,
    toState: WorkflowStateValue,
    triggeredBy: string,
  ): Promise<WorkflowState> {
    const current = await this.getState(projectId);
    if (!current) {
      throw new Error(`No workflow state found for project ${projectId}`);
    }

    const fromState = current.currentState;

    if (!this.isValidTransition(fromState, toState)) {
      throw new InvalidTransitionError(fromState, toState);
    }

    const now = new Date().toISOString();
    const updatedState: WorkflowState = {
      ...current,
      currentState: toState,
      previousState: fromState,
      transitionedAt: now,
      transitionHistory: [
        ...current.transitionHistory,
        {
          fromState,
          toState,
          timestamp: now,
          triggeredBy,
        },
      ],
    };

    await this.databaseService.update((db) => ({
      ...db,
      workflows: { ...db.workflows, [projectId]: updatedState },
    }));

    this.logger.log(
      `Workflow transition: ${fromState} -> ${toState} [project: ${projectId}, by: ${triggeredBy}]`,
    );

    // Emit event for side effects
    this.eventEmitter.emit('workflow.transition', {
      projectId,
      fromState,
      toState,
      triggeredBy,
      timestamp: now,
    });

    this.eventEmitter.emit(`workflow.${toState}`, {
      projectId,
      fromState,
      triggeredBy,
      timestamp: now,
    });

    return updatedState;
  }

  /**
   * Check if a transition from one state to another is valid.
   */
  isValidTransition(
    fromState: WorkflowStateValue,
    toState: WorkflowStateValue,
  ): boolean {
    const allowed = VALID_TRANSITIONS[fromState];
    return allowed ? allowed.includes(toState) : false;
  }

  /**
   * Get all valid transitions from the current state.
   */
  getValidTransitions(fromState: WorkflowStateValue): WorkflowStateValue[] {
    return VALID_TRANSITIONS[fromState] ?? [];
  }
}
