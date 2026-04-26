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

export type InspectorInspectionMode = "rules_only" | "hybrid" | "ai_only";

export type InspectorAutopilotMode = "off" | "suggest_only" | "safe_auto" | "full_auto";

export type InspectorAiReasoningEffort = "low" | "medium" | "high";

export type InspectorSettings = {
  ai: {
    apiKey: string;
    baseUrl: string;
    enabled: boolean;
    maxTokens: number;
    model: string;
    reasoningEffort: InspectorAiReasoningEffort;
  };
  allowedReplyTypes: string[];
  autoReplyEnabled: boolean;
  autopilotMode: InspectorAutopilotMode;
  blockedReplyTypes: string[];
  enabled: boolean;
  highRiskAlwaysManual: boolean;
  inspectionMode: InspectorInspectionMode;
  preferences: {
    preferConservative: boolean;
    preferContinue: boolean;
    preferNonDestructive: boolean;
    preferOptionA: boolean;
  };
  thresholds: {
    autoReplyScore: number;
    blockedScore: number;
    completionScore: number;
    silenceSeconds: number;
  };
};

export type InspectorTestResult = {
  latencyMs: number;
  message: string;
  modelCount: number;
  models: string[];
  ok: boolean;
  testedUrl: string;
};

export function createDefaultInspectorSettings(): InspectorSettings {
  return {
    ai: {
      apiKey: "",
      baseUrl: "",
      enabled: false,
      maxTokens: 1200,
      model: "gpt-5.4-mini",
      reasoningEffort: "low",
    },
    allowedReplyTypes: ["choice_ab", "choice_numeric", "confirm_yes_no"],
    autoReplyEnabled: true,
    autopilotMode: "suggest_only",
    blockedReplyTypes: [
      "destructive_confirm",
      "mass_overwrite",
      "publish_confirm",
      "network_side_effect",
    ],
    enabled: true,
    highRiskAlwaysManual: true,
    inspectionMode: "rules_only",
    preferences: {
      preferConservative: true,
      preferContinue: true,
      preferNonDestructive: true,
      preferOptionA: false,
    },
    thresholds: {
      autoReplyScore: 80,
      blockedScore: 50,
      completionScore: 60,
      silenceSeconds: 20,
    },
  };
}

export type InspectorReplyCandidate = {
  type: string;
  riskLevel: "low" | "medium" | "high" | string;
  suggestedReply: string;
  summary: string;
};

export type InspectorResult = {
  taskState: string;
  verdict: string;
  confidence: number | null;
  summary: string;
  ruleMatches: string[];
  risks: string[];
  suggestions: string[];
  replyCandidate: InspectorReplyCandidate | null;
  targetFiles: string[];
  matchedTargetFiles: string[];
  missingTargetFiles: string[];
  lastSilenceSeconds: number | null;
  aiUsed: boolean;
  aiError: string;
  aiConfidence: number | null;
  aiReason: string;
  replyConfidence: number | null;
  decisionSource: string;
  autoPilotDecision: string;
  lastAutoReplyAt: string | null;
  createdAt: string | null;
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
  codexSessionId?: string | null;
  projectSpaces: ProjectSpace[];
  deliveries: DeliveryRecord[];
};

export type EmployeeLiveStatus = {
  runtimeStatus: RuntimeStatus;
  workStatus: WorkStatus;
  currentProject: string;
  currentTask: string;
  nextAction: string;
  sessionId: string | null;
  pid: number | null;
  startedAt: string | null;
  stoppedAt: string | null;
  recoveryPending: boolean;
  workspacePath: string;
  resolvedShell: string | null;
  codexSessionId: string | null;
  inspector: InspectorResult | null;
};

export type ReviewRecord = {
  id: string;
  memberId: string;
  employeeName: string;
  company: string;
  title: string;
  summary: string;
  workspacePath: string;
  responseMode: "approve_reject" | "continue_only" | "notify_only" | string;
  type: string;
  replyRiskLevel: string;
  replyType: string;
  replyText: string;
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
  workspacePath: string;
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
