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
  BRIDGE_HTTP_ORIGIN,
  assignTask,
  controlRuntime,
  loadEmployeeExtras,
  loadMobileSnapshot,
  respondToReview,
  switchEmployeeProject,
} from "./lib/bridge";
import type {
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
    timeWindow: "today",
    source: "移动监督端",
    deadlineAt: "",
    attachments: [],
  };
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
    createConnectionState("connecting", `尝试连接 ${BRIDGE_HTTP_ORIGIN}`),
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
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(() => createInitialTaskDraft());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const companyMenuRef = useRef<HTMLDivElement | null>(null);

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
      setConnection(createConnectionState("live", `已连接 ${BRIDGE_HTTP_ORIGIN}`));
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
    const controller = new AbortController();
    void refreshSnapshot(controller.signal);
    return () => controller.abort();
  }, []);

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
  }, [connection.mode, selectedEmployee?.id]);

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
    setComposerOpen(true);
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
      let dispatchDetail = `${taskDraft.projectName} · ${taskDraft.timeWindow}`;

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
        status: taskDraft.timeWindow === "immediate" ? "立即执行" : "等待处理",
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

  return (
    <div className={cn("app-shell", theme === "dark" && "theme-dark")}>
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
                className="company-dropdown-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={companyMenuOpen}
                onClick={() => setCompanyMenuOpen((current) => !current)}
              >
                <span>{selectedCompany === "all" ? "全部公司" : selectedCompany}</span>
                <span className={cn("company-dropdown-chevron", companyMenuOpen && "is-open")}>⌄</span>
              </button>
              {companyMenuOpen && (
                <div className="company-dropdown-menu" role="menu" aria-label="公司筛选">
                  {companyOptions.map((company) => (
                    <button
                      key={company}
                      className={cn(
                        "company-dropdown-item",
                        selectedCompany === company && "is-active",
                      )}
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
              <button className="close-button" type="button" onClick={() => setComposerOpen(false)}>
                关闭
              </button>
            </div>

            <form className="composer-form" onSubmit={handleSubmitTask}>
              <label className="field-card">
                <span className="field-label">员工</span>
                <select
                  className="field-input"
                  value={taskDraft.employeeId}
                  onChange={(event) => handleDraftChange("employeeId", event.target.value)}
                >
                  {snapshot.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} · {employee.role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-card">
                <span className="field-label">项目</span>
                <input
                  className="field-input"
                  value={taskDraft.projectName}
                  onChange={(event) => handleDraftChange("projectName", event.target.value)}
                />
              </label>

              <label className="field-card">
                <span className="field-label">任务描述</span>
                <textarea
                  className="field-input field-textarea"
                  value={taskDraft.description}
                  onChange={(event) => handleDraftChange("description", event.target.value)}
                />
              </label>

              <div className="field-grid">
                <label className="field-card">
                  <span className="field-label">优先级</span>
                  <select
                    className="field-input"
                    value={taskDraft.priority}
                    onChange={(event) => handleDraftChange("priority", event.target.value as TaskDraft["priority"])}
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                  </select>
                </label>

                <label className="field-card">
                  <span className="field-label">时间窗口</span>
                  <select
                    className="field-input"
                    value={taskDraft.timeWindow}
                    onChange={(event) =>
                      handleDraftChange("timeWindow", event.target.value as TaskDraft["timeWindow"])
                    }
                  >
                    <option value="immediate">immediate</option>
                    <option value="today">today</option>
                    <option value="this_week">this_week</option>
                  </select>
                </label>
              </div>

              <label className="field-card">
                <span className="field-label">截止时间</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={taskDraft.deadlineAt}
                  onChange={(event) => handleDraftChange("deadlineAt", event.target.value)}
                />
              </label>

              <label className="field-card">
                <span className="field-label">附件</span>
                <input className="field-input" type="file" multiple onChange={handleAttachmentChange} />
                {taskDraft.attachments.length > 0 && (
                  <p className="attachment-list">
                    {taskDraft.attachments.map((file) => file.name).join(" · ")}
                  </p>
                )}
              </label>

              <div className="composer-actions">
                <button className="runtime-button neutral" type="button" onClick={() => setComposerOpen(false)}>
                  取消
                </button>
                <button className="runtime-button primary" type="submit">
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
