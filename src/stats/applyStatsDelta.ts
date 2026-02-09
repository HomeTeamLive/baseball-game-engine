// src/stats/applyStatsDelta.ts
import type { StatsDelta, StatsState, StatPath } from "../types/stats";

function getAtPath(obj: any, pathParts: string[]): any {
  let cur = obj;
  for (const p of pathParts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setAtPath(obj: any, pathParts: string[], value: any): void {
  let cur = obj;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (cur[key] == null) cur[key] = {};
    cur = cur[key];
  }
  cur[pathParts[pathParts.length - 1]] = value;
}

function parsePath(path: StatPath): string[] {
  return path.split(".").filter(Boolean);
}

export function applyStatsDelta(prev: StatsState, delta: StatsDelta): StatsState {
  const next: StatsState = structuredClone(prev);

  for (const [path, d] of Object.entries(delta.inc ?? {})) {
    const parts = parsePath(path);
    const curVal = getAtPath(next as any, parts);
    const base = typeof curVal === "number" ? curVal : 0;
    setAtPath(next as any, parts, base + d);
  }

  if (delta.set) {
    for (const [path, v] of Object.entries(delta.set)) {
      const parts = parsePath(path);
      setAtPath(next as any, parts, v);
    }
  }

  return next;
}
