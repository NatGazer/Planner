import { api } from '@ui/lib/api';
import type { Completion, Task } from '@ui/lib/types';

/**
 * The worker app's entire server surface: three reads and one write. There is
 * deliberately nothing here that could change equipment, rules or schedules —
 * and the worker server has no such endpoint to call even if there were.
 */

export interface TaskListResponse {
  today: string;
  timezone: string;
  counts: { total: number; overdue: number; today: number; soon: number };
  tasks: Task[];
}

export interface CompleteResponse {
  ok: true;
  completion: Completion;
  nextTask: { id: string; dueDate: string };
  today: string;
  tasks: Task[];
}

export const workerApi = {
  tasks: (search?: string) => api.get<TaskListResponse>('/api/worker/tasks', { search: search || undefined }),
  task: (id: string) => api.get<{ today: string; task: Task }>(`/api/worker/tasks/${id}`),
  complete: (id: string, body: { photoId: string; comment?: string }) =>
    api.post<CompleteResponse>(`/api/worker/tasks/${id}/complete`, { confirmed: true, ...body }),
};
