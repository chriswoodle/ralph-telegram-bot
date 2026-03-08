<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import type { Execution, WorktreeStatus, StoryProgress, StoryExecutionStatus } from '../types';
import { executionStatusLabels, executionStatusColors, storyStatusColors, storyStatusLabels } from '../types';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => route.params.projectId as string);
const executionId = computed(() => route.params.executionId as string);

const execution = ref<Execution | null>(null);
const loading = ref(true);
const error = ref('');
const processing = ref(false);
const activeTab = ref(0);
const expandedLogs = ref<Set<string>>(new Set());

let pollInterval: ReturnType<typeof setInterval> | null = null;
let eventSource: EventSource | null = null;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function fetchExecution() {
  try {
    const res = await api.executionControllerGet(projectId.value, executionId.value);
    execution.value = res.data as unknown as Execution;
    error.value = '';
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load execution';
  } finally {
    loading.value = false;
  }
}

function connectSSE() {
  if (!execution.value) return;
  const isActive = execution.value.status === 'executing' || execution.value.status === 'configuring';
  if (!isActive) return;

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/projects/${projectId.value}/executions/${executionId.value}/events`;

  eventSource = new EventSource(url);

  eventSource.onmessage = async () => {
    // On any SSE event, re-fetch the full execution state
    await fetchExecution();

    // Stop SSE if execution is no longer active
    if (execution.value && !['executing', 'configuring'].includes(execution.value.status)) {
      closeSSE();
    }
  };

  eventSource.onerror = () => {
    // On SSE error, fall back to polling
    closeSSE();
    startPolling();
  };
}

function closeSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(async () => {
    if (execution.value && (execution.value.status === 'executing' || execution.value.status === 'configuring')) {
      await fetchExecution();
    } else if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }, 3000);
}

async function abortExecution() {
  if (!execution.value) return;
  processing.value = true;
  error.value = '';
  try {
    await api.executionControllerAbort(projectId.value, executionId.value);
    await fetchExecution();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to abort execution';
  } finally {
    processing.value = false;
  }
}

async function pickWinner(worktreeId: string) {
  if (!execution.value) return;
  processing.value = true;
  error.value = '';
  try {
    await api.executionControllerPickWinner(projectId.value, executionId.value, { worktreeId });
    await fetchExecution();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to pick winner';
  } finally {
    processing.value = false;
  }
}

function toggleLog(worktreeId: string) {
  if (expandedLogs.value.has(worktreeId)) {
    expandedLogs.value.delete(worktreeId);
  } else {
    expandedLogs.value.add(worktreeId);
  }
}

function storyStatusClass(status: StoryExecutionStatus): string {
  return `story-status-${status.replace('_', '-')}`;
}

const totalStories = computed(() => {
  if (!execution.value) return 0;
  return execution.value.worktrees.reduce((sum, wt) => sum + wt.storyProgress.length, 0);
});

const completedStories = computed(() => {
  if (!execution.value) return 0;
  return execution.value.worktrees.reduce(
    (sum, wt) => sum + wt.storyProgress.filter(s => s.status === 'completed').length,
    0,
  );
});

const isFinished = computed(() => {
  if (!execution.value) return false;
  return ['completed', 'aborted', 'error'].includes(execution.value.status);
});

const isReviewable = computed(() => {
  return execution.value?.status === 'completed';
});

onMounted(async () => {
  await fetchExecution();
  connectSSE();
});

onUnmounted(() => {
  closeSSE();
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="execution-view">
    <header class="top-bar">
      <button class="back-btn" @click="router.push({ name: 'project-detail', params: { id: projectId } })">
        &larr; Back
      </button>
      <h1>Execution Dashboard</h1>
      <div v-if="execution" class="top-bar-right">
        <span
          class="status-badge"
          :style="{ background: executionStatusColors[execution.status] }"
        >{{ executionStatusLabels[execution.status] }}</span>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading execution...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-if="execution && !loading">
      <!-- Summary bar -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-label">Elapsed</span>
          <span class="summary-value">{{ formatDuration(execution.elapsedMs) }}</span>
        </div>
        <div v-if="execution.estimatedRemainingMs" class="summary-item">
          <span class="summary-label">ETA</span>
          <span class="summary-value">{{ formatDuration(execution.estimatedRemainingMs) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Workers</span>
          <span class="summary-value">{{ execution.parallelCount }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Stories</span>
          <span class="summary-value">{{ completedStories }}/{{ totalStories }}</span>
        </div>
        <div v-if="execution.startedAt" class="summary-item">
          <span class="summary-label">Started</span>
          <span class="summary-value small-text">{{ formatDate(execution.startedAt) }}</span>
        </div>
        <div class="summary-actions">
          <button
            v-if="execution.status === 'executing'"
            class="btn btn-danger"
            :disabled="processing"
            @click="abortExecution"
          >{{ processing ? 'Aborting...' : 'Abort' }}</button>
        </div>
      </div>

      <!-- Winner banner -->
      <div v-if="execution.winnerId" class="winner-banner">
        Winner selected: {{ execution.winnerId }}
      </div>

      <!-- Worktree tabs -->
      <div v-if="execution.worktrees.length > 1" class="worktree-tabs">
        <button
          v-for="(wt, idx) in execution.worktrees"
          :key="wt.id"
          class="tab-btn"
          :class="{
            active: activeTab === idx,
            ['tab-' + wt.status.replace('_', '-')]: true,
          }"
          @click="activeTab = idx"
        >
          <span class="tab-dot" :style="{ background: storyStatusColors[wt.status] }"></span>
          Worker {{ idx + 1 }}
        </button>
      </div>

      <!-- Worktree panels -->
      <div
        v-for="(wt, idx) in execution.worktrees"
        :key="wt.id"
        v-show="activeTab === idx || execution.worktrees.length === 1"
        class="worktree-panel"
      >
        <div class="wt-header">
          <h2>Worker {{ idx + 1 }}</h2>
          <span class="wt-branch mono">{{ wt.branch }}</span>
          <span
            class="status-badge small"
            :style="{ background: storyStatusColors[wt.status] }"
          >{{ storyStatusLabels[wt.status] }}</span>
          <div class="wt-times">
            <span v-if="wt.elapsedMs > 0">{{ formatDuration(wt.elapsedMs) }}</span>
            <span v-if="wt.estimatedRemainingMs" class="eta-text">
              ETA: {{ formatDuration(wt.estimatedRemainingMs) }}
            </span>
          </div>
          <button
            v-if="isReviewable"
            class="btn btn-winner"
            :disabled="processing"
            @click="pickWinner(wt.id)"
          >{{ processing ? 'Merging...' : 'Pick Winner' }}</button>
        </div>

        <!-- Errors -->
        <div v-if="wt.errors.length" class="wt-errors">
          <div v-for="(err, eidx) in wt.errors" :key="eidx" class="wt-error-item">
            {{ err }}
          </div>
        </div>

        <!-- Story progress list -->
        <div class="story-progress-list">
          <div
            v-for="sp in wt.storyProgress"
            :key="sp.storyId"
            class="story-progress-item"
            :class="storyStatusClass(sp.status)"
          >
            <span class="sp-indicator" :style="{ background: storyStatusColors[sp.status] }"></span>
            <span class="sp-id">{{ sp.storyId }}</span>
            <span class="sp-status">{{ storyStatusLabels[sp.status] }}</span>
            <span v-if="sp.startedAt && sp.completedAt" class="sp-duration">
              {{ formatDuration(new Date(sp.completedAt).getTime() - new Date(sp.startedAt).getTime()) }}
            </span>
            <span v-if="sp.error" class="sp-error" :title="sp.error">{{ sp.error }}</span>
          </div>
        </div>

        <!-- Log viewer toggle -->
        <div v-if="wt.logPath" class="log-section">
          <button class="log-toggle" @click="toggleLog(wt.id)">
            {{ expandedLogs.has(wt.id) ? 'Hide' : 'Show' }} Log Path
          </button>
          <div v-if="expandedLogs.has(wt.id)" class="log-path mono">
            {{ wt.logPath }}
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.execution-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem;
  color: #cdd6f4;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.top-bar h1 {
  margin: 0;
  font-size: 1.5rem;
  flex: 1;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.back-btn {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.back-btn:hover {
  background: #45475a;
}

.loading {
  text-align: center;
  padding: 3rem;
  color: #a6adc8;
}

.error-msg {
  background: rgba(243, 139, 168, 0.15);
  border: 1px solid #f38ba8;
  color: #f38ba8;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

/* Summary bar */
.summary-bar {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 1rem 1.25rem;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 10px;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.summary-label {
  font-size: 0.7rem;
  color: #6c7086;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.summary-value {
  font-size: 1rem;
  font-weight: 600;
  color: #cdd6f4;
}

.summary-value.small-text {
  font-size: 0.85rem;
  font-weight: 400;
}

.summary-actions {
  margin-left: auto;
}

/* Winner banner */
.winner-banner {
  background: rgba(166, 227, 161, 0.12);
  border: 1px solid rgba(166, 227, 161, 0.3);
  color: #a6e3a1;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-weight: 600;
  font-size: 0.95rem;
}

/* Status badge */
.status-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  color: #1e1e2e;
}

.status-badge.small {
  padding: 2px 8px;
  font-size: 11px;
}

/* Worktree tabs */
.worktree-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #313244;
  padding-bottom: 0;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6c7086;
  padding: 0.6rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: #a6adc8;
}

.tab-btn.active {
  color: #cdd6f4;
  border-bottom-color: #89b4fa;
}

.tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Worktree panel */
.worktree-panel {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}

.wt-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.wt-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.wt-branch {
  color: #6c7086;
  font-size: 0.8rem;
}

.wt-times {
  margin-left: auto;
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #a6adc8;
}

.eta-text {
  color: #f9e2af;
}

.mono {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
}

/* Errors */
.wt-errors {
  margin-bottom: 1rem;
}

.wt-error-item {
  background: rgba(243, 139, 168, 0.1);
  border: 1px solid #f38ba840;
  color: #f38ba8;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

/* Story progress */
.story-progress-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.story-progress-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: #11111b;
  border: 1px solid #313244;
  font-size: 0.85rem;
}

.story-progress-item.story-status-in-progress {
  border-color: rgba(137, 180, 250, 0.3);
  background: rgba(137, 180, 250, 0.05);
}

.story-progress-item.story-status-completed {
  border-color: rgba(166, 227, 161, 0.2);
}

.story-progress-item.story-status-error {
  border-color: rgba(243, 139, 168, 0.2);
}

.sp-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sp-id {
  font-family: 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: #cdd6f4;
  min-width: 55px;
}

.sp-status {
  color: #a6adc8;
  font-size: 0.8rem;
}

.sp-duration {
  margin-left: auto;
  color: #6c7086;
  font-size: 0.8rem;
}

.sp-error {
  color: #f38ba8;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 250px;
}

/* Log section */
.log-section {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #313244;
}

.log-toggle {
  background: none;
  border: 1px solid #45475a;
  color: #a6adc8;
  padding: 0.3rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
}

.log-toggle:hover {
  background: #313244;
}

.log-path {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #11111b;
  border-radius: 6px;
  font-size: 0.8rem;
  color: #6c7086;
  word-break: break-all;
}

/* Buttons */
.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 8px;
  border: none;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:not(:disabled):hover {
  opacity: 0.85;
}

.btn-danger {
  background: #f38ba8;
  color: #11111b;
}

.btn-winner {
  background: #a6e3a1;
  color: #11111b;
  font-weight: 600;
}
</style>
