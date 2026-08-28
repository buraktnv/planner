import type { Proposal } from "./schemas";

const TTL_MS = 24 * 60 * 60 * 1000;
const MIN_ATTEMPT_GAP_MS = 30 * 60 * 1000;

interface PendingState {
  proposal: Proposal;
  createdAt: number;
}

let pending: PendingState | null = null;
let lastAttemptAt = 0;
let running = false;

export function setPending(proposal: Proposal): void {
  pending = { proposal, createdAt: Date.now() };
}

export function getPending(): Proposal | null {
  if (!pending) return null;
  if (Date.now() - pending.createdAt > TTL_MS) {
    pending = null;
    return null;
  }
  return pending.proposal;
}

export function clearPending(): void {
  pending = null;
}

export function markAttempt(): void {
  lastAttemptAt = Date.now();
}

export function attemptedRecently(): boolean {
  return Date.now() - lastAttemptAt < MIN_ATTEMPT_GAP_MS;
}

export function beginRun(): boolean {
  if (running) return false;
  running = true;
  return true;
}

export function endRun(): void {
  running = false;
}
