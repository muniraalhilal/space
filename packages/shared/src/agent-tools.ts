/**
 * Catalogue of tools an AI agent can be granted. Implementations live in the API worker
 * (apps/api/src/agents/tools). Risk levels drive the approval policy:
 *  - read            : never requires approval
 *  - write_internal  : requires approval unless the agent is `autonomous` AND the org allows autonomous internal writes
 *  - write_external  : ALWAYS requires human approval (e.g. creating a GitHub issue)
 */
export type ToolRisk = 'read' | 'write_internal' | 'write_external';

export interface ToolMeta {
  name: string;
  label: string;
  description: string;
  risk: ToolRisk;
  integration?: 'github';
}

export const TOOL_CATALOG: ToolMeta[] = [
  { name: 'list_department_tasks', label: 'List department tasks', description: 'List tasks of the run department, optionally filtered by status.', risk: 'read' },
  { name: 'get_task', label: 'Read task', description: 'Read a task (with comments) belonging to the run department.', risk: 'read' },
  { name: 'get_request', label: 'Read request', description: 'Read a cross-department request involving the run department.', risk: 'read' },
  { name: 'read_file', label: 'Read file', description: 'Read the text content of a file the run department may access.', risk: 'read' },
  { name: 'department_stats', label: 'Department statistics', description: 'Aggregate task statistics computed from stored records.', risk: 'read' },
  { name: 'add_task_comment', label: 'Comment on task', description: 'Post a comment on a task, authored by the agent.', risk: 'write_internal' },
  { name: 'create_subtask', label: 'Create subtask', description: 'Create a subtask under a task of the run department.', risk: 'write_internal' },
  { name: 'save_document', label: 'Save document', description: 'Save a generated Markdown document to Files & Knowledge.', risk: 'write_internal' },
  { name: 'github_list_issues', label: 'GitHub: list issues', description: 'List open issues of an allow-listed repository.', risk: 'read', integration: 'github' },
  { name: 'github_get_pull_request', label: 'GitHub: read pull request', description: 'Read a pull request and its changed files.', risk: 'read', integration: 'github' },
  { name: 'github_recent_commits', label: 'GitHub: recent commits', description: 'List recent commits on the default branch.', risk: 'read', integration: 'github' },
  { name: 'github_create_issue', label: 'GitHub: create issue', description: 'Create an issue in an allow-listed repository.', risk: 'write_external', integration: 'github' },
];

export const TOOL_BY_NAME: Record<string, ToolMeta> = Object.fromEntries(TOOL_CATALOG.map((t) => [t.name, t]));
