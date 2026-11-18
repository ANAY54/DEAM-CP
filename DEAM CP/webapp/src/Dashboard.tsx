import { useEffect, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import { relativeTime } from "./relativeTime";
import Timeline from "./Timeline";
import {
  notificationsEnabled,
  notificationsSupported,
  playChime,
  requestNotificationPermission,
  showVisitorNotification,
} from "./notify";
import type { DeviceStatus, Visitor, VisitorTrigger } from "./types";

const DEVICE_ID = "smartdoorbell01";
const ONLINE_THRESHOLD_MS = 15_000;

export default function Dashboard() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [alertsOn, setAlertsOn] = useState(() => notificationsEnabled());

  const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "visitors"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setLoadError("");
        // Timelapse frames power the 24h Timeline view, not the visitor
        // feed/hero/notifications - they're not someone at the door.
        const next: Visitor[] = snapshot.docs
          .map((d) => ({
            id: d.id,
            deviceId: d.data().deviceId,
            imageUrl: d.data().imageUrl,
            timestamp: d.data().timestamp ?? null,
            trigger: (d.data().trigger ?? "remote") as VisitorTrigger,
          }))
          .filter((v) => v.trigger !== "timelapse");

        if (knownIds.current === null) {
          // First load: just remember what's already there, don't alert.
          knownIds.current = new Set(next.map((v) => v.id));
        } else {
          const arrivals = next.filter((v) => !knownIds.current!.has(v.id));
          if (arrivals.length > 0) {
            playChime();
            showVisitorNotification(arrivals[0].trigger);
            knownIds.current = new Set(next.map((v) => v.id));
          }
        }

        setVisitors(next);
      },
      (err) => setLoadError(err.message)
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "commands", DEVICE_ID), (snap) => {
      const data = snap.data();
      setDevice({
        lastSeen: data?.lastSeen ?? null,
        triggerCapture: data?.triggerCapture ?? false,
      });
    });
    return unsubscribe;
  }, []);

  const isOnline =
    !!device?.lastSeen && now - device.lastSeen.toMillis() < ONLINE_THRESHOLD_MS;

  const latest = visitors[0] ?? null;
  const history = visitors.slice(1);

  const todayCount = visitors.filter((v) => {
    if (!v.timestamp) return false;
    const d = v.timestamp.toDate();
    const today = new Date(now);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }).length;

  async function handleTriggerCapture() {
    setTriggering(true);
    try {
      await setDoc(
        doc(db, "commands", DEVICE_ID),
        {
          triggerCapture: true,
          requestedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } finally {
      setTimeout(() => setTriggering(false), 1500);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "visitors", id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleEnableAlerts() {
    const granted = await requestNotificationPermission();
    setAlertsOn(granted);
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-dot" />
          <h1>Front Door</h1>
        </div>
        <div className="header-actions">
          <span className={`status-pill ${isOnline ? "online" : "offline"}`}>
            <span className="status-dot" />
            {isOnline ? "Online" : "Offline"}
          </span>
          <button className="secondary" onClick={() => signOut(auth)}>
            Sign out
          </button>
        </div>
      </header>

      <div className="stats-row">
        <div className="stat-chip">
          <span className="stat-value">{todayCount}</span>
          <span className="stat-label">Visits today</span>
        </div>
        {notificationsSupported() && !alertsOn && (
          <button className="secondary alerts-button" onClick={handleEnableAlerts}>
            <BellIcon /> Enable alerts
          </button>
        )}
        {alertsOn && (
          <span className="stat-chip alerts-on">
            <BellIcon /> Alerts on
          </span>
        )}
      </div>

      {loadError && (
        <div className="error banner">
          Could not load visitors: {loadError}
        </div>
      )}

      <section className="hero">
        <div className="hero-media">
          {latest ? (
            <img src={latest.imageUrl} alt="Most recent visitor" />
          ) : (
            <div className="hero-placeholder">No visitors yet</div>
          )}
          <div className="hero-gradient" />
          {latest && (
            <span className="trigger-badge hero-trigger-badge">
              <TriggerIcon trigger={latest.trigger} />
              {triggerLabel(latest.trigger)}
            </span>
          )}
          <div className="hero-info">
            <span className="hero-label">Last visitor</span>
            <span className="hero-time">
              {latest ? relativeTime(latest.timestamp, now) : "—"}
            </span>
          </div>
        </div>

        <button
          className="capture-fab"
          onClick={handleTriggerCapture}
          disabled={triggering || !isOnline}
          title={isOnline ? "Trigger capture" : "Device is offline"}
        >
          <CameraIcon />
          {triggering ? "Capturing…" : "Capture now"}
        </button>
      </section>

      <section className="activity">
        <h2>Recent activity</h2>

        {history.length === 0 && (
          <p className="empty-state">No earlier visitors.</p>
        )}

        <ul className="activity-list">
          {history.map((v) => (
            <li className="activity-item" key={v.id}>
              <img src={v.imageUrl} alt="Visitor" />
              <div className="activity-meta">
                <span className="activity-title">Front Door</span>
                <span className="activity-sub">
                  <TriggerIcon trigger={v.trigger} />
                  <span className="activity-time">
                    {triggerLabel(v.trigger)} · {relativeTime(v.timestamp, now)}
                  </span>
                </span>
              </div>
              <button
                className="icon-button"
                onClick={() => handleDelete(v.id)}
                disabled={deletingId === v.id}
                aria-label="Delete"
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Timeline />
    </div>
  );
}

function triggerLabel(trigger: VisitorTrigger) {
  if (trigger === "button") return "Doorbell pressed";
  if (trigger === "boot") return "Device started";
  return "Remote capture";
}

function TriggerIcon({ trigger }: { trigger: VisitorTrigger }) {
  if (trigger === "button") return <BellIcon />;
  if (trigger === "boot") return <PowerIcon />;
  return <CameraIcon />;
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
      <path
        d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M10 20a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path
        d="M12 4v7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7 6.5a7 7 0 1 0 10 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
