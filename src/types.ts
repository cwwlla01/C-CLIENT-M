export type ThemeMode = "light" | "dark";

export type NavTab = "home" | "employees" | "review" | "tasks";

export type RuntimeStatus = "running" | "stopped" | "error";

export type WorkStatus = "idle" | "busy" | "blocked";

export type ReviewAction = "approve" | "reject" | "continue" | "dismiss";

export type TaskStatusTone = "active" | "queued" | "hint";

export type ConnectionMode = "connecting" | "live" | "error";

export type ConnectionState = {
  mode: ConnectionMode;
  label: string;
  detail: string;
};

export type AuthSession = {
  enabled: boolean;
  authenticated: boolean;
};

export type ProjectSpace = {
  id: string;
  projectName: string;
  status: string;
  nextAction: string;
  updatedAt: string;
  workspacePath: string;
};

export type DeliveryRecord = {
  id: string;
  title: string;
  meta: string;
};

export type EmployeeRecord = {
  id: string;
  memberId: string;
  name: string;
  role: string;
  company: string;
  department: string;
  employeeCode: string;
  workspacePath: string;
  projectName: string;
  shell: string;
  permission: string;
  runtimeStatus: RuntimeStatus;
  workStatus: WorkStatus;
  currentTask: string;
  nextAction: string;
  recentArtifact: string | null;
  recentCompleted: string | null;
  sessionId?: string | null;
  pid?: number | null;
  projectSpaces: ProjectSpace[];
  deliveries: DeliveryRecord[];
};

export type ReviewRecord = {
  id: string;
  memberId: string;
  employeeName: string;
  company: string;
  title: string;
  summary: string;
  workspacePath: string;
  responseMode: string;
  createdAt: string;
};

export type ReviewLog = {
  id: string;
  memberId: string;
  company: string;
  title: string;
  summary: string;
  action: string;
  mode: string;
  createdAt: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  owner: string;
  company: string;
  projectName: string;
  summary: string;
  status: string;
  tone: TaskStatusTone;
};

export type MobileSnapshot = {
  companies: string[];
  employees: EmployeeRecord[];
  reviews: ReviewRecord[];
  reviewLogs: ReviewLog[];
  tasks: TaskRecord[];
};

export type DispatchResult = {
  tone: "success" | "warning" | "info";
  title: string;
  detail: string;
  createdAt: string;
};

export type TaskDraft = {
  employeeId: string;
  projectName: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  timeWindow:
    | "within_30m"
    | "within_1h"
    | "within_3h"
    | "within_12h"
    | "within_24h"
    | "no_deadline";
  source: string;
  attachments: File[];
};
