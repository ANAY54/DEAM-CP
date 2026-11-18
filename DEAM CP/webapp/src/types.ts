import type { Timestamp } from "firebase/firestore";

export type VisitorTrigger = "boot" | "button" | "remote" | "timelapse";

export interface Visitor {
  id: string;
  deviceId: string;
  imageUrl: string;
  timestamp: Timestamp | null;
  trigger: VisitorTrigger;
}

export interface DeviceStatus {
  lastSeen: Timestamp | null;
  triggerCapture: boolean;
}
