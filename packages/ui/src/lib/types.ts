/** Shapes returned by the maintenance API. Mirrors server/domain/queries.js. */

export type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';
export type DueBucket = 'overdue' | 'today' | 'soon' | 'later';
export type Role = 'admin' | 'worker';

export interface Employee {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export interface EquipmentTypeRef {
  id: string;
  name: string;
  accent: string;
  icon: string;
}

export interface EquipmentType extends EquipmentTypeRef {
  createdAt: string;
  equipmentCount: number;
  activeEquipmentCount: number;
  ruleCount: number;
  activeRuleCount: number;
}

export interface EquipmentSummary {
  id: string;
  code: string;
  name: string;
  location: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  type: EquipmentTypeRef;
  pendingCount: number;
  nextDue: string | null;
  completionCount: number;
  lastCompletedAt: string | null;
}

export interface MaintenanceRule {
  id: string;
  title: string;
  instructions: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  type: EquipmentTypeRef;
  pendingCount: number;
  completionCount: number;
}

export interface DueInfo {
  bucket: DueBucket;
  days: number;
  label: string;
}

export interface Task {
  id: string;
  dueDate: string;
  status: 'pending' | 'completed';
  createdAt: string;
  closedAt: string | null;
  due: DueInfo;
  equipment: {
    id: string;
    code: string;
    name: string;
    location: string | null;
    active: boolean;
    type: EquipmentTypeRef | null;
  };
  rule: {
    id: string;
    title: string;
    instructions: string;
    intervalValue: number;
    intervalUnit: IntervalUnit;
    active: boolean;
  };
}

export interface Completion {
  id: string;
  taskId: string;
  completedAt: string;
  completedOn: string;
  dueDate: string;
  daysLate: number;
  onTime: boolean;
  comment: string | null;
  photoId: string;
  employee: { id: string; name: string };
  equipment: {
    id: string; code: string; name: string; location: string | null;
    type: { id: string; name: string };
  };
  rule: {
    id: string; title: string; instructions: string;
    intervalValue: number; intervalUnit: IntervalUnit;
  };
}

export interface AuditEntry {
  id: string;
  at: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity: string;
  entity_id: string;
  summary: string;
  detail: Record<string, unknown> | null;
}

export interface DashboardStats {
  activeEquipment: number;
  totalEquipment: number;
  inactiveEquipment: number;
  equipmentTypes: number;
  activeRules: number;
  totalRules: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  later: number;
  outstanding: number;
  hiddenPending: number;
  completions30d: number;
  onTime30d: number;
  onTimeRate30d: number | null;
  completionsAllTime: number;
}

export interface Dashboard {
  today: string;
  timezone: string;
  stats: DashboardStats;
  completionTrend: { date: string; count: number }[];
  upcomingLoad: { date: string; count: number; carried: number }[];
  byType: { id: string; name: string; accent: string; icon: string; equipmentCount: number; overdue: number }[];
  attention: Task[];
  nextUp: Task[];
  recentCompletions: Completion[];
}

export interface ApiErrorShape {
  code: string;
  message: string;
  detail?: { field?: string } & Record<string, unknown>;
}
