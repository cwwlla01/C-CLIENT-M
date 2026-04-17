import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  assignTask,
  controlRuntime,
  loadEmployeeExtras,
  loadMobileSnapshot,
  respondToReview,
  switchEmployeeProject,
} from "./lib/bridge";
import { getAuthSession, loginWithPassword } from "./lib/auth";
import type {
  AuthSession,
  ConnectionState,
  DeliveryRecord,
  DispatchResult,
  EmployeeRecord,
  MobileSnapshot,
  NavTab,
  ProjectSpace,
  ReviewAction,
  ReviewRecord,
  TaskDraft,
  ThemeMode,
} from "./types";

type ToastState = {
  tone: "success" | "error" | "info";
  text: string;
};

type EmployeeExtrasState = {
  loading: boolean;
  projectSpaces: ProjectSpace[];
  deliveries: DeliveryRecord[];
};

type AuthGateState = AuthSession & {
  loading: boolean;
  submitting: boolean;
  error: string;
  password: string;
};

type ComposerPopoverType = "employee" | "priority" | "timeWindow" | null;

type ComposerPopoverState = {
  type: ComposerPopoverType;
  top: number;
  left: number;
  width: number;
};

const navItems: Array<{ id: NavTab; label: string }> = [
  { id: "home", label: "首页" },
  { id: "employees", label: "员工" },
  { id: "review", label: "审核" },
  { id: "tasks", label: "任务" },
];

const employeeFilters = [
  { id: "all", label: "全部" },
  { id: "running", label: "运行中" },
  { id: "blocked", label: "阻塞" },
] as const;

const taskFilters = [
  { id: "all", label: "全部任务" },
  { id: "pending", label: "待处理" },
] as const;

const priorityOptions: TaskDraft["priority"][] = ["P0", "P1", "P2"];
const timeWindowOptions: Array<{ value: TaskDraft["timeWindow"]; label: string }> = [
  { value: "within_30m", label: "30 分钟内" },
  { value: "within_1h", label: "1 小时内" },
  { value: "within_3h", label: "3 小时内" },
  { value: "within_12h", label: "12 小时内" },
  { value: "within_24h", label: "24 小时内" },
  { value: "no_deadline", label: "无明确截止" },
];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatRuntimeLabel(employee: EmployeeRecord) {
  if (employee.runtimeStatus === "running") {
    return "运行中";
  }
  if (employee.runtimeStatus === "error") {
    return "异常";
  }
  return "已停止";
}

function formatWorkLabel(employee: EmployeeRecord) {
  if (employee.workStatus === "blocked") {
    return "阻塞";
  }
  if (employee.workStatus === "busy") {
    return "处理中";
  }
  return "空闲";
}

function createConnectionState(mode: ConnectionState["mode"], detail: string): ConnectionState {
  return {
    mode,
    label: mode === "live" ? "已连接" : mode === "error" ? "连接异常" : "连接中",
    detail,
  };
}

function createEmptySnapshot(): MobileSnapshot {
  return {
    companies: [],
    employees: [],
    reviews: [],
    reviewLogs: [],
    tasks: [],
  };
}

function createInitialTaskDraft(employeeId = "", projectName = ""): TaskDraft {
  return {
    employeeId,
    projectName,
    description: "",
    priority: "P1",
    timeWindow: "within_3h",
    source: "移动监督端",
    attachments: [],
  };
}

function getTimeWindowLabel(value: TaskDraft["timeWindow"]) {
  return timeWindowOptions.find((option) => option.value === value)?.label ?? value;
}

function buildRiskMessages(snapshot: MobileSnapshot) {
  const blockedEmployees = snapshot.employees
    .filter((employee) => employee.workStatus === "blocked" || employee.runtimeStatus === "error")
    .map((employee) => `${employee.name}：${employee.nextAction}`);

  const reviewEmployees = snapshot.reviews.map(
    (review) => `${review.employeeName}：${review.title}`,
  );

  return [...reviewEmployees, ...blockedEmployees].slice(0, 3);
}

const APP_TITLE = import.meta.env.VITE_APP_TITLE?.trim() || "C-CLIENT-M";

