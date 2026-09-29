import { createDiscordDependencies } from "./database";
import { dispatchDiscordNotification, type DiscordNotificationMessage } from "./discord-service";

/** Sends a Discord notification without letting a failure affect the calling request. */
export function dispatchDiscordSafely(message: DiscordNotificationMessage): void {
  try {
    dispatchDiscordNotification(message, createDiscordDependencies()).catch(() => undefined);
  } catch {
    // Discord notifications are fire-and-forget; failures must not block the request.
  }
}
