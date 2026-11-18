// Stands in for the ESP32 until the real hardware is wired up tomorrow.
// Talks to the exact same Firebase REST endpoints the firmware uses
// ("arduino code.txt"), so the dashboard can be fully exercised end to end:
// it sends a heartbeat, polls for "Capture now" requests from the
// dashboard, and writes a visitor record (with a placeholder photo) when
// triggered — just like captureAndUploadTask() does on the device.

const API_KEY = "AIzaSyA3sfTXIn9i9ZPci84QDJrCHN0vsB6K12E";
const EMAIL = "lunkadaarav@gmail.com";
const PASSWORD = "c@25138065A1";
const PROJECT_ID = "smartdoorbellsecurity";
const DEVICE_ID = "smartdoorbell01";
const POLL_INTERVAL_MS = 5000;
// The real device snaps a timelapse frame every ~3 minutes; sped up here so
// the Timeline view can actually be tested without waiting that long.
const TIMELAPSE_INTERVAL_MS = 20_000;

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let cachedToken = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

async function ensureIdToken() {
  const stale = !cachedToken || Date.now() - tokenFetchedAt > TOKEN_TTL_MS;
  if (!stale) return cachedToken;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        returnSecureToken: true,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Firebase sign-in failed: HTTP ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.idToken;
  tokenFetchedAt = Date.now();
  console.log("[simulator] Signed in to Firebase");
  return cachedToken;
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d+Z$/, "Z");
}

async function checkRemoteCaptureTrigger(idToken) {
  const res = await fetch(`${BASE}/commands/${DEVICE_ID}?key=${API_KEY}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    console.log(`[simulator] command GET failed: HTTP ${res.status}`);
    return false;
  }

  const doc = await res.json();
  return Boolean(doc.fields?.triggerCapture?.booleanValue);
}

async function sendHeartbeat(idToken, resetTrigger) {
  const mask = resetTrigger
    ? "updateMask.fieldPaths=lastSeen&updateMask.fieldPaths=triggerCapture"
    : "updateMask.fieldPaths=lastSeen";

  const fields = {
    lastSeen: { timestampValue: nowIso() },
  };
  if (resetTrigger) {
    fields.triggerCapture = { booleanValue: false };
  }

  const res = await fetch(
    `${BASE}/commands/${DEVICE_ID}?${mask}&key=${API_KEY}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );

  if (!res.ok) {
    console.log(`[simulator] heartbeat PATCH failed: HTTP ${res.status}`);
  }
}

async function simulateCapture(idToken, trigger) {
  // Stand-in for a real doorbell photo. A fresh random image each time.
  const imageUrl = `https://picsum.photos/seed/${Date.now()}/640/480`;

  console.log(`[simulator] Simulating capture + upload (trigger: ${trigger}):`, imageUrl);

  const res = await fetch(`${BASE}/visitors?key=${API_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        deviceId: { stringValue: DEVICE_ID },
        imageUrl: { stringValue: imageUrl },
        timestamp: { timestampValue: nowIso() },
        trigger: { stringValue: trigger },
      },
    }),
  });

  if (!res.ok) {
    console.log(`[simulator] visitor write failed: HTTP ${res.status} ${await res.text()}`);
    return;
  }

  console.log("[simulator] Visitor record saved.");
}

// Occasionally simulates someone pressing the physical doorbell button,
// so the "button" trigger path can be exercised without real hardware.
const RANDOM_BUTTON_PRESS_CHANCE = 1 / 8;

async function pollOnce() {
  const idToken = await ensureIdToken();
  const shouldCapture = await checkRemoteCaptureTrigger(idToken);
  await sendHeartbeat(idToken, shouldCapture);

  if (shouldCapture) {
    console.log("[simulator] Capture requested from dashboard!");
    await simulateCapture(idToken, "remote");
  } else if (Math.random() < RANDOM_BUTTON_PRESS_CHANCE) {
    console.log("[simulator] Simulating a doorbell button press.");
    await simulateCapture(idToken, "button");
  }
}

async function main() {
  console.log(`[simulator] Starting fake "${DEVICE_ID}" — polling every ${POLL_INTERVAL_MS}ms`);
  console.log("[simulator] Press Ctrl+C to stop.");

  const idToken = await ensureIdToken();

  // Simulate the automatic boot-time capture the real firmware does.
  await simulateCapture(idToken, "boot");
  await sendHeartbeat(idToken, false);

  setInterval(() => {
    pollOnce().catch((err) => console.log("[simulator] poll error:", err.message));
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    ensureIdToken()
      .then((token) => simulateCapture(token, "timelapse"))
      .catch((err) => console.log("[simulator] timelapse error:", err.message));
  }, TIMELAPSE_INTERVAL_MS);
}

main().catch((err) => {
  console.error("[simulator] fatal error:", err.message);
  process.exit(1);
});
