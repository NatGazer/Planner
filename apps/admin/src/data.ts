import { api } from '@ui/lib/api';
import type {
  AuditEntry, Completion, Dashboard, EquipmentSummary, EquipmentType, MaintenanceRule, Task,
} from '@ui/lib/types';

/** Every administrator call in one place, so screens never build URLs. */

export interface TaskFilters {
  bucket?: string | null;
  /** An exact due date — what a day column in the workload chart opens. */
  on?: string | null;
  equipmentId?: string | null;
  typeId?: string | null;
  ruleId?: string | null;
  search?: string | null;
  includeHidden?: boolean;
}

export interface TaskListResponse {
  today: string;
  tasks: Task[];
  /** Across the whole list, ignoring the due-status tab. */
  counts: { total: number; overdue: number; today: number; soon: number; later: number };
  shown: number;
  /** True when the list hit its ceiling — the counts above are still exact. */
  truncated?: boolean;
}

export interface EquipmentDetailResponse {
  today: string;
  equipment: EquipmentSummary;
  tasks: Task[];
  history: { items: Completion[]; total: number };
  rules: MaintenanceRule[];
  activity: AuditEntry[];
}

export interface RuleDetailResponse {
  today: string;
  rule: MaintenanceRule;
  tasks: Task[];
  history: Completion[];
  activity: AuditEntry[];
}

export const adminApi = {
  dashboard: () => api.get<Dashboard>('/api/admin/dashboard'),

  tasks: (filters: TaskFilters = {}) => api.get<TaskListResponse>('/api/admin/tasks', {
    bucket: filters.bucket ?? undefined,
    on: filters.on ?? undefined,
    equipmentId: filters.equipmentId ?? undefined,
    typeId: filters.typeId ?? undefined,
    ruleId: filters.ruleId ?? undefined,
    search: filters.search ?? undefined,
    includeHidden: filters.includeHidden ? 'true' : undefined,
  }),
  reschedule: (taskId: string, dueDate: string, reason?: string) =>
    api.post<{ task: Task; changed: boolean }>(`/api/admin/tasks/${taskId}/reschedule`, { dueDate, reason }),

  types: () => api.get<{ types: EquipmentType[]; accents: string[]; icons: string[] }>('/api/admin/types'),
  createType: (body: { name: string; accent?: string; icon?: string }) =>
    api.post<{ type: EquipmentType }>('/api/admin/types', body),
  updateType: (id: string, body: { name?: string; accent?: string; icon?: string }) =>
    api.patch<{ type: EquipmentType }>(`/api/admin/types/${id}`, body),
  archiveType: (id: string) => api.post<{ ok: true }>(`/api/admin/types/${id}/archive`),

  equipment: (filters: { typeId?: string | null; active?: boolean | null; search?: string | null } = {}) =>
    api.get<{ today: string; equipment: EquipmentSummary[] }>('/api/admin/equipment', {
      typeId: filters.typeId ?? undefined,
      active: filters.active === null || filters.active === undefined ? undefined : String(filters.active),
      search: filters.search ?? undefined,
    }),
  equipmentDetail: (id: string) => api.get<EquipmentDetailResponse>(`/api/admin/equipment/${id}`),
  createEquipment: (body: {
    code: string; name: string; typeId: string; location?: string; active?: boolean; firstDueDate?: string | null;
  }) => api.post<{ equipment: EquipmentSummary; tasksOpened: number }>('/api/admin/equipment', body),
  updateEquipment: (id: string, body: {
    code?: string; name?: string; typeId?: string; location?: string | null; active?: boolean;
  }) => api.patch<{ equipment: EquipmentSummary }>(`/api/admin/equipment/${id}`, body),
  duplicateEquipment: (id: string, body: { code?: string; name?: string; location?: string | null; count?: number; firstDueDate?: string | null }) =>
    api.post<{ created: EquipmentSummary[] }>(`/api/admin/equipment/${id}/duplicate`, body),
  archiveEquipment: (id: string) => api.post<{ ok: true }>(`/api/admin/equipment/${id}/archive`),

  rules: (filters: { typeId?: string | null; active?: boolean | null } = {}) =>
    api.get<{ rules: MaintenanceRule[] }>('/api/admin/rules', {
      typeId: filters.typeId ?? undefined,
      active: filters.active === null || filters.active === undefined ? undefined : String(filters.active),
    }),
  ruleDetail: (id: string) => api.get<RuleDetailResponse>(`/api/admin/rules/${id}`),
  createRule: (body: {
    typeId: string; title: string; instructions?: string; intervalValue: number; intervalUnit: string;
    active?: boolean; firstDueDate?: string | null;
  }) => api.post<{ rule: MaintenanceRule; tasksOpened: number }>('/api/admin/rules', body),
  updateRule: (id: string, body: {
    title?: string; instructions?: string; intervalValue?: number; intervalUnit?: string; active?: boolean;
  }) => api.patch<{ rule: MaintenanceRule }>(`/api/admin/rules/${id}`, body),
  archiveRule: (id: string) => api.post<{ ok: true }>(`/api/admin/rules/${id}/archive`),

  history: (filters: {
    equipmentId?: string | null; employeeId?: string | null; typeId?: string | null;
    from?: string | null; to?: string | null; search?: string | null; limit?: number; offset?: number;
  } = {}) => api.get<{ today: string; items: Completion[]; total: number }>('/api/admin/history', {
    equipmentId: filters.equipmentId ?? undefined,
    employeeId: filters.employeeId ?? undefined,
    typeId: filters.typeId ?? undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    search: filters.search ?? undefined,
    limit: filters.limit,
    offset: filters.offset,
  }),
  completion: (id: string) => api.get<{ completion: Completion }>(`/api/admin/completions/${id}`),

  activity: (limit = 150) => api.get<{ activity: AuditEntry[] }>('/api/admin/activity', { limit }),
  employees: () => api.get<{ employees: { id: string; name: string; email: string; role: string; active: boolean }[] }>('/api/admin/employees'),
};
