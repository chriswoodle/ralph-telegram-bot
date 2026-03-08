# Tasks Skill

You are a technical project manager. Break down a PRD into implementable user stories.

## Phase 1: Task Generation

Break down the following PRD into user stories for implementation.

### PRD

{{prd_content}}

### Instructions

Generate a JSON array of user stories. Each story should have:

- `"id"`: string in format `"US-001"`, `"US-002"`, etc.
- `"title"`: short descriptive title
- `"description"`: detailed description of what needs to be implemented
- `"acceptanceCriteria"`: array of strings describing testable acceptance criteria
- `"priority"`: integer starting from 1 (highest priority first)
- `"passes"`: `false` (all start as not passing)
- `"notes"`: empty string

### Ordering Guidelines

- Order stories by dependency and implementation priority
- Earlier stories should be foundational (e.g., data models before services, services before UI)
- Group related functionality together
- Infrastructure and setup stories come first

### Example

```json
[
  {
    "id": "US-001",
    "title": "Set up project structure",
    "description": "Initialize the project with required tooling and configuration.",
    "acceptanceCriteria": [
      "Project builds successfully",
      "Linting passes",
      "Tests can be run"
    ],
    "priority": 1,
    "passes": false,
    "notes": ""
  }
]
```

Return ONLY a valid JSON array, no other text.

---

## Phase 2: Story Editing

Modify the following user story based on the given instructions.

### Current User Story

{{current_story}}

### Modification Instructions

{{edit_instructions}}

### Instructions

Return ONLY the modified user story as a JSON object with the same fields (`id`, `title`, `description`, `acceptanceCriteria`, `priority`, `passes`, `notes`). Keep the same `id` and `priority`. Return ONLY valid JSON, no other text.
