import type {
  InspectorSettings,
  EmployeeLiveStatus,
  EmployeeRecord,
  InspectorResult,
  InspectorTestResult,
  MobileSnapshot,
  ProjectSpace,
  ReviewAction,
  ReviewLog,
  ReviewRecord,
  TaskDraft,
  TaskRecord,
} from "../types";
import { createDefaultInspectorSettings } from "../types";

const BRIDGE_HTTP_ORIGIN = import.meta.env.VITE_BRIDGE_HTTP_ORIGIN?.trim().replace(/\/+$/, "") ?? "";
const BRIDGE_WS_ORIGIN = import.meta.env.VITE_BRIDGE_WS_ORIGIN?.trim().replace(/\/+$/, "") ?? "";
const DEFAULT_PROJECT_ROOT = import.meta.env.VITE_PROJECT_ROOT?.trim() || "/workspace/company";

const API_KEY = import.meta.env.VITE_CCLIENT_KEY?.trim() ?? "";

type DiscoverRuntime = {
  company?: string;
  department?: string;
  employeeCode?: string;
  employeeName?: string;
  memberId?: string;
  name?: string;
  role?: string;
  shell?: string;
  permission?: string;
  projectName?: string;
  currentProject?: string;
  runtimeStatus?: string;
  workStatus?: string;
  currentTask?: string;
  nextAction?: string;
  workspacePath?: string;
  recentArtifact?: string | null;
  recentCompleted?: string | null;
  sessionId?: string | null;
  pid?: number | null;
};

type DiscoverResponse = {
  companies?: string[];
  runtimes?: DiscoverRuntime[];
};

type HealthResponse = {
  ok?: boolean;
};

type SettingsRootResponse = {
  projectRoot?: string;
};

type PromptResponse = {
  prompts?: Array<{
    id: string;
    memberId: string;
    replyRiskLevel?: string;
    replyText?: string;
    replyType?: string;
    responseMode: "approve_reject" | "continue_only" | "notify_only" | string;
    title: string;
    summary: string;
    type?: string;
    workspacePath: string;
    createdAt: string;
  }>;
  logs?: Array<{
    title: string;
    summary: string;
    mode: string;
    action: string;
    memberId: string;
    createdAt: string;
    workspacePath?: string;
  }>;
};

type ProjectsResponse = {
  projects?: Array<{
    projectName?: string;
    status?: string;
    nextAction?: string;
    updatedAt?: string;
    workspacePath?: string;
  }>;
};

type DeliveriesResponse = {
  artifacts?: Array<{
    path?: string;
    name?: string;
  }>;
  finished?: Array<{
    title?: string;
    completedTask?: string;
    createdAt?: string;
  }>;
};

type EmployeeTasksResponse = {
  tasks?: {
    currentProject?: string;
    currentTask?: string;
    nextAction?: string;
    queuedProjects?: Array<{
      projectName?: string;
      taskSummary?: string;
      status?: string;
      workspacePath?: string;
      timeWindow?: string;
      priority?: string;
    }>;
  };
};

type EmployeeStatusResponse = {
  status?: {
    runtimeStatus?: string;
    workStatus?: string;
    currentProject?: string;
    currentTask?: string;
    nextAction?: string;
    sessionId?: string | null;
    pid?: number | null;
    startedAt?: string | null;
    stoppedAt?: string | null;
    recoveryPending?: boolean;
    workspacePath?: string;
    resolvedShell?: string | null;
    codexSessionId?: string | null;
    inspector?: Record<string, unknown> | null;
  };
};

type InspectorReviewResponse = {
  ok?: boolean;
  result?: Record<string, unknown> | null;
};

type InspectorSettingsLoadResponse = {
  filePath?: string;
  settings?: Record<string, unknown>;
};

