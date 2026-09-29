export const OFFICIAL_EVENT_FEED_URLS: Readonly<Record<string, string>>;

export function parseEventFeedEntries(xml: string): { message: string; timestamp: number }[];
