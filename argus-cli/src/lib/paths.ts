/**
 * Resolve files that ship alongside the source but aren't compiled (e.g. the
 * Python helpers). Every module lives at <root>/{src|dist}/<dir>/<file>, so the
 * package root is two directories up from this file — works in dev (tsx/src)
 * and after build (dist) alike.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // <root>/{src|dist}/lib
export const PACKAGE_ROOT = dirname(dirname(here)); // <root>

/** Absolute path to a bundled Python helper, overridable via ARGUS_PYTHON_DIR. */
export function pythonScript(name: string): string {
  return join(process.env.ARGUS_PYTHON_DIR ?? join(PACKAGE_ROOT, "python"), name);
}
