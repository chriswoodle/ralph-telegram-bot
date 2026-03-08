<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import type { PrdEntry, PrdState } from '../types';
import { prdStateLabels, prdStateColors } from '../types';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => route.params.projectId as string);
const prdId = computed(() => route.params.prdId as string);

const prd = ref<PrdEntry | null>(null);
const loading = ref(true);
const error = ref('');
const processing = ref(false);

// Step 1: Authoring
const inputText = ref('');
const assets = ref<{ fileName: string; filePath: string }[]>([]);
const uploadFileName = ref('');
const uploadFile = ref<File | null>(null);
const uploading = ref(false);

// Step 2: Questions
const answers = ref<{ question: string; answer: string }[]>([]);

// Step 3: Review
const modifying = ref(false);
const modificationRequest = ref('');

const currentStep = computed(() => {
  if (!prd.value) return 1;
  const stateStepMap: Record<PrdState, number> = {
    authoring: 1,
    questions_pending: 2,
    review_pending: 3,
    approved: 3,
    cancelled: 3,
  };
  return stateStepMap[prd.value.state];
});

const stepLabels = ['Input', 'Questions', 'Review'];

async function fetchPrd() {
  try {
    const res = await api.prdControllerGet(projectId.value, prdId.value);
    prd.value = res.data as unknown as PrdEntry;
    inputText.value = prd.value.input?.text || '';
    assets.value = prd.value.input?.assets || [];
    if (prd.value.clarifyingQuestions?.length) {
      answers.value = prd.value.clarifyingQuestions.map((q) => ({
        question: q.question,
        answer: q.answer || '',
      }));
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to load PRD';
  } finally {
    loading.value = false;
  }
}

function insertAssetReference(asset: { fileName: string }) {
  inputText.value += `\n[asset: ${asset.fileName}]`;
}

async function handleFileUpload() {
  if (!uploadFile.value) return;
  uploading.value = true;
  try {
    const file = uploadFile.value;
    const base64 = await fileToBase64(file);
    const res = await api.prdControllerUploadAsset(projectId.value, prdId.value, {
      fileName: file.name,
      fileBase64: base64,
      mimeType: file.type || undefined,
    });
    const newAsset = res.data as unknown as { fileName: string; filePath: string };
    assets.value.push(newAsset);
    uploadFile.value = null;
    uploadFileName.value = '';
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function onFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files?.length) {
    uploadFile.value = target.files[0];
    uploadFileName.value = target.files[0].name;
  }
}

async function submitInput() {
  processing.value = true;
  error.value = '';
  try {
    await api.prdControllerSubmitInput(projectId.value, prdId.value, {
      text: inputText.value,
      assets: assets.value.map((a) => ({ fileName: a.fileName, filePath: a.filePath })),
    });
    await generateQuestions();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to submit input';
    processing.value = false;
  }
}

async function generateQuestions() {
  try {
    const res = await api.prdControllerGenerateQuestions(projectId.value, prdId.value);
    const questions = res.data as unknown as { question: string; answer?: string }[];
    answers.value = questions.map((q) => ({ question: q.question, answer: q.answer || '' }));
    await fetchPrd();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to generate questions';
  } finally {
    processing.value = false;
  }
}

async function submitAnswers() {
  processing.value = true;
  error.value = '';
  try {
    await api.prdControllerAnswerQuestions(projectId.value, prdId.value, {
      answers: answers.value,
    });
    await generatePrd();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to submit answers';
    processing.value = false;
  }
}

async function generatePrd() {
  try {
    await api.prdControllerGeneratePrd(projectId.value, prdId.value);
    await fetchPrd();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to generate PRD';
  } finally {
    processing.value = false;
  }
}

async function approvePrd() {
  processing.value = true;
  error.value = '';
  try {
    await api.prdControllerApprovePrd(projectId.value, prdId.value);
    await fetchPrd();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to approve PRD';
  } finally {
    processing.value = false;
  }
}

async function submitModification() {
  if (!modificationRequest.value.trim()) return;
  processing.value = true;
  error.value = '';
  try {
    await api.prdControllerModifyPrd(projectId.value, prdId.value, {
      modificationRequest: modificationRequest.value,
    });
    modificationRequest.value = '';
    modifying.value = false;
    await fetchPrd();
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to modify PRD';
  } finally {
    processing.value = false;
  }
}

async function cancelPrd() {
  processing.value = true;
  error.value = '';
  try {
    await api.prdControllerCancelPrd(projectId.value, prdId.value);
    router.push({ name: 'project-detail', params: { id: projectId.value } });
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'Failed to cancel PRD';
  } finally {
    processing.value = false;
  }
}

onMounted(fetchPrd);
</script>

<template>
  <div class="prd-authoring">
    <header class="top-bar">
      <button class="back-btn" @click="router.push({ name: 'project-detail', params: { id: projectId } })">
        &larr; Back
      </button>
      <h1>PRD Authoring</h1>
      <span v-if="prd" class="state-badge" :style="{ backgroundColor: prdStateColors[prd.state] }">
        {{ prdStateLabels[prd.state] }}
      </span>
    </header>

    <div v-if="loading" class="loading">Loading PRD...</div>
    <div v-else-if="error" class="error-msg">{{ error }}</div>

    <template v-if="prd && !loading">
      <!-- Step indicators -->
      <div class="steps">
        <div
          v-for="(label, idx) in stepLabels"
          :key="idx"
          class="step"
          :class="{ active: currentStep === idx + 1, completed: currentStep > idx + 1 }"
        >
          <span class="step-number">{{ currentStep > idx + 1 ? '✓' : idx + 1 }}</span>
          <span class="step-label">{{ label }}</span>
        </div>
      </div>

      <!-- Step 1: Input & Assets -->
      <div v-if="currentStep === 1" class="step-content">
        <div class="input-layout">
          <div class="editor-panel">
            <h2>Describe your project</h2>
            <textarea
              v-model="inputText"
              class="text-editor"
              placeholder="Describe what you want to build..."
              rows="16"
            ></textarea>
          </div>

          <div class="asset-panel">
            <h3>Assets</h3>
            <div class="asset-upload">
              <input type="file" id="asset-file" @change="onFileSelect" />
              <button class="btn btn-sm" :disabled="!uploadFile || uploading" @click="handleFileUpload">
                {{ uploading ? 'Uploading...' : 'Upload' }}
              </button>
            </div>
            <div v-if="assets.length" class="asset-list">
              <div
                v-for="asset in assets"
                :key="asset.filePath"
                class="asset-item"
                @click="insertAssetReference(asset)"
                title="Click to insert reference"
              >
                {{ asset.fileName }}
              </div>
            </div>
            <p v-else class="asset-hint">No assets uploaded. Upload files to reference them in your description.</p>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" :disabled="!inputText.trim() || processing" @click="submitInput">
            {{ processing ? 'Processing...' : 'Submit & Generate Questions' }}
          </button>
          <button class="btn btn-danger" :disabled="processing" @click="cancelPrd">Cancel</button>
        </div>
      </div>

      <!-- Step 2: Clarifying Questions -->
      <div v-if="currentStep === 2" class="step-content">
        <h2>Clarifying Questions</h2>
        <p class="step-desc">Answer the following questions to help generate a detailed PRD.</p>

        <div class="questions-list">
          <div v-for="(qa, idx) in answers" :key="idx" class="question-card">
            <label class="question-label">{{ qa.question }}</label>
            <textarea
              v-model="qa.answer"
              class="answer-input"
              placeholder="Your answer..."
              rows="3"
            ></textarea>
          </div>
        </div>

        <div class="actions">
          <button
            class="btn btn-primary"
            :disabled="processing || answers.some((a) => !a.answer.trim())"
            @click="submitAnswers"
          >
            {{ processing ? 'Generating PRD...' : 'Submit Answers & Generate PRD' }}
          </button>
          <button class="btn btn-danger" :disabled="processing" @click="cancelPrd">Cancel</button>
        </div>
      </div>

      <!-- Step 3: PRD Review -->
      <div v-if="currentStep === 3" class="step-content">
        <h2>PRD Review</h2>

        <div class="prd-preview" v-if="prd.prdMarkdown">
          <div class="markdown-content" v-html="renderMarkdown(prd.prdMarkdown)"></div>
        </div>
        <div v-else class="prd-preview empty">No PRD content generated yet.</div>

        <template v-if="prd.state === 'review_pending'">
          <div v-if="modifying" class="modify-section">
            <h3>Modification Request</h3>
            <textarea
              v-model="modificationRequest"
              class="modify-input"
              placeholder="Describe what changes you'd like..."
              rows="4"
            ></textarea>
            <div class="actions">
              <button
                class="btn btn-primary"
                :disabled="!modificationRequest.trim() || processing"
                @click="submitModification"
              >
                {{ processing ? 'Modifying...' : 'Submit Modification' }}
              </button>
              <button class="btn btn-secondary" :disabled="processing" @click="modifying = false">
                Cancel
              </button>
            </div>
          </div>

          <div v-else class="actions">
            <button class="btn btn-success" :disabled="processing" @click="approvePrd">
              {{ processing ? 'Approving...' : 'Approve PRD' }}
            </button>
            <button class="btn btn-secondary" :disabled="processing" @click="modifying = true">
              Modify
            </button>
            <button class="btn btn-danger" :disabled="processing" @click="cancelPrd">Cancel</button>
          </div>
        </template>

        <div v-if="prd.state === 'approved'" class="approved-banner">
          PRD has been approved.
          <button class="btn btn-secondary" @click="router.push({ name: 'project-detail', params: { id: projectId } })">
            Back to Project
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
function renderMarkdown(md: string): string {
  // Simple markdown rendering - convert headers, bold, lists, code blocks, paragraphs
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Paragraphs (lines not already wrapped)
  html = html.replace(/^(?!<[hluop])((?!<).+)$/gm, '<p>$1</p>');

  return html;
}
</script>

<style scoped>
.prd-authoring {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem;
  color: #cdd6f4;
}

.top-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.top-bar h1 {
  margin: 0;
  font-size: 1.5rem;
  flex: 1;
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

.state-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #11111b;
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

/* Steps */
.steps {
  display: flex;
  gap: 0;
  margin-bottom: 2rem;
  border-bottom: 2px solid #313244;
}

.step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  color: #6c7086;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.step.active {
  color: #89b4fa;
  border-bottom-color: #89b4fa;
}

.step.completed {
  color: #a6e3a1;
}

.step-number {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #313244;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
}

.step.active .step-number {
  background: #89b4fa;
  color: #11111b;
}

.step.completed .step-number {
  background: #a6e3a1;
  color: #11111b;
}

.step-label {
  font-size: 0.85rem;
  font-weight: 500;
}

/* Step Content */
.step-content {
  background: #1e1e2e;
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #313244;
}

.step-content h2 {
  margin: 0 0 0.5rem;
  font-size: 1.2rem;
}

.step-desc {
  color: #a6adc8;
  margin-bottom: 1.5rem;
}

/* Step 1: Input layout */
.input-layout {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.editor-panel h2 {
  margin-bottom: 0.75rem;
}

.text-editor {
  width: 100%;
  background: #11111b;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 1rem;
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
  line-height: 1.6;
}

.text-editor:focus {
  outline: none;
  border-color: #89b4fa;
}

.asset-panel {
  background: #11111b;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #45475a;
}

.asset-panel h3 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}

.asset-upload {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.asset-upload input[type="file"] {
  font-size: 0.8rem;
  color: #a6adc8;
}

.asset-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.asset-item {
  padding: 0.4rem 0.6rem;
  background: #313244;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
  word-break: break-all;
}

.asset-item:hover {
  background: #45475a;
}

.asset-hint {
  font-size: 0.8rem;
  color: #6c7086;
}

/* Step 2: Questions */
.questions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.question-card {
  background: #11111b;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #45475a;
}

.question-label {
  display: block;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #cdd6f4;
}

.answer-input {
  width: 100%;
  background: #1e1e2e;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
}

.answer-input:focus {
  outline: none;
  border-color: #89b4fa;
}

/* Step 3: Review */
.prd-preview {
  background: #11111b;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  max-height: 600px;
  overflow-y: auto;
  line-height: 1.7;
}

.prd-preview.empty {
  color: #6c7086;
  text-align: center;
  padding: 3rem;
}

.markdown-content :deep(h1) {
  font-size: 1.4rem;
  margin: 1rem 0 0.5rem;
  color: #cdd6f4;
}

.markdown-content :deep(h2) {
  font-size: 1.2rem;
  margin: 1rem 0 0.5rem;
  color: #cdd6f4;
}

.markdown-content :deep(h3) {
  font-size: 1rem;
  margin: 0.75rem 0 0.25rem;
  color: #cdd6f4;
}

.markdown-content :deep(p) {
  margin: 0.5rem 0;
}

.markdown-content :deep(ul) {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.markdown-content :deep(li) {
  margin: 0.25rem 0;
}

.markdown-content :deep(pre) {
  background: #181825;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

.markdown-content :deep(code) {
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
}

.modify-section {
  margin-top: 1rem;
}

.modify-section h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.modify-input {
  width: 100%;
  background: #11111b;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 0.75rem;
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
  margin-bottom: 1rem;
}

.modify-input:focus {
  outline: none;
  border-color: #89b4fa;
}

.approved-banner {
  background: rgba(166, 227, 161, 0.1);
  border: 1px solid #a6e3a1;
  color: #a6e3a1;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
}

/* Actions */
.actions {
  display: flex;
  gap: 0.75rem;
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

.btn-sm {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}

.btn-primary {
  background: #89b4fa;
  color: #11111b;
}

.btn-success {
  background: #a6e3a1;
  color: #11111b;
}

.btn-secondary {
  background: #45475a;
  color: #cdd6f4;
}

.btn-danger {
  background: #f38ba8;
  color: #11111b;
}

.btn:not(:disabled):hover {
  opacity: 0.85;
}
</style>
