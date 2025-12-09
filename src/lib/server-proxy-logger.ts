import fs from "node:fs";
import path from "node:path";

type ProxyScope = "backend" | "api";
type ProxyPhase = "request" | "response" | "error";

export type ProxyLogEvent = {
  scope: ProxyScope;
  phase: ProxyPhase;
  method: string;
  url: string;
  status?: number;
  duration_ms?: number;
  message?: string;
  error_code?: string;
  data?: Record<string, unknown>;
};

const dirEnv = process.env.TROUBLESHOOT_FE_LOG_DIR || ".log";
const fileEnv = process.env.TROUBLESHOOT_FE_LOG_FILE || "frontend-troubleshoot.jsonl";
const maxBytes =
  Number(process.env.TROUBLESHOOT_FE_LOG_MAX_BYTES || 10_485_760) || 10_485_760;
const backups = Math.max(0, Number(process.env.TROUBLESHOOT_FE_LOG_BACKUPS || 1));

const logDir = path.isAbsolute(dirEnv) ? dirEnv : path.join(process.cwd(), dirEnv);
const logFile = path.join(logDir, fileEnv);

let dirReady = false;

function ensureDir() {
  if (dirReady) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    dirReady = true;
  } catch {
    /* ignore mkdir errors */
  }
}

function rotateIfNeeded() {
  if (!maxBytes || maxBytes <= 0) return;
  try {
    const stats = fs.statSync(logFile);
    if (stats.size < maxBytes) return;
  } catch {
    return;
  }
  try {
    if (backups > 0) {
      for (let i = backups - 1; i >= 1; i -= 1) {
        const src = `${logFile}.${i}`;
        const dest = `${logFile}.${i + 1}`;
        if (fs.existsSync(src)) {
          if (i + 1 > backups) {
            fs.rmSync(src, { force: true });
          } else {
            fs.renameSync(src, dest);
          }
        }
      }
      const first = `${logFile}.1`;
      if (fs.existsSync(first) && backups === 1) {
        fs.rmSync(first, { force: true });
      }
      if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, first);
      }
    } else {
      fs.truncateSync(logFile, 0);
    }
  } catch {
    /* ignore rotation errors */
  }
}

export function logProxyActivity(event: ProxyLogEvent) {
  if (typeof process === "undefined") return;
  try {
    ensureDir();
    rotateIfNeeded();
    const entry = {
      timestamp: new Date().toISOString(),
      source: "proxy",
      ...event,
    };
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", { encoding: "utf8" });
  } catch {
    /* ignore logging failures */
  }
}
