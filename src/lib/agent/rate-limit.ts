import { setTimeout as delay } from "node:timers/promises";
const nextSlots = new Map<string, number>();
/** Reserve a slot synchronously so concurrent projects share the same API pacing. */
export async function waitForModelSlot(
  provider: string,
  intervalMs: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const now = Date.now();
  const slot = Math.max(now, nextSlots.get(provider) || 0);
  nextSlots.set(provider, slot + intervalMs);
  if (slot > now) await delay(slot - now, undefined, { signal });
}
