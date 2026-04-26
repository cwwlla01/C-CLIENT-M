import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { buildTerminalSocketUrl } from "../lib/bridge";
import type { EmployeeRecord } from "../types";
import "xterm/css/xterm.css";
import "./live-session-sheet.css";

type LiveSessionSheetProps = {
  member: EmployeeRecord;
  onClose: () => void;
};

type BridgeConnectionState = "connecting" | "connected" | "disconnected" | "error";

const connectionToneMap: Record<BridgeConnectionState, string> = {
  connecting: "tone-connecting",
  connected: "tone-connected",
  disconnected: "tone-disconnected",
  error: "tone-error",
};

function classifyNoise(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  if (/MCP client .* failed to start/i.test(normalized)) {
    return "MCP 客户端启动失败";
  }
  if (/MCP startup incomplete/i.test(normalized)) {
    return "MCP 启动未完成";
  }
  if (/not logged in\. Run `codex mcp login/i.test(normalized)) {
    return "MCP 未登录提示";
  }
  if (/plugin is not installed/i.test(normalized)) {
    return "插件未安装提示";
  }
  if (/startup remote plugin sync failed/i.test(normalized)) {
    return "远程插件同步失败";
  }
  if (/failed to warm featured plugin ids cache/i.test(normalized)) {
    return "插件缓存预热失败";
  }
  if (/chatgpt authentication required to sync remote plugins/i.test(normalized)) {
    return "远程插件鉴权失败";
  }

  return "";
}

export default function LiveSessionSheet({ member, onClose }: LiveSessionSheetProps) {
  const [connectionState, setConnectionState] = useState<BridgeConnectionState>("connecting");
  const [connectionLabel, setConnectionLabel] = useState("正在附着员工 CLI...");
  const [hasUnreadOutput, setHasUnreadOutput] = useState(false);
  const [suppressedNoiseCount, setSuppressedNoiseCount] = useState(0);
  const [lastSuppressedNoise, setLastSuppressedNoise] = useState("");
  const [composerValue, setComposerValue] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<import("xterm").Terminal | null>(null);
  const fitAddonRef = useRef<import("xterm-addon-fit").FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const autoFollowRef = useRef(true);
  const hasVisibleOutputRef = useRef(false);
  const memberName = member.name;
  const memberId = member.memberId;
  const memberShell = member.shell;
  const memberWorkspacePath = member.workspacePath;

  const terminalUrl = useMemo(
    () =>
      buildTerminalSocketUrl({
        memberId,
        shell: memberShell,
        workspacePath: memberWorkspacePath,
      }),
    [memberId, memberShell, memberWorkspacePath],
  );
  function sendSocketInput(data: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(
      JSON.stringify({
        type: "input",
        data,
      }),
    );
    return true;
  }

  function normalizeDisplayChunk(text: string) {
    let next = String(text || "");
    if (!next) {
      return "";
    }

    if (!hasVisibleOutputRef.current) {
      next = next.replace(/^(?:\r?\n|\r)+/, "");
    }

    next = next.replace(/(\r?\n|\r){3,}/g, "\r\n\r\n");

    if (next.trim()) {
      hasVisibleOutputRef.current = true;
    }

    return next;
  }

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    let terminal: import("xterm").Terminal | null = null;
    let fitAddon: import("xterm-addon-fit").FitAddon | null = null;
    let socket: WebSocket | null = null;
    let handleTerminalInput: { dispose(): void } | null = null;
    let handleTerminalScroll: { dispose(): void } | null = null;

    setConnectionState("connecting");
    setConnectionLabel("正在附着员工 CLI...");
    setHasUnreadOutput(false);
    setSuppressedNoiseCount(0);
    setLastSuppressedNoise("");
    hasVisibleOutputRef.current = false;

    const mountTerminal = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
      ]);

      if (cancelled || !containerRef.current) {
        return;
      }

      terminal = new Terminal({
        allowTransparency: true,
        convertEol: true,
        cursorBlink: false,
        cursorStyle: "bar",
        cursorWidth: 1,
        disableStdin: false,
        fontFamily: '"Cascadia Code", "JetBrains Mono", "Consolas", monospace',
        fontSize: 13,
        lineHeight: 1.45,
        scrollback: 4000,
        theme: {
          background: "#070C18",
          black: "#0F172A",
          blue: "#60A5FA",
          brightBlack: "#475569",
          brightBlue: "#93C5FD",
          brightCyan: "#67E8F9",
          brightGreen: "#86EFAC",
          brightMagenta: "#C4B5FD",
          brightRed: "#FCA5A5",
          brightWhite: "#F8FAFC",
          brightYellow: "#FCD34D",
          cursor: "#F8FAFC",
          cyan: "#22D3EE",
          foreground: "#E2E8F0",
          green: "#4ADE80",
          magenta: "#A78BFA",
          red: "#F87171",
          selectionBackground: "rgba(148, 163, 184, 0.24)",
          white: "#F8FAFC",
          yellow: "#FBBF24",
        },
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();
      terminal.focus();
      terminal.writeln(`Connecting to ${memberName}...`);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      socket = new WebSocket(terminalUrl);
      socketRef.current = socket;

      const sendResize = () => {
        if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      };

      const writeChunk = (text: string, writeLine = false) => {
        if (!terminal) {
          return;
        }

        const noiseLabel = classifyNoise(text);
        if (noiseLabel) {
          setSuppressedNoiseCount((current) => current + 1);
          setLastSuppressedNoise(noiseLabel);
          return;
        }

        const normalized = normalizeDisplayChunk(text);
        if (!normalized) {
          return;
        }

        const previousViewportY = terminal.buffer.active.viewportY;
        if (writeLine) {
          terminal.writeln(normalized.replace(/\r?\n$/, ""));
        } else {
          terminal.write(normalized);
        }

        if (!autoFollowRef.current) {
          requestAnimationFrame(() => {
            terminal?.scrollToLine(previousViewportY);
          });
          setHasUnreadOutput(true);
        }
      };

      handleTerminalInput = terminal.onData((data) => {
        sendSocketInput(data);
      });

      handleTerminalScroll = terminal.onScroll((viewportY) => {
        if (!terminal) {
          return;
        }

        const atBottom = viewportY >= terminal.buffer.active.baseY;
        if (atBottom) {
          setHasUnreadOutput(false);
        }
      });

      socket.onopen = () => {
        fitAddon?.fit();
        sendResize();
        terminal?.focus();
      };

      socket.onmessage = (event) => {
        const rawText =
          typeof event.data === "string"
            ? event.data
            : event.data instanceof ArrayBuffer
              ? new TextDecoder().decode(event.data)
              : "";

        if (!rawText) {
          return;
        }

        const payload = JSON.parse(rawText) as {
          type?: string;
          data?: string;
          reused?: boolean;
          sessionId?: string;
          shell?: string;
          exitCode?: number | null;
          message?: string;
        };

        if (payload.type === "ready") {
          setConnectionState("connected");
          setConnectionLabel(payload.reused ? "已附着现有会话" : "已创建新的 CLI 会话");
          terminal?.writeln(
            `\r\n[bridge] session ${payload.sessionId || "-"} ready (${payload.shell || "-"})\r\n`,
          );
          return;
        }

        if (payload.type === "output") {
          writeChunk(payload.data || "");
          return;
        }

        if (payload.type === "meta") {
          writeChunk(payload.data || "", true);
          return;
        }

        if (payload.type === "exit") {
          setConnectionState("disconnected");
          setConnectionLabel("会话已退出");
          terminal?.writeln(
            `\r\n[bridge] session exited with code ${payload.exitCode ?? "unknown"}\r\n`,
          );
          return;
        }

        if (payload.type === "error") {
          setConnectionState("error");
          setConnectionLabel(payload.message || "bridge 返回错误");
          terminal?.writeln(`\r\n[bridge error] ${payload.message || "unknown error"}\r\n`);
        }
      };

      socket.onerror = () => {
        setConnectionState("error");
        setConnectionLabel("无法连接员工 CLI bridge");
        terminal?.writeln(
          "\r\n[bridge error] 无法连接到员工 CLI，会话可能未启动或 WebSocket 代理未配置。\r\n",
        );
      };

      socket.onclose = () => {
        setConnectionState((current) => (current === "error" ? "error" : "disconnected"));
        setConnectionLabel((current) =>
          current === "无法连接员工 CLI bridge" ? current : "连接已关闭",
        );
      };

      const handleResize = () => {
        fitAddon?.fit();
        sendResize();
      };

      const handleFocusTerminal = () => {
        terminal?.focus();
      };

      window.addEventListener("resize", handleResize);
      containerRef.current.addEventListener("click", handleFocusTerminal);

      return () => {
        window.removeEventListener("resize", handleResize);
        containerRef.current?.removeEventListener("click", handleFocusTerminal);
      };
    };

    let removeEventBindings: (() => void) | undefined;

    void mountTerminal().then((unbind) => {
      removeEventBindings = unbind;
    });

    return () => {
      cancelled = true;
      removeEventBindings?.();
      handleTerminalInput?.dispose();
      handleTerminalScroll?.dispose();
      socket?.close();
      terminal?.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
      socketRef.current = null;
    };
  }, [memberName, terminalUrl]);

  function sendComposerValue(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!composerValue.trim()) {
      return;
    }

    if (sendSocketInput(`${composerValue}\r`)) {
      setComposerValue("");
      return;
    }

    setConnectionState("error");
    setConnectionLabel("当前连接不可写入");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendComposerValue();
    }
  }

  return (
    <div className="overlay live-session-overlay" role="presentation" onClick={onClose}>
      <section
        className="sheet live-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${memberName} 实时 CLI`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="live-session-shell">
          <div className="live-session-toolbar">
            <div className="live-session-title-block">
              <p className="live-session-title">{memberName} · 实时会话</p>
            </div>
            <div className="live-session-toolbar-actions">
              <span className={`live-session-connection ${connectionToneMap[connectionState]}`}>
                {connectionLabel}
              </span>
              <button className="close-button" type="button" onClick={onClose}>
                关闭
              </button>
            </div>
          </div>

          <div className="live-session-terminal-shell">
            <div ref={containerRef} className="live-session-terminal" />
          </div>

          <div className="live-session-notes">
            {hasUnreadOutput ? <span className="live-session-note is-alert">有新输出</span> : null}
            {suppressedNoiseCount > 0 ? (
              <span className="live-session-note is-alert">已折叠噪音 {suppressedNoiseCount}</span>
            ) : null}
            {lastSuppressedNoise ? (
              <span className="live-session-note is-alert">最近折叠：{lastSuppressedNoise}</span>
            ) : null}
          </div>

          <form className="live-session-composer" onSubmit={sendComposerValue}>
            <div className="live-session-input-shell">
              <input
                className="live-session-input"
                placeholder="输入要发送给员工 CLI 的内容"
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
              <button
                className="runtime-button success live-session-send"
                type="submit"
                disabled={connectionState !== "connected"}
              >
                发送
              </button>
            </div>

            <div className="live-session-shortcuts">
              <button
                className="live-session-shortcut"
                type="button"
                disabled={connectionState !== "connected"}
                onClick={() => {
                  if (!sendSocketInput("\r")) {
                    setConnectionState("error");
                    setConnectionLabel("当前连接不可写入");
                  }
                }}
              >
                发送回车
              </button>
              <button
                className="live-session-shortcut is-danger"
                type="button"
                disabled={connectionState !== "connected"}
                onClick={() => {
                  if (!sendSocketInput("\u0003")) {
                    setConnectionState("error");
                    setConnectionLabel("当前连接不可写入");
                  }
                }}
              >
                Ctrl+C
              </button>
              <button
                className="live-session-shortcut"
                type="button"
                onClick={() => {
                  const terminal = terminalRef.current;
                  if (!terminal) {
                    return;
                  }

                  terminal.scrollToBottom();
                  setHasUnreadOutput(false);
                  terminal.focus();
                }}
              >
                回到底部
              </button>
              <button
                className="live-session-shortcut"
                type="button"
                onClick={() => {
                  terminalRef.current?.clear();
                  hasVisibleOutputRef.current = false;
                  setHasUnreadOutput(false);
                }}
              >
                清屏
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
