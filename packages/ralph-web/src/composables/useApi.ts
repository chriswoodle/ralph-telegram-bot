import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Api } from '../client/Api';
import type {
  StatusResponse,
  SessionSummary,
  ProjectSummary,
  ProjectDetail,
  StoryColumn,
  KanbanCard,
} from '../types/api.types';

const api = new Api();

export function useApi() {
  const status = ref<StatusResponse | null>(null);
  const sessions = ref<SessionSummary[]>([]);
  const projects = ref<ProjectSummary[]>([]);
  const allProjectDetails = ref<ProjectDetail[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const columns = computed<StoryColumn[]>(() => {
    const details = allProjectDetails.value;
    if (!details.length) {
      return [
        { title: 'To Do', cards: [] },
        { title: 'In Progress', cards: [], accent: true },
        { title: 'Done', cards: [] },
      ];
    }

    const cards: KanbanCard[] = [];

    // Build a set of project names that have a RUNNING session
    const runningProjects = new Set(
      sessions.value
        .filter((s) => s.state === 'RUNNING' && s.projectName)
        .map((s) => s.projectName),
    );

    for (const project of details) {
      const isRunning = runningProjects.has(project.name);

      // Add project card
      cards.push({
        type: 'project',
        id: `project-${project.name}`,
        name: project.name,
        description: project.description,
        total: project.progress.total,
        done: project.progress.done,
        percent: project.progress.percent,
        stories: project.progress.stories,
      });

      // Add story cards — only mark current if session is actually RUNNING
      const currentId = isRunning
        ? (project.progress.current?.id ?? null)
        : null;
      for (const story of project.progress.stories) {
        cards.push({
          type: 'story',
          story,
          projectName: project.name,
          isCurrent: story.id === currentId,
        });
      }
    }

    const todo = cards.filter((c) => {
      if (c.type === 'project') return c.percent === 0;
      return !c.story.passes && !c.isCurrent;
    });

    const inProgress = cards.filter((c) => {
      if (c.type === 'project') return c.percent > 0 && c.percent < 100;
      return !c.story.passes && c.isCurrent;
    });

    const done = cards.filter((c) => {
      if (c.type === 'project') return c.percent === 100;
      return c.story.passes;
    });

    return [
      { title: 'To Do', cards: todo },
      { title: 'In Progress', cards: inProgress, accent: true },
      { title: 'Done', cards: done },
    ];
  });

  async function fetchAll() {
    try {
      const [statusRes, sessionsRes, projectsRes] = await Promise.all([
        api.api.dashboardControllerGetStatus() as unknown as Promise<{ data: StatusResponse }>,
        api.api.dashboardControllerGetSessions() as unknown as Promise<{ data: { items: SessionSummary[] } }>,
        api.api.dashboardControllerGetProjects() as unknown as Promise<{ data: { items: ProjectSummary[] } }>,
      ]);

      status.value = statusRes.data ?? null;
      sessions.value = sessionsRes.data?.items ?? [];
      projects.value = projectsRes.data?.items ?? [];

      // Fetch all project details
      const detailResults = await Promise.all(
        projects.value.map((p) =>
          api.api
            .dashboardControllerGetProject(p.name)
            .then((res) => (res as unknown as { data: ProjectDetail }).data)
            .catch(() => null),
        ),
      );
      allProjectDetails.value = detailResults.filter(
        (d): d is ProjectDetail => d !== null,
      );

      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch data';
    } finally {
      loading.value = false;
    }
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    fetchAll();
    intervalId = setInterval(fetchAll, 5000);
  });

  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId);
  });

  return {
    status,
    sessions,
    projects,
    allProjectDetails,
    loading,
    error,
    columns,
  };
}