async function fetchJson<T>(path: string, init?: RequestInit, signal?: AbortSignal) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (API_KEY) {
    headers.set("X-CClient-Key", API_KEY);
  }

  const response = await fetch(buildBridgeUrl(path), {
    ...init,
    signal,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    let normalizedMessage = message;

    try {
      const parsed = JSON.parse(message);
      normalizedMessage =
        typeof parsed?.error === "string" && parsed.error.trim()
          ? parsed.error
          : message;
    } catch {
      // keep original text
    }

    throw new Error(normalizedMessage || `${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizeRuntimeStatus(value?: string): EmployeeRecord["runtimeStatus"] {
  if (value === "running" || value === "stopped" || value === "error") {
    return value;
  }
  return "stopped";
}

function normalizeWorkStatus(value?: string): EmployeeRecord["workStatus"] {
  if (value === "idle" || value === "busy" || value === "blocked") {
    return value;
  }
  return "idle";
}

async function probeBridge(signal?: AbortSignal) {
  const response = await fetch(buildBridgeUrl("/health"), {
    signal,
    headers: buildHealthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`/health failed with ${response.status}`);
  }

  const payload = (await response.json()) as HealthResponse;
  if (!payload.ok) {
    throw new Error("bridge health is not ok");
  }
}

function buildBridgeUrl(path: string) {
  return BRIDGE_HTTP_ORIGIN ? `${BRIDGE_HTTP_ORIGIN}${path}` : path;
}

function buildHealthHeaders() {
  const headers = new Headers();

  if (API_KEY) {
    headers.set("X-CClient-Key", API_KEY);
  }

  return headers;
}

function mapEmployee(runtime: DiscoverRuntime): EmployeeRecord {
  const workspacePath = runtime.workspacePath ?? "/workspace/company/unknown";
  const employeeName = runtime.employeeName ?? runtime.name ?? "未命名员工";
  const projectName = runtime.currentProject ?? runtime.projectName ?? "未命名项目";

  return {
    id: runtime.memberId ?? runtime.employeeCode ?? employeeName,
    memberId: runtime.memberId ?? runtime.employeeCode ?? employeeName,
    name: employeeName,
    role: runtime.role ?? "实现执行",
    company: runtime.company ?? "未分配公司",
    department: runtime.department ?? "未分配部门",
    employeeCode: runtime.employeeCode ?? runtime.memberId ?? employeeName,
    workspacePath,
    projectName,
    shell: runtime.shell ?? "PowerShell 7.5",
    permission: runtime.permission ?? "受限模式",
    runtimeStatus: normalizeRuntimeStatus(runtime.runtimeStatus),
    workStatus: normalizeWorkStatus(runtime.workStatus),
    currentTask: runtime.currentTask ?? "等待任务分配",
    nextAction: runtime.nextAction ?? "等待新的任务指派",
    recentArtifact: runtime.recentArtifact ?? null,
    recentCompleted: runtime.recentCompleted ?? null,
    sessionId: runtime.sessionId ?? null,
    pid: runtime.pid ?? null,
    codexSessionId: null,
    projectSpaces: [
      {
        id: `${workspacePath}:${projectName}`,
        projectName,
        status: "当前项目",
        nextAction: runtime.nextAction ?? "等待新的任务指派",
        updatedAt: "刚刚同步",
        workspacePath,
      },
    ],
    deliveries: [
      {
        id: `${workspacePath}:recent`,
        title: runtime.recentArtifact ?? runtime.recentCompleted ?? "暂无交付",
        meta: runtime.recentArtifact ? "最近交付" : "最近完成",
      },
    ],
  };
}

function mapInspectorReplyCandidate(value: unknown): InspectorResult["replyCandidate"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  return {
    type: String(candidate.type || ""),
    riskLevel: String(candidate.riskLevel || ""),
    suggestedReply: String(candidate.suggestedReply || ""),
    summary: String(candidate.summary || ""),
  };
}

function mapInspectorResult(value: unknown): InspectorResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;

  return {
    taskState: String(raw.taskState || ""),
    verdict: String(raw.verdict || ""),
    confidence: typeof raw.confidence === "number" ? raw.confidence : null,
    summary: String(raw.summary || ""),
    ruleMatches: Array.isArray(raw.ruleMatches) ? raw.ruleMatches.map((item) => String(item)) : [],
    risks: Array.isArray(raw.risks) ? raw.risks.map((item) => String(item)) : [],
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.map((item) => String(item)) : [],
    replyCandidate: mapInspectorReplyCandidate(raw.replyCandidate),
    targetFiles: Array.isArray(raw.targetFiles) ? raw.targetFiles.map((item) => String(item)) : [],
    matchedTargetFiles: Array.isArray(raw.matchedTargetFiles)
      ? raw.matchedTargetFiles.map((item) => String(item))
      : [],
    missingTargetFiles: Array.isArray(raw.missingTargetFiles)
      ? raw.missingTargetFiles.map((item) => String(item))
      : [],
    lastSilenceSeconds: typeof raw.lastSilenceSeconds === "number" ? raw.lastSilenceSeconds : null,
    aiUsed: raw.aiUsed === true,
    aiError: String(raw.aiError || ""),
    aiConfidence: typeof raw.aiConfidence === "number" ? raw.aiConfidence : null,
    aiReason: String(raw.aiReason || ""),
    replyConfidence: typeof raw.replyConfidence === "number" ? raw.replyConfidence : null,
    decisionSource: String(raw.decisionSource || ""),
    autoPilotDecision: String(raw.autoPilotDecision || ""),
    lastAutoReplyAt: raw.lastAutoReplyAt ? String(raw.lastAutoReplyAt) : null,
    createdAt: raw.createdAt ? String(raw.createdAt) : null,
  };
}

function normalizeStringList(value: unknown, fallback: string[]) {
  const next = Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return next.length > 0 ? next : fallback;
}

function normalizeInspectorSettings(value: unknown): InspectorSettings {
  const defaults = createDefaultInspectorSettings();
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const ai = raw.ai && typeof raw.ai === "object" ? (raw.ai as Record<string, unknown>) : {};
  const thresholds =
    raw.thresholds && typeof raw.thresholds === "object"
      ? (raw.thresholds as Record<string, unknown>)
      : {};
  const preferences =
    raw.preferences && typeof raw.preferences === "object"
      ? (raw.preferences as Record<string, unknown>)
      : {};

  return {
    ai: {
      apiKey: String(ai.apiKey || defaults.ai.apiKey),
      baseUrl: String(ai.baseUrl || defaults.ai.baseUrl),
      enabled: ai.enabled === true,
      maxTokens:
        typeof ai.maxTokens === "number" && Number.isFinite(ai.maxTokens)
          ? ai.maxTokens
          : defaults.ai.maxTokens,
      model: String(ai.model || defaults.ai.model),
      reasoningEffort:
        ai.reasoningEffort === "medium" || ai.reasoningEffort === "high"
          ? ai.reasoningEffort
          : defaults.ai.reasoningEffort,
    },
    allowedReplyTypes: normalizeStringList(raw.allowedReplyTypes, defaults.allowedReplyTypes),
    autoReplyEnabled: raw.autoReplyEnabled !== false,
    autopilotMode:
      raw.autopilotMode === "off" ||
      raw.autopilotMode === "safe_auto" ||
      raw.autopilotMode === "full_auto"
        ? raw.autopilotMode
        : defaults.autopilotMode,
    blockedReplyTypes: normalizeStringList(raw.blockedReplyTypes, defaults.blockedReplyTypes),
    enabled: raw.enabled !== false,
    highRiskAlwaysManual: raw.highRiskAlwaysManual !== false,
    inspectionMode:
      raw.inspectionMode === "hybrid" || raw.inspectionMode === "ai_only"
        ? raw.inspectionMode
        : defaults.inspectionMode,
    preferences: {
      preferConservative: preferences.preferConservative !== false,
      preferContinue: preferences.preferContinue !== false,
      preferNonDestructive: preferences.preferNonDestructive !== false,
      preferOptionA: preferences.preferOptionA === true,
    },
    thresholds: {
      autoReplyScore:
        typeof thresholds.autoReplyScore === "number" && Number.isFinite(thresholds.autoReplyScore)
          ? thresholds.autoReplyScore
          : defaults.thresholds.autoReplyScore,
      blockedScore:
        typeof thresholds.blockedScore === "number" && Number.isFinite(thresholds.blockedScore)
          ? thresholds.blockedScore
          : defaults.thresholds.blockedScore,
      completionScore:
        typeof thresholds.completionScore === "number" &&
        Number.isFinite(thresholds.completionScore)
          ? thresholds.completionScore
          : defaults.thresholds.completionScore,
      silenceSeconds:
        typeof thresholds.silenceSeconds === "number" && Number.isFinite(thresholds.silenceSeconds)
          ? thresholds.silenceSeconds
          : defaults.thresholds.silenceSeconds,
    },
  };
}

function mapEmployeeTasks(owner: EmployeeRecord, payload?: EmployeeTasksResponse["tasks"]): TaskRecord[] {
  if (!payload) {
    return [];
  }

  const tasks: TaskRecord[] = [];

  if (payload.currentTask) {
    tasks.push({
      id: `${owner.id}:active`,
      title: "当前任务",
      owner: owner.name,
      company: owner.company,
      projectName: payload.currentProject ?? owner.projectName,
      summary: payload.currentTask,
      status: payload.nextAction ?? owner.nextAction,
      tone: "active",
    });
  }

  for (const item of payload.queuedProjects ?? []) {
    tasks.push({
      id: `${owner.id}:queued:${item.workspacePath ?? item.projectName ?? tasks.length}`,
      title: "排队任务",
      owner: owner.name,
      company: owner.company,
      projectName: item.projectName ?? payload.currentProject ?? owner.projectName,
      summary: item.taskSummary ?? "等待切换到目标项目",
      status: item.status ?? item.timeWindow ?? item.priority ?? "queued",
      tone: "queued",
    });
  }

  return tasks;
}

export async function loadMobileSnapshot(signal?: AbortSignal): Promise<MobileSnapshot> {
  await probeBridge(signal);

  const rootInfo = await fetchJson<SettingsRootResponse>("/api/settings/root", undefined, signal);

  const [discover, prompts] = await Promise.all([
    fetchJson<DiscoverResponse>(
      "/api/workspace/discover",
      {
        method: "POST",
        body: JSON.stringify({
          projectRoot:
            rootInfo.projectRoot ||
            DEFAULT_PROJECT_ROOT,
        }),
      },
      signal,
    ),
    fetchJson<PromptResponse>("/api/runtime/prompts", undefined, signal),
  ]);

  const employees = (discover.runtimes ?? []).map(mapEmployee);
  const employeeTasks = await Promise.all(
    employees.map(async (employee) => {
      const response = await fetchJson<EmployeeTasksResponse>(
        "/api/employee/tasks",
        {
          method: "POST",
          body: JSON.stringify({ workspacePath: employee.workspacePath }),
        },
        signal,
      );

      return mapEmployeeTasks(employee, response.tasks);
    }),
  );
  const reviews: ReviewRecord[] = (prompts.prompts ?? []).map((prompt) => {
    const employee = employees.find((item) => item.memberId === prompt.memberId);
    return {
      id: prompt.id,
      memberId: prompt.memberId,
      employeeName: employee?.name ?? prompt.memberId,
      company: employee?.company ?? "",
      title: prompt.title,
      summary: prompt.summary,
      workspacePath: prompt.workspacePath,
      responseMode: prompt.responseMode,
      type: prompt.type ?? "",
      replyRiskLevel: prompt.replyRiskLevel ?? "",
      replyType: prompt.replyType ?? "",
      replyText: prompt.replyText ?? "",
      createdAt: prompt.createdAt,
    };
  });

  const reviewLogs: ReviewLog[] = (prompts.logs ?? []).map((log, index) => {
    const employee = employees.find((item) => item.memberId === log.memberId);
    return {
      id: `${log.memberId}:${index}`,
      memberId: log.memberId,
      company: employee?.company ?? "",
      title: log.title,
      summary: log.summary,
      action: log.action,
      mode: log.mode,
      workspacePath: log.workspacePath ?? "",
      createdAt: log.createdAt,
    };
  });

  const companies = Array.from(
    new Set(
      [
        ...(discover.companies ?? []),
        ...employees.map((employee) => employee.company).filter(Boolean),
      ].filter(Boolean),
    ),
  );

  return {
    companies,
    employees,
    reviews,
    reviewLogs,
    tasks: employeeTasks.flat(),
  };
}

export async function loadEmployeeExtras(workspacePath: string, signal?: AbortSignal) {
  const [projects, deliveries] = await Promise.all([
    fetchJson<ProjectsResponse>(
      "/api/workspace/projects",
      {
        method: "POST",
        body: JSON.stringify({ workspacePath }),
      },
      signal,
    ),
    fetchJson<DeliveriesResponse>(
      "/api/workspace/history",
      {
        method: "POST",
        body: JSON.stringify({ workspacePath }),
      },
      signal,
    ),
  ]);

  const projectSpaces: ProjectSpace[] = (projects.projects ?? []).map((project, index) => ({
    id: `${workspacePath}:project:${index}`,
    projectName: project.projectName ?? `项目 ${index + 1}`,
    status: project.status ?? "未知",
    nextAction: project.nextAction ?? "等待新的任务指派",
    updatedAt: project.updatedAt ?? "刚刚同步",
    workspacePath: project.workspacePath ?? `${workspacePath}/${project.projectName ?? `project-${index + 1}`}`,
  }));

  const artifacts = (deliveries.artifacts ?? []).map((artifact, index) => ({
    id: `${workspacePath}:artifact:${index}`,
    title: artifact.name ?? artifact.path ?? `artifact-${index + 1}`,
    meta: "交付物",
  }));

  const finished = (deliveries.finished ?? []).map((item, index) => ({
    id: `${workspacePath}:finished:${index}`,
    title: item.title ?? item.completedTask ?? `finished-${index + 1}`,
    meta: item.createdAt ?? "完成记录",
  }));

  return {
    projectSpaces,
    deliveries: [...artifacts, ...finished],
  };
}

export async function loadEmployeeStatus(
  workspacePath: string,
  signal?: AbortSignal,
): Promise<EmployeeLiveStatus | null> {
  const response = await fetchJson<EmployeeStatusResponse>(
    "/api/employee/status",
    {
      method: "POST",
      body: JSON.stringify({ workspacePath }),
    },
    signal,
  );

  const status = response.status;
  if (!status) {
    return null;
  }

  const inspector = mapInspectorResult(status.inspector);

  return {
    runtimeStatus: normalizeRuntimeStatus(status.runtimeStatus),
    workStatus: normalizeWorkStatus(status.workStatus),
    currentProject: status.currentProject ?? "未命名项目",
    currentTask: status.currentTask ?? "等待任务分配",
    nextAction: status.nextAction ?? "等待新的任务指派",
    sessionId: status.sessionId ?? null,
    pid: status.pid ?? null,
    startedAt: status.startedAt ?? null,
    stoppedAt: status.stoppedAt ?? null,
    recoveryPending: Boolean(status.recoveryPending),
    workspacePath: status.workspacePath ?? workspacePath,
    resolvedShell: status.resolvedShell ?? null,
    codexSessionId: typeof status.codexSessionId === "string" ? status.codexSessionId : null,
    inspector,
  };
}

async function loadProjectRoot(signal?: AbortSignal) {
  const rootInfo = await fetchJson<SettingsRootResponse>("/api/settings/root", undefined, signal);
  return (rootInfo.projectRoot || DEFAULT_PROJECT_ROOT).trim();
}

export async function loadInspectorSettings(signal?: AbortSignal) {
  const projectRoot = await loadProjectRoot(signal);
  const response = await fetchJson<InspectorSettingsLoadResponse>(
    "/api/settings/inspector/load",
    {
      method: "POST",
      body: JSON.stringify({ projectRoot }),
    },
    signal,
  );

  return {
    filePath: String(response.filePath || ""),
    projectRoot,
    settings: normalizeInspectorSettings(response.settings),
  };
}

export async function saveInspectorSettings(settings: InspectorSettings, signal?: AbortSignal) {
  const projectRoot = await loadProjectRoot(signal);
  const response = await fetchJson<InspectorSettingsLoadResponse>(
    "/api/settings/inspector/save",
    {
      method: "POST",
      body: JSON.stringify({
        projectRoot,
        settings,
      }),
    },
    signal,
  );

  return {
    filePath: String(response.filePath || ""),
    projectRoot,
    settings: normalizeInspectorSettings(response.settings),
  };
}

export async function testInspectorSettings(settings: InspectorSettings, signal?: AbortSignal) {
  return fetchJson<InspectorTestResult>(
    "/api/settings/inspector/test",
    {
      method: "POST",
      body: JSON.stringify({ settings }),
    },
    signal,
  );
}

export async function respondToReview(promptId: string, action: ReviewAction) {
  return fetchJson("/api/runtime/prompts/respond", {
    method: "POST",
    body: JSON.stringify({ promptId, action }),
  });
}

export async function runInspectorReview(employee: EmployeeRecord) {
  const response = await fetchJson<InspectorReviewResponse>("/api/inspector/review", {
    method: "POST",
    body: JSON.stringify({
      memberId: employee.memberId,
      workspacePath: employee.workspacePath,
    }),
  });

  return mapInspectorResult(response.result);
}

export async function sendInspectorReply(employee: EmployeeRecord, replyText: string) {
  return fetchJson("/api/inspector/reply", {
    method: "POST",
    body: JSON.stringify({
      memberId: employee.memberId,
      workspacePath: employee.workspacePath,
      replyText,
    }),
  });
}

async function encodeAttachment(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function assignTask(employee: EmployeeRecord, draft: TaskDraft) {
  const attachments = await Promise.all(
    draft.attachments.map(async (file) => ({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      contentBase64: await encodeAttachment(file),
      isImage: file.type.startsWith("image/"),
    })),
  );

  return fetchJson<{
    mode?: "current" | "queued" | "project_switch" | "queued_project";
    projectName?: string;
    switchWorkspacePath?: string;
    currentTask?: string;
  }>("/api/task/assign", {
    method: "POST",
    body: JSON.stringify({
      memberId: employee.memberId,
      employeeName: employee.name,
      company: employee.company,
      department: employee.department,
      workspacePath: employee.workspacePath,
      projectName: draft.projectName,
      taskDescription: draft.description,
      priority: draft.priority,
      timeWindow: draft.timeWindow,
      source: draft.source,
      forceCurrent: false,
      attachments,
    }),
  });
}

export async function controlRuntime(employee: EmployeeRecord, action: "start" | "stop" | "restart") {
  const path =
    action === "start"
      ? "/api/runtime/start"
      : action === "restart"
        ? "/api/runtime/restart"
        : "/api/runtime/stop";

  return fetchJson(path, {
    method: "POST",
    body: JSON.stringify(
      action === "stop"
        ? {
            memberId: employee.memberId,
            cwd: employee.workspacePath,
          }
        : {
            memberId: employee.memberId,
            cwd: employee.workspacePath,
            permission: employee.permission,
            shell: employee.shell,
            cols: 120,
            rows: 30,
          },
    ),
  });
}

export async function switchEmployeeProject(employee: EmployeeRecord, targetWorkspacePath: string) {
  return fetchJson<{
    mode?: "switched" | "unchanged" | "blocked_active_task";
    projectName?: string;
    workspacePath?: string;
    currentTask?: string;
  }>("/api/employee/projects/switch", {
    method: "POST",
    body: JSON.stringify({
      workspacePath: employee.workspacePath,
      targetWorkspacePath,
    }),
  });
}

function inferBridgeWebSocketOrigin() {
  if (BRIDGE_WS_ORIGIN) {
    return BRIDGE_WS_ORIGIN;
  }

  if (BRIDGE_HTTP_ORIGIN) {
    return BRIDGE_HTTP_ORIGIN.replace(/^http/i, "ws");
  }

  if (typeof window === "undefined") {
    return "ws://127.0.0.1:4285";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

export function buildTerminalSocketUrl(input: Pick<EmployeeRecord, "memberId" | "shell" | "workspacePath">) {
  const params = new URLSearchParams({
    attachOnly: "1",
    memberId: input.memberId,
    shell: input.shell,
    cwd: input.workspacePath,
    cols: "120",
    rows: "32",
  });

  if (API_KEY) {
    params.set("token", API_KEY);
  }

  return `${inferBridgeWebSocketOrigin()}/terminal?${params.toString()}`;
}
