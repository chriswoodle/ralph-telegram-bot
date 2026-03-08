<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import type { Project, PrdEntry, TaskSetEntry, Execution, WorkflowState } from '../types';
import { stateLabels, stateColors, prdStateLabels, prdStateColors, executionStatusLabels, executionStatusColors } from '../types';

const route = useRoute();
const router = useRouter();
const projectId = route.params.id as string;

const project = ref<Project | null>(null);
const prds = ref<PrdEntry[]>([]);
const taskSets = ref<TaskSetEntry[]>([]);
const executions = ref<Execution[]>([]);
const loading = ref(true);
const error = ref('');
const startingPrd = ref(false);

const workflowSteps: { state: WorkflowState; label: string }[] = [
  { state: 'created', label: 'Created' },
  { state: 'prd_authoring', label: 'PRD Authoring' },
  { state: 'prd_questions', label: 'PRD Questions' },
  { state: 'prd_review', label: 'PRD Review' },
  { state: 'tasks_generated', label: 'Tasks Generated' },
  { state: 'execution_config', label: 'Execution Config' },
  { state: 'executing', label: 'Executing' },
  { state: 'execution_review', label: 'Execution Review' },
  { state: 'merging', label: 'Merging' },
  { state: 'idle', label: 'Idle' },
];

const currentStepIndex = computed(() => {
  if (!project.value) return -1;
  return workflowSteps.findIndex(s => s.state === project.value!.state);
});

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const [projectRes, prdsRes, taskSetsRes, executionsRes] = await Promise.all([
      api.projectControllerGet(projectId),
      api.prdControllerList(projectId),
      api.taskControllerListTaskSets(projectId),
      api.executionControllerList(projectId),
    ]);
    project.value = projectRes.data as unknown as Project;
    prds.value = prdsRes.data as unknown as PrdEntry[];
    taskSets.value = taskSetsRes.data as unknown as TaskSetEntry[];
    executions.value = executionsRes.data as unknown as Execution[];
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load project';
  } finally {
    loading.value = false;
  }
}