function App() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [activeTab, setActiveTab] = useState<NavTab>("home");
  const [snapshot, setSnapshot] = useState<MobileSnapshot>(() => createEmptySnapshot());
  const [connection, setConnection] = useState<ConnectionState>(() =>
    createConnectionState("connecting", "正在连接业务接口"),
  );
  const [refreshing, setRefreshing] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState<(typeof employeeFilters)[number]["id"]>("all");
  const [taskFilter, setTaskFilter] = useState<(typeof taskFilters)[number]["id"]>("all");
  const [reviewView, setReviewView] = useState<"pending" | "logs">("pending");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeExtras, setEmployeeExtras] = useState<EmployeeExtrasState>({
    loading: false,
    projectSpaces: [],
    deliveries: [],
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPopover, setComposerPopover] = useState<ComposerPopoverState>({
    type: null,
    top: 0,
    left: 0,
    width: 0,
  });
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => createInitialTaskDraft());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [auth, setAuth] = useState<AuthGateState>({
    enabled: false,
    authenticated: false,
    loading: true,
    submitting: false,
    error: "",
    password: "",
  });
  const companyMenuRef = useRef<HTMLDivElement | null>(null);
  const composerPopoverRef = useRef<HTMLDivElement | null>(null);
  const employeeButtonRef = useRef<HTMLButtonElement | null>(null);
  const priorityButtonRef = useRef<HTMLButtonElement | null>(null);
  const timeWindowButtonRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const deferredEmployeeQuery = useDeferredValue(employeeQuery.trim().toLowerCase());
  const companyOptions = ["all", ...snapshot.companies];
  const selectedEmployee =
    snapshot.employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const companyEmployees = snapshot.employees.filter(
    (employee) => selectedCompany === "all" || employee.company === selectedCompany,
  );
  const filteredEmployees = companyEmployees.filter((employee) => {
    const matchesQuery =
      deferredEmployeeQuery.length === 0 ||
      [employee.name, employee.role, employee.projectName, employee.currentTask]
        .join(" ")
        .toLowerCase()
        .includes(deferredEmployeeQuery);

    if (!matchesQuery) {
      return false;
    }

    if (employeeFilter === "running") {
      return employee.runtimeStatus === "running";
    }

    if (employeeFilter === "blocked") {
      return employee.workStatus === "blocked" || employee.runtimeStatus === "error";
    }

    return true;
  });

  const visibleReviews = snapshot.reviews.filter(
    (review) => selectedCompany === "all" || review.company === selectedCompany,
  );
  const visibleReviewLogs = snapshot.reviewLogs.filter(
    (log) => selectedCompany === "all" || log.company === selectedCompany,
  );
  const visibleTasks = snapshot.tasks.filter((task) => {
    if (selectedCompany !== "all" && task.company !== selectedCompany) {
      return false;
    }

    if (taskFilter === "pending") {
      return task.tone === "queued";
    }
    return true;
  });

  const refreshSnapshot = useEffectEvent(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const liveSnapshot = await loadMobileSnapshot(signal);
      setSnapshot(liveSnapshot);
      setConnection(createConnectionState("live", "业务接口已连接"));
    } catch (error) {
      if (signal?.aborted) {
        return;
      }

      setSnapshot((current) => (current.employees.length ? current : createEmptySnapshot()));
      setConnection(
        createConnectionState(
          "error",
          error instanceof Error ? error.message : "bridge 连接失败",
        ),
      );
    } finally {
      setRefreshing(false);
    }
  });

  const refreshEmployeeExtras = useEffectEvent(async (employee: EmployeeRecord, signal?: AbortSignal) => {
    setEmployeeExtras({
      loading: true,
      projectSpaces: employee.projectSpaces,
      deliveries: employee.deliveries,
    });

    if (connection.mode !== "live") {
      setEmployeeExtras({
        loading: false,
        projectSpaces: employee.projectSpaces,
        deliveries: employee.deliveries,
      });
      return;
    }

    try {
      const extras = await loadEmployeeExtras(employee.workspacePath, signal);
      setEmployeeExtras({
        loading: false,
        projectSpaces: extras.projectSpaces.length ? extras.projectSpaces : employee.projectSpaces,
        deliveries: extras.deliveries.length ? extras.deliveries : employee.deliveries,
      });
    } catch {
      if (signal?.aborted) {
        return;
      }

      setEmployeeExtras({
        loading: false,
        projectSpaces: employee.projectSpaces,
        deliveries: employee.deliveries,
      });
    }
  });

  useEffect(() => {
    let cancelled = false;

    void getAuthSession()
      .then((session) => {
        if (cancelled) {
          return;
        }

        setAuth((current) => ({
          ...current,
          ...session,
          loading: false,
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        // In local vite dev there is no auth server, so keep auth disabled.
        setAuth((current) => ({
          ...current,
          enabled: false,
          authenticated: true,
          loading: false,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (auth.loading || (auth.enabled && !auth.authenticated)) {
      return () => controller.abort();
    }
    void refreshSnapshot(controller.signal);
    return () => controller.abort();
  }, [auth.authenticated, auth.enabled, auth.loading]);

  useEffect(() => {
    if (connection.mode !== "live") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshSnapshot();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [connection.mode]);

  useEffect(() => {
    if (!selectedEmployee) {
      return;
    }

    const controller = new AbortController();
    void refreshEmployeeExtras(selectedEmployee, controller.signal);
    return () => controller.abort();
  }, [connection.mode, selectedEmployee]);

  useEffect(() => {
    if (selectedCompany !== "all" && !snapshot.companies.includes(selectedCompany)) {
      setSelectedCompany("all");
    }
  }, [selectedCompany, snapshot.companies]);

  useEffect(() => {
    if (selectedCompany === "all" || !selectedEmployee) {
      return;
    }

    if (selectedEmployee.company !== selectedCompany) {
      setSelectedEmployeeId(null);
    }
  }, [selectedCompany, selectedEmployee]);

  useEffect(() => {
    if (!companyMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!companyMenuRef.current?.contains(event.target as Node)) {
        setCompanyMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCompanyMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [companyMenuOpen]);

  useEffect(() => {
    if (!composerPopover.type) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const inMenu = composerPopoverRef.current?.contains(target);
      const inButtons =
        employeeButtonRef.current?.contains(target) ||
        priorityButtonRef.current?.contains(target) ||
        timeWindowButtonRef.current?.contains(target);

      if (!inMenu && !inButtons) {
        setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [composerPopover]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2800);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  function showToast(text: string, tone: ToastState["tone"] = "info") {
    setToast({ text, tone });
  }

  function handleThemeChange(nextTheme: ThemeMode) {
    startTransition(() => {
      setTheme(nextTheme);
    });
  }

  function handleTabChange(nextTab: NavTab) {
    startTransition(() => {
      setActiveTab(nextTab);
    });
  }

  function openEmployeeDetail(employee: EmployeeRecord) {
    setSelectedEmployeeId(employee.id);
  }

  function closeEmployeeDetail() {
    setSelectedEmployeeId(null);
  }

  function openComposer(target?: EmployeeRecord) {
    const employee = target ?? snapshot.employees[0];
    if (!employee) {
      showToast("当前没有可派单员工", "error");
      return;
    }

    const nextDraft = createInitialTaskDraft(employee.id, employee.projectName);
    nextDraft.source = "移动监督端";

    setTaskDraft(nextDraft);
    setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
    setComposerOpen(true);
  }

  function toggleComposerPopover(type: Exclude<ComposerPopoverType, null>, element: HTMLElement | null) {
    if (!element) {
      return;
    }

    if (composerPopover.type === type) {
      setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
      return;
    }

    const rect = element.getBoundingClientRect();
    setComposerPopover({
      type,
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }

  function handleDraftChange<Key extends keyof TaskDraft>(key: Key, value: TaskDraft[Key]) {
    setTaskDraft((current) => {
      const next = { ...current, [key]: value };

      if (key === "employeeId") {
        const employee = snapshot.employees.find((item) => item.id === value);
        next.projectName = employee?.projectName ?? current.projectName;
      }

      return next;
    });
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    handleDraftChange("attachments", files);
  }

  async function handleRuntimeAction(employee: EmployeeRecord, action: "start" | "restart" | "stop") {
    try {
      if (connection.mode === "live") {
        await controlRuntime(employee, action);
      }

      setSnapshot((current) => ({
        ...current,
        employees: current.employees.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                runtimeStatus: action === "stop" ? "stopped" : "running",
                workStatus: action === "stop" ? "idle" : "busy",
                nextAction:
                  action === "stop"
                    ? "等待新的任务指派"
                    : action === "restart"
                      ? "会话已重启，等待恢复"
                      : "会话已启动，等待任务执行",
              }
            : item,
        ),
      }));
      showToast(
        `${employee.name}${action === "start" ? " 已启动" : action === "restart" ? " 已重启" : " 已停止"}`,
        "success",
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "运行控制失败", "error");
    }
  }

  async function handleReviewAction(review: ReviewRecord, action: ReviewAction) {
    try {
      if (connection.mode === "live") {
        await respondToReview(review.id, action);
      }

      setSnapshot((current) => ({
        ...current,
        reviews: current.reviews.filter((item) => item.id !== review.id),
        reviewLogs: [
          {
            id: `${review.id}:${action}`,
            memberId: review.memberId,
            company: review.company,
            title: review.title,
            summary: review.summary,
            action,
            mode: connection.mode === "live" ? "bridge" : "local-state",
            createdAt: new Date().toISOString(),
          },
          ...current.reviewLogs,
        ].slice(0, 6),
      }));
      showToast(`已处理审核消息：${review.title}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "审核处理失败", "error");
    }
  }

  async function handleProjectSwitch(employee: EmployeeRecord, project: ProjectSpace) {
    if (project.projectName === employee.projectName) {
      showToast(`${project.projectName} 已经是当前项目`, "info");
      return;
    }

    try {
      if (connection.mode === "live") {
        const result = await switchEmployeeProject(employee, project.workspacePath);

        if (result.mode === "blocked_active_task") {
          showToast(
            result.currentTask
              ? `当前仍有执行中任务：${result.currentTask}`
              : "当前仍有执行中任务，暂时无法切换项目",
            "error",
          );
          return;
        }
      }

      setSnapshot((current) => ({
        ...current,
        employees: current.employees.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                projectName: project.projectName,
                workspacePath: project.workspacePath,
                nextAction: `已切换到 ${project.projectName}`,
              }
            : item,
        ),
      }));
      setEmployeeExtras((current) => ({
        ...current,
        projectSpaces: current.projectSpaces.map((space) => ({
          ...space,
          status: space.projectName === project.projectName ? "当前项目" : space.status === "当前项目" ? "空闲" : space.status,
        })),
      }));
      showToast(`已切换到 ${project.projectName}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "项目切换失败", "error");
    }
  }

  async function handleSubmitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetEmployee = snapshot.employees.find((employee) => employee.id === taskDraft.employeeId);
    if (!targetEmployee) {
      showToast("请选择员工", "error");
      return;
    }

    if (!taskDraft.description.trim()) {
      showToast("请填写任务描述", "error");
      return;
    }

    try {
      let dispatchTone: DispatchResult["tone"] = "success";
      let dispatchTitle = `已发布给 ${targetEmployee.name}`;
      let dispatchDetail = `${taskDraft.projectName} · ${getTimeWindowLabel(taskDraft.timeWindow)}`;

      if (connection.mode !== "live") {
        throw new Error("bridge 不可用，当前无法发布真实任务");
      }

      const response = await assignTask(targetEmployee, taskDraft);
      const mode = typeof response?.mode === "string" ? response.mode : "current";

      if (mode === "queued" || mode === "queued_project") {
        dispatchTone = "warning";
        dispatchTitle = `任务已进入队列 · ${targetEmployee.name}`;
        dispatchDetail = `等待当前任务完成后处理 ${taskDraft.projectName}`;
      } else if (mode === "project_switch") {
        dispatchTone = "info";
        dispatchTitle = `任务触发项目切换 · ${targetEmployee.name}`;
        dispatchDetail = `${taskDraft.projectName} 已成为当前项目`;
      } else {
        dispatchTitle = `任务已直接派发 · ${targetEmployee.name}`;
        dispatchDetail = `${taskDraft.projectName} · ${taskDraft.priority}`;
      }

      const nextTask = {
        id: `task-${Date.now()}`,
        title: "当前任务",
        owner: targetEmployee.name,
        company: targetEmployee.company,
        projectName: taskDraft.projectName,
        summary: taskDraft.description,
        status: taskDraft.timeWindow === "within_30m" ? "立即执行" : getTimeWindowLabel(taskDraft.timeWindow),
        tone: "active" as const,
      };

      setSnapshot((current) => ({
        ...current,
        tasks: [nextTask, ...current.tasks],
        employees: current.employees.map((employee) =>
          employee.id === targetEmployee.id
            ? {
                ...employee,
                projectName: taskDraft.projectName,
                currentTask: taskDraft.description,
                nextAction: "等待任务执行确认",
                workStatus: "busy",
              }
            : employee,
        ),
      }));

      setDispatchResult({
        tone: dispatchTone,
        title: dispatchTitle,
        detail: dispatchDetail,
        createdAt: new Date().toISOString(),
      });
      setComposerOpen(false);
      setTaskDraft(createInitialTaskDraft(targetEmployee.id, targetEmployee.projectName));
      handleTabChange("tasks");
      showToast(`任务已发布给 ${targetEmployee.name}`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "发布任务失败", "error");
    }
  }

  const reviewCount = visibleReviews.length;
  const blockedCount = companyEmployees.filter(
    (employee) => employee.workStatus === "blocked" || employee.runtimeStatus === "error",
  ).length;
  const activeCount = companyEmployees.filter((employee) => employee.runtimeStatus === "running").length;
  const riskMessages = buildRiskMessages({
    ...snapshot,
    employees: companyEmployees,
    reviews: visibleReviews,
    reviewLogs: visibleReviewLogs,
    tasks: visibleTasks,
  });
  const serviceLabel =
    connection.mode === "live"
      ? "公司监督接口已连接"
      : connection.mode === "error"
        ? `Bridge 错误 · ${connection.detail}`
        : "正在尝试连接 bridge";

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.password.trim()) {
      setAuth((current) => ({ ...current, error: "请输入访问密码" }));
      return;
    }

    setAuth((current) => ({ ...current, submitting: true, error: "" }));
    try {
      const session = await loginWithPassword(auth.password);
      setAuth((current) => ({
        ...current,
        ...session,
        loading: false,
        submitting: false,
        password: "",
        error: "",
      }));
    } catch (error) {
      setAuth((current) => ({
        ...current,
        submitting: false,
        error: error instanceof Error ? error.message : "登录失败",
      }));
    }
  }

  if (auth.loading) {
    return (
      <div className={cn("app-shell", theme === "dark" && "theme-dark")}>
        <div className="auth-shell">
          <div className="auth-card">
            <p className="utility-brand">{APP_TITLE}</p>
            <h1 className="auth-title">检查访问权限</h1>
            <p className="auth-copy">正在确认当前部署是否启用了访问密码。</p>
          </div>
        </div>
      </div>
    );
  }

  if (auth.enabled && !auth.authenticated) {
    return (
      <div className={cn("app-shell", theme === "dark" && "theme-dark")}>
        <div className="auth-shell">
          <form className="auth-card" onSubmit={handleAuthSubmit}>
            <p className="utility-brand">{APP_TITLE}</p>
            <h1 className="auth-title">请输入访问密码</h1>
            <p className="auth-copy">当前部署已启用访问保护。输入部署时设置的密码后继续。</p>
            <input
              className="auth-input"
              type="password"
              value={auth.password}
              onChange={(event) => setAuth((current) => ({ ...current, password: event.target.value }))}
              placeholder="访问密码"
            />
            {auth.error && <p className="auth-error">{auth.error}</p>}
            <button className="auth-submit" type="submit" disabled={auth.submitting}>
              {auth.submitting ? "验证中" : "进入系统"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("app-shell", theme === "dark" && "theme-dark")}
      data-theme={theme === "dark" ? "supervisor-dark" : "supervisor-light"}
    >
      <div className="device">
        <header className="utility-bar">
          <div className="utility-brand-block">
            <div>
              <p className="utility-brand">{APP_TITLE}</p>
              <p className="utility-detail">公司维度监督端</p>
            </div>
          </div>
          <div className="utility-actions">
            <div className="company-dropdown" ref={companyMenuRef}>
              <button
                className="dropdown-trigger-surface company-dropdown-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={companyMenuOpen}
                onClick={() => setCompanyMenuOpen((current) => !current)}
              >
                <span>{selectedCompany === "all" ? "全部公司" : selectedCompany}</span>
                <span className={cn("company-dropdown-chevron", companyMenuOpen && "is-open")}>⌄</span>
              </button>
              {companyMenuOpen && (
                <div className="dropdown-menu-surface company-dropdown-menu" role="menu" aria-label="公司筛选">
                  {companyOptions.map((company) => (
                    <button
                      key={company}
                      className={cn("dropdown-item-surface company-dropdown-item", selectedCompany === company && "is-active")}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedCompany === company}
                      onClick={() => {
                        setSelectedCompany(company);
                        setCompanyMenuOpen(false);
                      }}
                    >
                      {company === "all" ? "全部公司" : company}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="theme-toggle" role="tablist" aria-label="主题切换与连接状态">
              <button
                className={cn("theme-toggle-button", theme === "light" && "is-active")}
                type="button"
                onClick={() => handleThemeChange("light")}
                aria-label="浅色主题"
                title="浅色主题"
              >
                ☀
              </button>
              <button
                className={cn("theme-toggle-button", theme === "dark" && "is-active")}
                type="button"
                onClick={() => handleThemeChange("dark")}
                aria-label="深色主题"
                title="深色主题"
              >
                ☾
              </button>
            </div>
          </div>
        </header>

        <main className="screen-region">
          {activeTab === "home" && (
            <section className="page">
              <div className="page-scroll">
                <PageHeading
                  title="监督总览"
                  subtitle={`全部公司 · ${activeCount} 运行中`}
                  meta="本地 Supervisor 监督台"
                />

                <div className="service-pill">
                  {selectedCompany === "all" ? "全部公司" : selectedCompany} · {serviceLabel}
                </div>

                <div className="stats-grid">
                  <MetricCard label="待审核" value={reviewCount} />
                  <MetricCard label="已阻塞" value={blockedCount} />
                </div>

                <div className="alert-card">
                  <p className="card-kicker">风险员工</p>
                  <p className="card-copy">
                    {riskMessages.length > 0 ? riskMessages.join("\n") : "当前没有需要升级处理的风险项"}
                  </p>
                </div>

                <section className="section-block">
                  <SectionTitle title="运行中员工" />
                  {refreshing && connection.mode === "connecting" ? (
                    <div className="stack-list">
                      <SkeletonCard />
                      <SkeletonCard />
                    </div>
                  ) : snapshot.employees.length ? (
                    <div className="stack-list">
                      {snapshot.employees.slice(0, 2).map((employee) => (
                        <EmployeeCard key={employee.id} employee={employee} onOpen={openEmployeeDetail} compact />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="暂无员工"
                      detail={
                        connection.mode === "error"
                          ? `接口不可用：${connection.detail}`
                          : "当前没有可展示的员工运行时。"
                      }
                    />
                  )}
                </section>
              </div>
            </section>
          )}

          {activeTab === "employees" && (
            <section className="page">
              <div className="page-scroll">
                <PageHeading title="员工" subtitle="员工列表与项目空间" />

                <div className="search-shell">
                  <input
                    aria-label="搜索员工"
                    className="search-input"
                    placeholder="搜索员工 / 项目 / 状态"
                    value={employeeQuery}
                    onChange={(event) => setEmployeeQuery(event.target.value)}
                  />
                </div>

                <div className="chip-row">
                  {employeeFilters.map((filter) => (
                    <button
                      key={filter.id}
                      className={cn("chip-button", employeeFilter === filter.id && "is-active")}
                      type="button"
                      onClick={() => setEmployeeFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {refreshing && connection.mode === "connecting" ? (
                  <div className="stack-list">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : filteredEmployees.length ? (
                  <div className="stack-list">
                    {filteredEmployees.map((employee) => (
                      <EmployeeCard key={employee.id} employee={employee} onOpen={openEmployeeDetail} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={connection.mode === "error" ? "无法读取员工数据" : "没有匹配结果"}
                    detail={
                      connection.mode === "error"
                        ? connection.detail
                        : "换个关键词，或者切换运行状态筛选。"
                    }
                  />
                )}
              </div>
            </section>
          )}

          {activeTab === "review" && (
            <section className="page">
              <div className="page-scroll">
                <PageHeading title="审核消息" subtitle={`${reviewCount} 条待处理`} />

                <div className="chip-row">
                  <button
                    className={cn("chip-button", reviewView === "pending" && "is-active")}
                    type="button"
                    onClick={() => setReviewView("pending")}
                  >
                    待处理
                  </button>
                  <button
                    className={cn("chip-button", reviewView === "logs" && "is-active")}
                    type="button"
                    onClick={() => setReviewView("logs")}
                  >
                    最近处理
                  </button>
                </div>

                <div className="stack-list">
                  {reviewView === "pending" ? refreshing && connection.mode === "connecting" ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : visibleReviews.length ? (
                    visibleReviews.map((review) => (
                      <article key={review.id} className="review-card">
                        <p className="card-kicker">{review.title}</p>
                        <p className="card-copy">
                          {review.employeeName}
                          <br />
                          {review.workspacePath}
                          <br />
                          {review.summary}
                        </p>
                        <div className="action-row">
                          <button className="action-button primary" type="button" onClick={() => handleReviewAction(review, "approve")}>
                            Approve
                          </button>
                          <button className="action-button secondary" type="button" onClick={() => handleReviewAction(review, "reject")}>
                            Reject
                          </button>
                          {review.responseMode === "continue" && (
                            <button className="action-button success" type="button" onClick={() => handleReviewAction(review, "continue")}>
                              Continue
                            </button>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState
                      title={connection.mode === "error" ? "无法读取审核消息" : "当前没有待审核消息"}
                      detail={
                        connection.mode === "error"
                          ? connection.detail
                          : "审核中心会在 bridge 收到提示时自动出现待办。"
                      }
                    />
                  ) : visibleReviewLogs.length ? (
                    <section className="section-block">
                      <SectionTitle title="最近处理" />
                      <div className="stack-list">
                        {visibleReviewLogs.map((log) => (
                          <article key={log.id} className="surface-card">
                            <p className="card-kicker">{log.title}</p>
                            <p className="card-copy">
                              {log.summary}
                              <br />
                              {log.mode} · {log.action}
                            </p>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <EmptyState title="还没有处理记录" detail="处理过审核消息后，这里会显示最近日志。" compact />
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "tasks" && (
            <section className="page page-tasks">
              <div className="page-scroll">
                <PageHeading title="任务中心" subtitle="发布、排队与执行态" />

                {dispatchResult && (
                  <article className={cn("dispatch-result", `tone-${dispatchResult.tone}`)}>
                    <p className="card-kicker">最近派单结果</p>
                    <p className="dispatch-title">{dispatchResult.title}</p>
                    <p className="dispatch-detail">{dispatchResult.detail}</p>
                  </article>
                )}

                <div className="chip-row">
                  {taskFilters.map((filter) => (
                    <button
                      key={filter.id}
                      className={cn("chip-button", taskFilter === filter.id && "is-active")}
                      type="button"
                      onClick={() => setTaskFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {refreshing && connection.mode === "connecting" ? (
                  <div className="stack-list task-list">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : visibleTasks.length ? (
                  <div className="stack-list task-list">
                    {visibleTasks.map((task) => (
                      <article
                        key={task.id}
                        className={cn("surface-card", task.tone === "hint" && "info-card")}
                      >
                        <p className="card-kicker">{task.title}</p>
                        <p className="card-copy">
                          {task.owner} · {task.projectName}
                          <br />
                          {task.summary}
                          <br />
                          状态：{task.status}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={connection.mode === "error" ? "无法读取任务数据" : "当前没有任务"}
                    detail={
                      connection.mode === "error"
                        ? connection.detail
                        : "从右下角主动作发布第一条任务。"
                    }
                  />
                )}
              </div>

              <div className="task-action-dock">
                <button className="archive-button" type="button">
                  任务归档
                </button>
                <button
                  className="fab-button"
                  type="button"
                  disabled={connection.mode !== "live" || snapshot.employees.length === 0}
                  onClick={() => openComposer()}
                >
                  <span className="fab-icon">+</span>
                  发布任务
                </button>
              </div>
            </section>
          )}
        </main>

        <nav className="bottom-nav" aria-label="底部导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={cn("bottom-nav-item", activeTab === item.id && "is-active")}
              type="button"
              onClick={() => handleTabChange(item.id)}
            >
              <span className="bottom-nav-dot" />
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {selectedEmployee && (
        <div className="overlay" role="presentation" onClick={closeEmployeeDetail}>
          <aside
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedEmployee.name} 详情`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <div>
                <p className="sheet-title">{selectedEmployee.name}</p>
                <p className="sheet-subtitle">
                  {selectedEmployee.role} · {selectedEmployee.projectName}
                </p>
              </div>
              <button className="close-button" type="button" onClick={closeEmployeeDetail}>
                关闭
              </button>
            </div>

            <div className="sheet-scroll">
              <div className="pill-row">
                <StatusPill label={formatRuntimeLabel(selectedEmployee)} tone={selectedEmployee.runtimeStatus} />
                <StatusPill label={formatWorkLabel(selectedEmployee)} tone={selectedEmployee.workStatus} />
              </div>

              <article className="surface-card">
                <p className="card-kicker">当前任务</p>
                <p className="card-copy">{selectedEmployee.currentTask}</p>
              </article>

              <article className="surface-card">
                <p className="card-kicker">项目空间</p>
                {employeeExtras.loading && <p className="card-copy subtle-copy">加载项目空间...</p>}
                {(employeeExtras.projectSpaces.length ? employeeExtras.projectSpaces : selectedEmployee.projectSpaces).map(
                  (project) => (
                    <div key={project.id} className="detail-row">
                      <div>
                        <p className="detail-row-title">{project.projectName}</p>
                        <p className="detail-row-meta">
                          {project.status} · {project.nextAction}
                        </p>
                      </div>
                      <div className="detail-row-side">
                        <span className="detail-row-time">{project.updatedAt}</span>
                        <button
                          className="mini-action"
                          type="button"
                          disabled={project.projectName === selectedEmployee.projectName}
                          onClick={() => void handleProjectSwitch(selectedEmployee, project)}
                        >
                          {project.projectName === selectedEmployee.projectName ? "当前项目" : "切换"}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </article>

              <article className="surface-card">
                <p className="card-kicker">最近交付</p>
                {employeeExtras.loading && <p className="card-copy subtle-copy">加载交付物...</p>}
                {(employeeExtras.deliveries.length ? employeeExtras.deliveries : selectedEmployee.deliveries).map(
                  (delivery) => (
                    <div key={delivery.id} className="detail-row">
                      <div>
                        <p className="detail-row-title">{delivery.title}</p>
                        <p className="detail-row-meta">{delivery.meta}</p>
                      </div>
                    </div>
                  ),
                )}
              </article>
            </div>

            <div className="sheet-actions">
              <button className="runtime-button success" type="button" onClick={() => void handleRuntimeAction(selectedEmployee, "start")}>
                启动
              </button>
              <button className="runtime-button neutral" type="button" onClick={() => void handleRuntimeAction(selectedEmployee, "restart")}>
                重启
              </button>
              <button className="runtime-button danger" type="button" onClick={() => void handleRuntimeAction(selectedEmployee, "stop")}>
                停止
              </button>
            </div>
          </aside>
        </div>
      )}

      {composerOpen && (
        <div className="overlay" role="presentation" onClick={() => setComposerOpen(false)}>
          <section
            className="sheet composer-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="发布任务"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-header">
              <div>
                <p className="sheet-title">发布任务</p>
                <p className="sheet-subtitle">完整派单：员工、项目、描述、优先级、时间窗口、附件。</p>
              </div>
              <button className="close-button btn btn-ghost btn-sm rounded-xl" type="button" onClick={() => setComposerOpen(false)}>
                关闭
              </button>
            </div>

            {composerPopover.type && (
              <div
                ref={composerPopoverRef}
                className="composer-popover composer-dropdown-menu-surface"
                style={{
                  top: composerPopover.top,
                  left: composerPopover.left,
                  width: composerPopover.width,
                }}
                role="menu"
              >
                {composerPopover.type === "employee" &&
                  snapshot.employees.map((employee) => (
                    <button
                      key={employee.id}
                      className={cn("dropdown-item-surface", taskDraft.employeeId === employee.id && "is-active")}
                      type="button"
                      onClick={() => {
                        handleDraftChange("employeeId", employee.id);
                        setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
                      }}
                    >
                      {employee.name} · {employee.role}
                    </button>
                  ))}
                {composerPopover.type === "priority" &&
                  priorityOptions.map((option) => (
                    <button
                      key={option}
                      className={cn("dropdown-item-surface", taskDraft.priority === option && "is-active")}
                      type="button"
                      onClick={() => {
                        handleDraftChange("priority", option);
                        setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
                      }}
                    >
                      {option}
                    </button>
                  ))}
                {composerPopover.type === "timeWindow" &&
                  timeWindowOptions.map((option) => (
                    <button
                      key={option.value}
                      className={cn("dropdown-item-surface", taskDraft.timeWindow === option.value && "is-active")}
                      type="button"
                      onClick={() => {
                        handleDraftChange("timeWindow", option.value);
                        setComposerPopover({ type: null, top: 0, left: 0, width: 0 });
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
              </div>
            )}

            <form className="composer-form" onSubmit={handleSubmitTask}>
              <label className="field-card">
                <span className="field-label">员工</span>
                <button
                  ref={employeeButtonRef}
                  className="dropdown-trigger-surface"
                  type="button"
                  aria-expanded={composerPopover.type === "employee"}
                  onClick={() => toggleComposerPopover("employee", employeeButtonRef.current)}
                >
                  <span>
                    {snapshot.employees.find((employee) => employee.id === taskDraft.employeeId)?.name ??
                      "选择员工"}
                    {" · "}
                    {snapshot.employees.find((employee) => employee.id === taskDraft.employeeId)?.role ?? ""}
                  </span>
                  <span>⌄</span>
                </button>
              </label>

              <label className="field-card">
                <span className="field-label">项目</span>
                <input
                  className="input input-bordered w-full rounded-2xl bg-base-100"
                  value={taskDraft.projectName}
                  onChange={(event) => handleDraftChange("projectName", event.target.value)}
                />
              </label>

              <label className="field-card">
                <span className="field-label">任务描述</span>
                <textarea
                  className="field-textarea textarea textarea-bordered w-full rounded-2xl bg-base-100"
                  value={taskDraft.description}
                  onChange={(event) => handleDraftChange("description", event.target.value)}
                />
              </label>

              <div className="field-grid">
                <label className="field-card">
                  <span className="field-label">优先级</span>
                  <button
                    ref={priorityButtonRef}
                    className="dropdown-trigger-surface"
                    type="button"
                    aria-expanded={composerPopover.type === "priority"}
                    onClick={() => toggleComposerPopover("priority", priorityButtonRef.current)}
                  >
                    <span>{taskDraft.priority}</span>
                    <span>⌄</span>
                  </button>
                </label>

                <label className="field-card">
                  <span className="field-label">时间窗口</span>
                  <button
                    ref={timeWindowButtonRef}
                    className="dropdown-trigger-surface"
                    type="button"
                    aria-expanded={composerPopover.type === "timeWindow"}
                    onClick={() => toggleComposerPopover("timeWindow", timeWindowButtonRef.current)}
                  >
                    <span>{getTimeWindowLabel(taskDraft.timeWindow)}</span>
                    <span>⌄</span>
                  </button>
                </label>
              </div>

              <article className="field-card">
                <span className="field-label">截止规则</span>
                <div className="deadline-note rounded-2xl border border-base-300 bg-base-100 p-4">
                  <p className="text-sm font-semibold text-base-content">由系统自动换算截止时间</p>
                  <p className="text-xs text-base-content/60">
                    当前按“{getTimeWindowLabel(taskDraft.timeWindow)}”发送，不再传具体时间。
                  </p>
                </div>
              </article>

              <label className="field-card">
                <span className="field-label">附件</span>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  multiple
                  onChange={handleAttachmentChange}
                />
                <div className="file-upload-shell rounded-2xl border border-base-300 bg-base-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-base-content">上传参考资料</p>
                      <p className="text-xs text-base-content/60">支持图片、文档和其他任务附件</p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm rounded-xl"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      选择文件
                    </button>
                  </div>
                  {taskDraft.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {taskDraft.attachments.map((file) => (
                        <span key={`${file.name}-${file.size}`} className="badge badge-outline gap-1 rounded-full px-3 py-3">
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </label>

              <div className="composer-actions">
                <button className="btn btn-ghost rounded-2xl flex-1" type="button" onClick={() => setComposerOpen(false)}>
                  取消
                </button>
                <button className="btn btn-primary rounded-2xl flex-1" type="submit">
                  发布任务
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className={cn("toast", toast.tone === "success" && "is-success", toast.tone === "error" && "is-error")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

type PageHeadingProps = {
  title: string;
  subtitle: string;
  meta?: string;
};

function PageHeading({ title, subtitle, meta }: PageHeadingProps) {
  return (
    <header className="page-heading">
      {meta && <p className="page-meta">{meta}</p>}
      <h1>{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
    </header>
  );
}

type SectionTitleProps = {
  title: string;
};

function SectionTitle({ title }: SectionTitleProps) {
  return <h2 className="section-title">{title}</h2>;
}

type MetricCardProps = {
  label: string;
  value: number;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="metric-card">
      <p className="card-kicker">{label}</p>
      <p className="metric-value">{value}</p>
    </article>
  );
}

type EmptyStateProps = {
  title: string;
  detail: string;
  compact?: boolean;
};

function EmptyState({ title, detail, compact = false }: EmptyStateProps) {
  return (
    <article className={cn("empty-state", compact && "is-compact")}>
      <p className="empty-title">{title}</p>
      <p className="empty-detail">{detail}</p>
    </article>
  );
}

function SkeletonCard() {
  return (
    <article className="skeleton-card" aria-hidden="true">
      <div className="skeleton-line short" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line long" />
    </article>
  );
}

type EmployeeCardProps = {
  employee: EmployeeRecord;
  onOpen: (employee: EmployeeRecord) => void;
  compact?: boolean;
};

function EmployeeCard({ employee, onOpen, compact = false }: EmployeeCardProps) {
  return (
    <button className="employee-card" type="button" onClick={() => onOpen(employee)}>
      <div className="employee-card-header">
        <div>
          <p className="employee-name">
            {employee.name} · {employee.role}
          </p>
          <p className="employee-meta">
            {employee.projectName} · {formatRuntimeLabel(employee)} / {formatWorkLabel(employee)}
          </p>
        </div>
        <span className={cn("runtime-tag", employee.runtimeStatus === "running" && "is-running")}>
          {formatRuntimeLabel(employee)}
        </span>
      </div>
      <p className="employee-task">{employee.currentTask}</p>
      {!compact && (
        <p className="employee-footnote">
          最近交付：{employee.recentArtifact ?? employee.recentCompleted ?? "无"}
        </p>
      )}
    </button>
  );
}

type StatusPillProps = {
  label: string;
  tone: EmployeeRecord["runtimeStatus"] | EmployeeRecord["workStatus"];
};

function StatusPill({ label, tone }: StatusPillProps) {
  return <span className={cn("status-pill", `tone-${tone}`)}>{label}</span>;
}

export default App;
