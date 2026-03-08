import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WorkflowStateMachineService,
  InvalidTransitionError,
  WorkflowStateValue,
} from './workflow-state-machine.service';
import { DatabaseService } from './database.service';
import { createDefaultDatabase } from '../models/database.model';

describe('WorkflowStateMachineService', () => {
  let service: WorkflowStateMachineService;
  let dbService: jest.Mocked<DatabaseService>;
  let eventEmitter: EventEmitter2;
  let mockDb: ReturnType<typeof createDefaultDatabase>;

  beforeEach(() => {
    mockDb = createDefaultDatabase();

    dbService = {
      read: jest.fn().mockImplementation(async () => mockDb),
      update: jest.fn().mockImplementation(async (fn) => {
        const updated = await fn(mockDb);
        mockDb = updated;
        return updated;
      }),
    } as any;

    eventEmitter = new EventEmitter2();
    jest.spyOn(eventEmitter, 'emit');

    service = new WorkflowStateMachineService(dbService, eventEmitter);
  });

  describe('initializeState', () => {
    it('should create initial state as "created"', async () => {
      const state = await service.initializeState('proj-1');

      expect(state.projectId).toBe('proj-1');
      expect(state.currentState).toBe('created');
      expect(state.previousState).toBeNull();
      expect(state.transitionHistory).toEqual([]);
      expect(dbService.update).toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('should return null for unknown project', async () => {
      const state = await service.getState('unknown');
      expect(state).toBeNull();
    });

    it('should return state after initialization', async () => {
      await service.initializeState('proj-1');
      const state = await service.getState('proj-1');
      expect(state).not.toBeNull();
      expect(state!.currentState).toBe('created');
    });
  });

  describe('transition', () => {
    beforeEach(async () => {
      await service.initializeState('proj-1');
    });

    it('should transition from created to prd_authoring', async () => {
      const state = await service.transition('proj-1', 'prd_authoring', 'user');

      expect(state.currentState).toBe('prd_authoring');
      expect(state.previousState).toBe('created');
      expect(state.transitionHistory).toHaveLength(1);
      expect(state.transitionHistory[0].fromState).toBe('created');
      expect(state.transitionHistory[0].toState).toBe('prd_authoring');
      expect(state.transitionHistory[0].triggeredBy).toBe('user');
    });

    it('should throw InvalidTransitionError for invalid transitions', async () => {
      await expect(
        service.transition('proj-1', 'executing', 'user'),
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('should throw for unknown project', async () => {
      await expect(
        service.transition('unknown', 'prd_authoring', 'user'),
      ).rejects.toThrow('No workflow state found');
    });

    it('should emit workflow.transition event', async () => {
      await service.transition('proj-1', 'prd_authoring', 'user');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.transition',
        expect.objectContaining({
          projectId: 'proj-1',
          fromState: 'created',
          toState: 'prd_authoring',
          triggeredBy: 'user',
        }),
      );
    });

    it('should emit workflow.<state> event', async () => {
      await service.transition('proj-1', 'prd_authoring', 'user');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'workflow.prd_authoring',
        expect.objectContaining({
          projectId: 'proj-1',
          fromState: 'created',
        }),
      );
    });

    it('should support full happy path workflow', async () => {
      const steps: WorkflowStateValue[] = [
        'prd_authoring',
        'prd_questions',
        'prd_review',
        'tasks_generated',
        'execution_config',
        'executing',
        'execution_review',
        'merging',
        'idle',
      ];

      for (const step of steps) {
        await service.transition('proj-1', step, 'system');
      }

      const state = await service.getState('proj-1');
      expect(state!.currentState).toBe('idle');
      expect(state!.transitionHistory).toHaveLength(steps.length);
    });

    it('should allow going back from prd_authoring to created', async () => {
      await service.transition('proj-1', 'prd_authoring', 'user');
      const state = await service.transition('proj-1', 'created', 'user');
      expect(state.currentState).toBe('created');
    });

    it('should allow restarting from idle', async () => {
      // Fast-forward to idle
      const steps: WorkflowStateValue[] = [
        'prd_authoring', 'prd_questions', 'prd_review',
        'tasks_generated', 'execution_config', 'executing',
        'execution_review', 'merging', 'idle',
      ];
      for (const step of steps) {
        await service.transition('proj-1', step, 'system');
      }

      const state = await service.transition('proj-1', 'prd_authoring', 'user');
      expect(state.currentState).toBe('prd_authoring');
    });

    it('should record transition history cumulatively', async () => {
      await service.transition('proj-1', 'prd_authoring', 'user');
      await service.transition('proj-1', 'created', 'user');
      await service.transition('proj-1', 'prd_authoring', 'user');

      const state = await service.getState('proj-1');
      expect(state!.transitionHistory).toHaveLength(3);
    });
  });

  describe('isValidTransition', () => {
    it('should return true for valid transitions', () => {
      expect(service.isValidTransition('created', 'prd_authoring')).toBe(true);
      expect(service.isValidTransition('executing', 'execution_review')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(service.isValidTransition('created', 'executing')).toBe(false);
      expect(service.isValidTransition('idle', 'merging')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid next states', () => {
      const transitions = service.getValidTransitions('created');
      expect(transitions).toEqual(['prd_authoring']);
    });

    it('should return multiple options where applicable', () => {
      const transitions = service.getValidTransitions('execution_review');
      expect(transitions).toContain('merging');
      expect(transitions).toContain('execution_config');
      expect(transitions).toContain('executing');
    });
  });
});
