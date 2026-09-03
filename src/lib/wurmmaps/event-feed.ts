export type WurmMapsEventKind =
  | "deed"
  | "event"
  | "holySite"
  | "lightningStrike"
  | "mission"
  | "missionConstruction"
  | "rift"
  | "rite"
  | "uniqueSlaying";

export type WurmMapsEvent = {
  id: string;
  kind: WurmMapsEventKind;
  label: string;
  message: string;
  subtype: number | null;
  timestamp: number;
};

export type WurmMapsServerStatus = {
  status: "offline" | "online" | "unknown";
  uptimeSeconds: number | null;
  weather: string | null;
  wurmTime: string | null;
};

export type WurmMapsEventFeed = {
  events: WurmMapsEvent[];
  fetchedAt: string;
  serverStatus: WurmMapsServerStatus;
  sourceUrl: string;
};
