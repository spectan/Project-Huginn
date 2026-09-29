import { triggerAlertDetection } from "./alert-service";

/** Starts alert detection without letting a failure affect the calling request. */
export function triggerAlertsSafely(): void {
  try {
    triggerAlertDetection();
  } catch {
    // Alert detection is fire-and-forget; failures must not block the request.
  }
}
