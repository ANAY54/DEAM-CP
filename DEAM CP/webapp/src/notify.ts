// Plays a short two-tone doorbell chime using the Web Audio API - no audio
// file to ship, works the moment the page has had any user interaction.
export function playChime() {
  try {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    [[880, 0], [660, 0.18]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.4);
    });

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Web Audio unsupported/blocked - silently skip the chime.
  }
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationsEnabled() {
  return notificationsSupported() && Notification.permission === "granted";
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showVisitorNotification(trigger: string) {
  if (!notificationsEnabled()) return;

  const title =
    trigger === "button" ? "Someone's at the door" : "New doorbell snapshot";

  new Notification(title, {
    body:
      trigger === "button"
        ? "The doorbell button was just pressed."
        : "A new visitor photo was just captured.",
    tag: "doorbell-visitor",
  });
}