async function startNewPrd() {
  startingPrd.value = true;
  try {
    const res = await api.prdControllerStartAuthoring(projectId);
    const newPrd = res.data as unknown as PrdEntry;
    router.push({ name: 'prd-authoring', params: { projectId, prdId: newPrd.id } });
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to start PRD';
  } finally {
    startingPrd.value = false;
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="project-detail-page">
    <div v-if="loading" class="status-message">Loading project...</div>
    <div v-else-if="error" class="status-message error-text">{{ error }}</div>
    <template v-else-if="project">
      <!-- Sidebar -->
      <aside class="sidebar">
        <button class="back-btn" @click="router.push('/')">
          &larr; Projects
        </button>
        <div class="sidebar-project">
          <span class="prefix-badge">{{ project.prefix }}</span>
          <h2 class="sidebar-title">{{ project.displayName }}</h2>
        </div>
        <nav class="workflow-nav">
          <div
            v-for="(step, index) in workflowSteps"
            :key="step.state"
            class="workflow-step"
            :class="{
              active: index === currentStepIndex,
              completed: index < currentStepIndex,
            }"
          >
            <span class="step-indicator">
              <span v-if="index < currentStepIndex" class="step-check">&#10003;</span>
              <span v-else-if="index === currentStepIndex" class="step-dot"></span>
              <span v-else class="step-empty"></span>
            </span>
            <span class="step-label">{{ step.label }}</span>
          </div>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="main-content">
        <!-- Project metadata -->
        <section class="section">
          <div class="project-header">
            <div>
              <h1>{{ project.displayName }}</h1>
              <p class="project-meta">
                <span class="prefix-badge large">{{ project.prefix }}</span>
                <span class="state-badge" :style="{ background: stateColors[project.state] }">
                  {{ stateLabels[project.state] }}
                </span>
                <span class="meta-text">{{ project.internalName }}</span>
              </p>
            </div>
          </div>
          <p v-if="project.description" class="project-description">{{ project.description }}</p>
          <div class="meta-row">
            <span class="meta-label">Created:</span>
            <span>{{ formatDate(project.createdAt) }}</span>
            <span class="meta-label">Updated:</span>
            <span>{{ formatDate(project.updatedAt) }}</span>
            <span class="meta-label">Directory:</span>
            <span class="mono">{{ project.projectDir }}</span>
          </div>
        </section>

        <!-- PRDs -->
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">PRDs <span class="count-badge">{{ prds.length }}</span></h2>
            <button class="start-prd-btn" @click="startNewPrd" :disabled="startingPrd">
              {{ startingPrd ? 'Starting...' : '+ New PRD' }}
            </button>
          </div>
          <div v-if="prds.length === 0" class="empty-section">No PRDs yet</div>
          <div v-else class="card-list">
            <div
              v-for="prd in prds"
              :key="prd.id"
              class="card clickable"
              @click="router.push({ name: 'prd-authoring', params: { projectId, prdId: prd.id } })"
            >
              <div class="card-header">
                <span
                  class="state-badge small"
                  :style="{ background: prdStateColors[prd.state] }"
                >{{ prdStateLabels[prd.state] }}</span>
                <span class="card-date">{{ formatDate(prd.createdAt) }}</span>
              </div>
              <p class="card-text">{{ prd.input.text.slice(0, 120) }}{{ prd.input.text.length > 120 ? '...' : '' }}</p>
              <div class="card-footer">
                <span v-if="prd.clarifyingQuestions.length" class="meta-text">
                  {{ prd.clarifyingQuestions.length }} question{{ prd.clarifyingQuestions.length !== 1 ? 's' : '' }}
                </span>
                <span v-if="prd.input.assets.length" class="meta-text">
                  {{ prd.input.assets.length }} asset{{ prd.input.assets.length !== 1 ? 's' : '' }}
                </span>
                <span v-if="prd.approvedAt" class="meta-text approved">
                  Approved {{ formatDate(prd.approvedAt) }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Task Sets -->
        <section class="section">
          <h2 class="section-title">Task Sets <span class="count-badge">{{ taskSets.length }}</span></h2>
          <div v-if="taskSets.length === 0" class="empty-section">No task sets yet</div>
          <div v-else class="card-list">
            <div
              v-for="ts in taskSets"
              :key="ts.id"
              class="card clickable"
              @click="router.push({ name: 'task-building', params: { projectId, taskSetId: ts.id } })"
            >
              <div class="card-header">
                <span class="version-badge">v{{ ts.version }}</span>
                <span class="card-date">{{ formatDate(ts.createdAt) }}</span>
              </div>
              <div class="stories-summary">
                <span class="stories-count">{{ ts.userStories.length }} stories</span>
                <span class="stories-passing">
                  {{ ts.userStories.filter(s => s.passes).length }} passing
                </span>
                <span class="stories-remaining">
                  {{ ts.userStories.filter(s => !s.passes).length }} remaining
                </span>
              </div>
              <div class="story-pills">
                <span
                  v-for="story in ts.userStories.slice(0, 8)"
                  :key="story.id"
                  class="story-pill"
                  :class="{ passing: story.passes }"
                  :title="story.title"
                >{{ story.id }}</span>
                <span v-if="ts.userStories.length > 8" class="story-pill more">
                  +{{ ts.userStories.length - 8 }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Executions -->
        <section class="section">
          <h2 class="section-title">Executions <span class="count-badge">{{ executions.length }}</span></h2>
          <div v-if="executions.length === 0" class="empty-section">No executions yet</div>
          <div v-else class="card-list">
            <div v-for="exec in executions" :key="exec.id" class="card">
              <div class="card-header">
                <span
                  class="state-badge small"
                  :style="{ background: executionStatusColors[exec.status] }"
                >{{ executionStatusLabels[exec.status] }}</span>
                <span class="meta-text">{{ exec.parallelCount }} worker{{ exec.parallelCount !== 1 ? 's' : '' }}</span>
                <span v-if="exec.startedAt" class="card-date">{{ formatDate(exec.startedAt) }}</span>
              </div>
              <div class="execution-stats">
                <span v-if="exec.elapsedMs > 0">
                  Elapsed: {{ formatDuration(exec.elapsedMs) }}
                </span>
                <span v-if="exec.estimatedRemainingMs">
                  ETA: {{ formatDuration(exec.estimatedRemainingMs) }}
                </span>
              </div>
              <div v-if="exec.winnerId" class="winner-badge">
                Winner: {{ exec.winnerId }}
              </div>
            </div>
          </div>
        </section>
      </main>
    </template>
  </div>
</template>

<style scoped>
.project-detail-page {
  display: flex;
  min-height: 100vh;
  color: #cdd6f4;
}

.status-message {
  text-align: center;
  padding: 60px 20px;
  color: #a6adc8;
  font-size: 16px;
  width: 100%;
}

.error-text {
  color: #f38ba8;
}

/* Sidebar */
.sidebar {
  width: 260px;
  min-width: 260px;
  background: #181825;
  border-right: 1px solid #313244;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.back-btn {
  background: none;
  border: none;
  color: #89b4fa;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  padding: 4px 0;
}

.back-btn:hover {
  color: #74c7ec;
}

.sidebar-project {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: #cdd6f4;
}

.workflow-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workflow-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #585b70;
  transition: background 0.15s;
}

.workflow-step.active {
  background: rgba(137, 180, 250, 0.1);
  color: #89b4fa;
  font-weight: 600;
}

.workflow-step.completed {
  color: #a6adc8;
}

.step-indicator {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-check {
  color: #a6e3a1;
  font-size: 12px;
  font-weight: 700;
}

.step-dot {
  width: 8px;
  height: 8px;
  background: #89b4fa;
  border-radius: 50%;
}

.step-empty {
  width: 6px;
  height: 6px;
  border: 1.5px solid #585b70;
  border-radius: 50%;
}

/* Main content */
.main-content {
  flex: 1;
  padding: 32px;
  max-width: 900px;
}

.section {
  margin-bottom: 36px;
}

.project-header h1 {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
}

.prefix-badge {
  background: #313244;
  color: #cdd6f4;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.prefix-badge.large {
  padding: 4px 10px;
  font-size: 13px;
}

.state-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: #1e1e2e;
}

.state-badge.small {
  padding: 2px 8px;
  font-size: 11px;
}

.meta-text {
  color: #6c7086;
  font-size: 13px;
}

.mono {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
}

.project-description {
  color: #a6adc8;
  font-size: 15px;
  margin: 12px 0;
  line-height: 1.5;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 13px;
  color: #a6adc8;
  margin-top: 12px;
}

.meta-label {
  color: #6c7086;
  font-weight: 600;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.count-badge {
  background: #313244;
  color: #a6adc8;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.empty-section {
  color: #585b70;
  font-size: 14px;
  padding: 20px;
  text-align: center;
  background: #1e1e2e;
  border: 1px dashed #313244;
  border-radius: 8px;
}

.card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 10px;
  padding: 16px;
  transition: border-color 0.15s;
}

.card.clickable {
  cursor: pointer;
}

.card:hover {
  border-color: #45475a;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-header .section-title {
  margin: 0;
}

.start-prd-btn {
  background: #89b4fa;
  color: #11111b;
  border: none;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.start-prd-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-prd-btn:not(:disabled):hover {
  opacity: 0.85;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.card-date {
  color: #585b70;
  font-size: 12px;
  margin-left: auto;
}

.card-text {
  color: #a6adc8;
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}

.card-footer {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
}

.card-footer .approved {
  color: #a6e3a1;
}

/* Task set specific */
.version-badge {
  background: #89b4fa;
  color: #1e1e2e;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}

.stories-summary {
  display: flex;
  gap: 16px;
  font-size: 13px;
  margin-bottom: 10px;
}

.stories-count {
  color: #cdd6f4;
  font-weight: 600;
}

.stories-passing {
  color: #a6e3a1;
}

.stories-remaining {
  color: #f9e2af;
}

.story-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.story-pill {
  background: #313244;
  color: #a6adc8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

.story-pill.passing {
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
}

.story-pill.more {
  background: #45475a;
  color: #6c7086;
}

/* Execution specific */
.execution-stats {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #a6adc8;
}

.winner-badge {
  margin-top: 8px;
  display: inline-block;
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}
</style>
