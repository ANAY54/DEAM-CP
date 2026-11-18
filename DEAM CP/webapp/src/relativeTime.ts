import type { Timestamp } from "firebase/firestore";

export function relativeTime(ts: Timestamp | null, now: number): string {
  if (!ts) return "—";

  const diffMs = now - ts.toMillis();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return ts.toDate().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
