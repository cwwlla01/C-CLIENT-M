import type { InspectorSettings } from "../types";

type InspectorSettingsSheetProps = {
  error: string;
  filePath: string;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
  onSettingsChange: (next: InspectorSettings) => void;
  onTest: () => void;
  projectRoot: string;
  saving: boolean;
  settings: InspectorSettings;
  testError: string;
  testLatencyMs: number | null;
  testMessage: string;
  testModels: string[];
  testedUrl: string;
  testing: boolean;
};

function stringifyList(value: string[]) {
  return value.join(", ");
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function InspectorSettingsSheet({
  error,
  filePath,
  loading,
  onClose,
  onSave,
  onSettingsChange,
  onTest,
  projectRoot,
  saving,
  settings,
  testError,
  testLatencyMs,
  testMessage,
  testModels,
  testedUrl,
  testing,
}: InspectorSettingsSheetProps) {
  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="观察者配置"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-header">
          <div>
            <p className="sheet-title">观察者配置</p>
            <p className="sheet-subtitle">
              {projectRoot || "未发现项目根目录"} · Inspector / 自动驾驶 / AI 兜底
            </p>
          </div>
          <button className="close-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="sheet-scroll">
          {loading ? (
            <>
              <article className="surface-card">
                <p className="card-kicker">观察者配置</p>
                <p className="card-copy subtle-copy">正在加载配置...</p>
              </article>
              <SkeletonRows />
            </>
          ) : (
            <>
              <article className="surface-card">
                <p className="card-kicker">配置文件</p>
                <p className="card-copy">{filePath || "未发现 inspector.json"}</p>
              </article>

              <article className="surface-card">
                <p className="card-kicker">观察者模式</p>
                <div className="settings-grid">
                  <label className="field-card">
                    <span className="field-label">检查模式</span>
                    <select
                      className="select select-bordered w-full rounded-2xl bg-base-100"
                      value={settings.inspectionMode}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          inspectionMode: event.target.value as InspectorSettings["inspectionMode"],
                        })
                      }
                    >
                      <option value="rules_only">仅规则</option>
                      <option value="hybrid">规则 + AI</option>
                      <option value="ai_only">仅 AI</option>
                    </select>
                  </label>
                  <label className="field-card">
                    <span className="field-label">自动驾驶</span>
                    <select
                      className="select select-bordered w-full rounded-2xl bg-base-100"
                      value={settings.autopilotMode}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          autopilotMode: event.target.value as InspectorSettings["autopilotMode"],
                        })
                      }
                    >
                      <option value="off">关闭</option>
                      <option value="suggest_only">仅建议</option>
                      <option value="safe_auto">安全自动</option>
                      <option value="full_auto">全自动</option>
                    </select>
                  </label>
                </div>

                <div className="settings-toggle-list">
                  <label className="settings-toggle-row">
                    <div>
                      <span className="settings-toggle-title">启用观察者</span>
                      <p className="settings-toggle-copy">后台异步检查员工 CLI 状态并输出建议。</p>
                    </div>
                    <input
                      checked={settings.enabled}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          enabled: event.target.checked,
                        })
                      }
                    />
                  </label>

                  <label className="settings-toggle-row">
                    <div>
                      <span className="settings-toggle-title">启用自动回复</span>
                      <p className="settings-toggle-copy">对白名单问题自动回填选择或确认。</p>
                    </div>
                    <input
                      checked={settings.autoReplyEnabled}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          autoReplyEnabled: event.target.checked,
                        })
                      }
                    />
                  </label>

                  <label className="settings-toggle-row">
                    <div>
                      <span className="settings-toggle-title">高风险始终人工确认</span>
                      <p className="settings-toggle-copy">删除、覆盖、发布等操作不允许自动驾驶直接回复。</p>
                    </div>
                    <input
                      checked={settings.highRiskAlwaysManual}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          highRiskAlwaysManual: event.target.checked,
                        })
                      }
                    />
                  </label>
                </div>
              </article>

              <article className="surface-card">
                <p className="card-kicker">规则阈值</p>
                <div className="settings-grid">
                  <label className="field-card">
                    <span className="field-label">静默秒数</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      min={5}
                      type="number"
                      value={settings.thresholds.silenceSeconds}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          thresholds: {
                            ...settings.thresholds,
                            silenceSeconds: Number(event.target.value || 0),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">完成阈值</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      min={1}
                      type="number"
                      value={settings.thresholds.completionScore}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          thresholds: {
                            ...settings.thresholds,
                            completionScore: Number(event.target.value || 0),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">阻塞阈值</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      min={1}
                      type="number"
                      value={settings.thresholds.blockedScore}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          thresholds: {
                            ...settings.thresholds,
                            blockedScore: Number(event.target.value || 0),
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">自动回复阈值</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      min={1}
                      type="number"
                      value={settings.thresholds.autoReplyScore}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          thresholds: {
                            ...settings.thresholds,
                            autoReplyScore: Number(event.target.value || 0),
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </article>

              <article className="surface-card">
                <p className="card-kicker">偏好与回复类型</p>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-row">
                    <span className="settings-toggle-title">偏保守决策</span>
                    <input
                      checked={settings.preferences.preferConservative}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          preferences: {
                            ...settings.preferences,
                            preferConservative: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="settings-toggle-row">
                    <span className="settings-toggle-title">偏继续执行</span>
                    <input
                      checked={settings.preferences.preferContinue}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          preferences: {
                            ...settings.preferences,
                            preferContinue: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="settings-toggle-row">
                    <span className="settings-toggle-title">偏非破坏性操作</span>
                    <input
                      checked={settings.preferences.preferNonDestructive}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          preferences: {
                            ...settings.preferences,
                            preferNonDestructive: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="settings-toggle-row">
                    <span className="settings-toggle-title">A/B 默认偏向 A</span>
                    <input
                      checked={settings.preferences.preferOptionA}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          preferences: {
                            ...settings.preferences,
                            preferOptionA: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <div className="field-card">
                  <span className="field-label">允许自动回复类型</span>
                  <textarea
                    className="textarea textarea-bordered w-full rounded-2xl bg-base-100"
                    rows={3}
                    value={stringifyList(settings.allowedReplyTypes)}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        allowedReplyTypes: parseList(event.target.value),
                      })
                    }
                  />
                </div>

                <div className="field-card">
                  <span className="field-label">阻止自动回复类型</span>
                  <textarea
                    className="textarea textarea-bordered w-full rounded-2xl bg-base-100"
                    rows={3}
                    value={stringifyList(settings.blockedReplyTypes)}
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        blockedReplyTypes: parseList(event.target.value),
                      })
                    }
                  />
                </div>
              </article>

              <article className="surface-card">
                <p className="card-kicker">AI 兜底</p>
                <div className="settings-toggle-list">
                  <label className="settings-toggle-row">
                    <div>
                      <span className="settings-toggle-title">启用独立 Inspector API</span>
                      <p className="settings-toggle-copy">仅在混合或纯 AI 模式下调用，建议配置便宜模型。</p>
                    </div>
                    <input
                      checked={settings.ai.enabled}
                      className="toggle toggle-primary"
                      type="checkbox"
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            enabled: event.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <div className="settings-grid">
                  <label className="field-card">
                    <span className="field-label">Base URL</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      placeholder="https://xxx/v1"
                      value={settings.ai.baseUrl}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            baseUrl: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">API Key</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      type="password"
                      placeholder="sk-..."
                      value={settings.ai.apiKey}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            apiKey: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">模型</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      value={settings.ai.model}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            model: event.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-label">推理强度</span>
                    <select
                      className="select select-bordered w-full rounded-2xl bg-base-100"
                      value={settings.ai.reasoningEffort}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            reasoningEffort: event.target.value as InspectorSettings["ai"]["reasoningEffort"],
                          },
                        })
                      }
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                  <label className="field-card">
                    <span className="field-label">Max Tokens</span>
                    <input
                      className="input input-bordered w-full rounded-2xl bg-base-100"
                      min={1}
                      type="number"
                      value={settings.ai.maxTokens}
                      onChange={(event) =>
                        onSettingsChange({
                          ...settings,
                          ai: {
                            ...settings.ai,
                            maxTokens: Number(event.target.value || 0),
                          },
                        })
                      }
                    />
                  </label>
                </div>

                <div className="action-row">
                  <button
                    className="action-button secondary"
                    type="button"
                    disabled={testing}
                    onClick={onTest}
                  >
                    {testing ? "测试中..." : "测试 AI 连通性"}
                  </button>
                </div>

                {testMessage ? (
                  <div className="info-block">
                    <p className="card-kicker">测试结果</p>
                    <p className="card-copy">
                      {testMessage}
                      {testLatencyMs !== null ? ` · ${testLatencyMs}ms` : ""}
                    </p>
                    {testModels.length > 0 ? (
                      <div className="pill-row">
                        {testModels.map((model) => (
                          <span key={model} className="status-pill tone-running">
                            {model}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {testedUrl ? <p className="settings-inline-note">{testedUrl}</p> : null}
                  </div>
                ) : null}

                {testError ? (
                  <div className="info-block">
                    <p className="card-kicker">测试失败</p>
                    <p className="card-copy">{testError}</p>
                  </div>
                ) : null}
              </article>

              {error ? (
                <article className="alert-card">
                  <p className="card-kicker">错误</p>
                  <p className="card-copy">{error}</p>
                </article>
              ) : null}
            </>
          )}
        </div>

        <div className="sheet-actions">
          <button className="runtime-button neutral" type="button" onClick={onClose}>
            关闭
          </button>
          <button
            className="runtime-button success"
            type="button"
            disabled={loading || saving}
            onClick={onSave}
          >
            {saving ? "保存中..." : "保存配置"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SkeletonRows() {
  return (
    <>
      <article className="skeleton-card" aria-hidden="true">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line long" />
      </article>
      <article className="skeleton-card" aria-hidden="true">
        <div className="skeleton-line short" />
        <div className="skeleton-line medium" />
        <div className="skeleton-line long" />
      </article>
    </>
  );
}
