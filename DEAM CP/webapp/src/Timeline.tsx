import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { relativeTime } from "./relativeTime";
import type { Visitor } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAYBACK_INTERVAL_MS = 400;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

export default function Timeline() {
  const [frames, setFrames] = useState<Visitor[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const cutoff = Timestamp.fromMillis(Date.now() - DAY_MS);
    const q = query(
      collection(db, "visitors"),
      where("trigger", "==", "timelapse"),
      where("timestamp", ">=", cutoff),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoadError("");
        const next: Visitor[] = snapshot.docs.map((d) => ({
          id: d.id,
          deviceId: d.data().deviceId,
          imageUrl: d.data().imageUrl,
          timestamp: d.data().timestamp ?? null,
          trigger: "timelapse",
        }));
        setFrames(next);
        setIndex((i) => Math.min(i, Math.max(next.length - 1, 0)));
      },
      (err) => setLoadError(err.message)
    );

    return unsubscribe;
  }, []);

  // Anything older than 24h gets deleted so the collection doesn't grow
  // forever. No Cloud Functions on the free plan, so the dashboard does it
  // itself whenever it's open.
  useEffect(() => {
    async function prune() {
      const cutoff = Timestamp.fromMillis(Date.now() - DAY_MS);
      const q = query(
        collection(db, "visitors"),
        where("trigger", "==", "timelapse"),
        where("timestamp", "<", cutoff)
      );
      const snapshot = await getDocs(q);
      await Promise.all(
        snapshot.docs.map((d) => deleteDoc(doc(db, "visitors", d.id)))
      );
    }

    prune().catch(() => {
      /* best-effort cleanup; next open will retry */
    });
    const interval = setInterval(() => {
      prune().catch(() => {});
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, PLAYBACK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [playing, frames.length]);

  const current = frames[index] ?? null;

  const rangeLabel = useMemo(() => {
    if (frames.length === 0) return null;
    const first = frames[0].timestamp;
    const last = frames[frames.length - 1].timestamp;
    if (!first || !last) return null;
    return `${relativeTime(first, now)} → ${relativeTime(last, now)}`;
  }, [frames, now]);

  return (
    <section className="timeline">
      <h2>Last 24 hours</h2>

      {loadError && (
        <div className="error banner">
          Could not load timeline: {loadError}
        </div>
      )}

      {frames.length === 0 ? (
        !loadError && (
          <p className="empty-state">
            No timelapse frames yet — the device captures one every few
            minutes.
          </p>
        )
      ) : (
        <>
          <div className="timeline-media">
            {current && <img src={current.imageUrl} alt="Timeline frame" />}
          </div>

          <div className="timeline-controls">
            <button
              className="secondary timeline-play"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            <input
              type="range"
              min={0}
              max={Math.max(frames.length - 1, 0)}
              value={index}
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              className="timeline-scrubber"
            />

            <span className="timeline-frame-count">
              {index + 1} / {frames.length}
            </span>
          </div>

          <div className="timeline-meta">
            <span>{current ? relativeTime(current.timestamp, now) : ""}</span>
            {rangeLabel && <span className="timeline-range">{rangeLabel}</span>}
          </div>
        </>
      )}
    </section>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M7 5v14l12-7Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M7 5h4v14H7Zm6 0h4v14h-4Z" />
    </svg>
  );
}
