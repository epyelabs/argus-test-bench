/**
 * Thin subprocess wrappers around execa.
 *
 * The whole HAL shells out to system tools (rpicam, pinctrl, arecord,
 * i2cdetect, lsusb). These helpers make that uniform: nothing throws on a
 * non-zero exit (the caller inspects `failed`), long-running processes get a
 * clean stop handle, and tool presence is cached so screens can render a
 * "not installed" state without re-probing every render.
 */
import { execa, type ResultPromise } from "execa";

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  failed: boolean;
  /** Set when the binary itself is missing (ENOENT) rather than exiting non-zero. */
  notFound: boolean;
}

/** Run a command to completion. Never rejects — inspect the result instead. */
export async function run(
  cmd: string,
  args: string[] = [],
  opts: { timeoutMs?: number; input?: string } = {},
): Promise<RunResult> {
  try {
    const res = await execa(cmd, args, {
      reject: false,
      timeout: opts.timeoutMs,
      input: opts.input,
      stripFinalNewline: false,
    });
    return {
      stdout: typeof res.stdout === "string" ? res.stdout : "",
      stderr: typeof res.stderr === "string" ? res.stderr : "",
      exitCode: res.exitCode ?? null,
      failed: res.failed || (res.exitCode ?? 0) !== 0,
      notFound: false,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      stdout: "",
      stderr: (err as Error).message ?? String(err),
      exitCode: null,
      failed: true,
      notFound: code === "ENOENT",
    };
  }
}

export interface StreamHandle {
  /** Resolves when the process exits (for any reason). */
  done: Promise<RunResult>;
  /** Send SIGINT (default) so tools like rpicam-vid/arecord flush and finalize. */
  stop: (signal?: NodeJS.Signals) => void;
}

/**
 * Launch a long-running process, forwarding output through callbacks.
 * `onStdoutChunk` receives raw Buffers (used by the mic visualizer for PCM).
 */
export function runStream(
  cmd: string,
  args: string[],
  handlers: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    onStdoutChunk?: (chunk: Buffer) => void;
  } = {},
): StreamHandle {
  let child: ResultPromise;
  try {
    child = execa(cmd, args, { reject: false, buffer: false });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      stop: () => {},
      done: Promise.resolve({
        stdout: "",
        stderr: (err as Error).message,
        exitCode: null,
        failed: true,
        notFound: code === "ENOENT",
      }),
    };
  }

  if (handlers.onStdoutChunk) {
    child.stdout?.on("data", (c: Buffer) => handlers.onStdoutChunk!(c));
  } else if (handlers.onStdout) {
    let buf = "";
    child.stdout?.on("data", (c: Buffer) => {
      buf += c.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) handlers.onStdout!(l);
    });
  }
  if (handlers.onStderr) {
    let buf = "";
    child.stderr?.on("data", (c: Buffer) => {
      buf += c.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) handlers.onStderr!(l);
    });
  }

  const done: Promise<RunResult> = child.then(
    (res) => ({
      stdout: "",
      stderr: typeof res.stderr === "string" ? res.stderr : "",
      exitCode: res.exitCode ?? null,
      failed: res.failed || (res.exitCode ?? 0) !== 0,
      notFound: false,
    }),
    (err) => ({
      stdout: "",
      stderr: (err as Error).message ?? String(err),
      exitCode: null,
      failed: true,
      notFound: (err as NodeJS.ErrnoException).code === "ENOENT",
    }),
  );

  return {
    done,
    stop: (signal: NodeJS.Signals = "SIGINT") => {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    },
  };
}

const existsCache = new Map<string, boolean>();

/** Cached `which` check that drives "tool not installed" UI states. */
export async function commandExists(cmd: string): Promise<boolean> {
  const cached = existsCache.get(cmd);
  if (cached !== undefined) return cached;
  const res = await run("which", [cmd]);
  const found = !res.failed && res.stdout.trim().length > 0;
  existsCache.set(cmd, found);
  return found;
}
