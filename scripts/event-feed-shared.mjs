// Shared by scripts/sync-events.mjs and src/lib/events/event-feed.ts.
export const OFFICIAL_EVENT_FEED_URLS = {
  Affliction: "http://affliction.wurmonline.com/battles/server_feed.xml",
  Cadence: "https://cadence.game.wurmonline.com/battles/server_feed.xml",
  Celebration: "https://celebration.wurmonline.com/battles/server_feed.xml",
  Chaos: "http://chaos.game.wurmonline.com/battles/server_feed.xml",
  Defiance: "https://defiance.game.wurmonline.com/battles/server_feed.xml",
  Deliverance: "http://deliverance.game.wurmonline.com/battles/server_feed.xml",
  Desertion: "http://desertion.wurmonline.com/battles/server_feed.xml",
  Elevation: "http://elevation.wurmonline.com/battles/server_feed.xml",
  Exodus: "http://exodus.game.wurmonline.com/battles/server_feed.xml",
  Harmony: "https://harmony.game.wurmonline.com/battles/server_feed.xml",
  Independence: "https://independence.game.wurmonline.com/battles/server_feed.xml",
  Melody: "https://melody.game.wurmonline.com/battles/server_feed.xml",
  Pristine: "http://pristine.game.wurmonline.com/battles/server_feed.xml",
  Release: "http://release.game.wurmonline.com/battles/server_feed.xml",
  Serenity: "http://serenity.wurmonline.com/battles/server_feed.xml",
  Xanadu: "http://xanadu.game.wurmonline.com/battles/server_feed.xml"
};

/** Extracts the non-empty feed messages in document order (unsorted). */
export function parseEventFeedEntries(xml) {
  const entries = [];
  const messageRegex = /<message\s+text="([^"]*)"\s+time="(\d+)"\s*\/>/g;
  let match;

  while ((match = messageRegex.exec(xml)) !== null) {
    const message = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const timestamp = Number.parseInt(match[2], 10);

    if (message !== "" && Number.isFinite(timestamp)) {
      entries.push({ message, timestamp });
    }
  }

  return entries;
}
