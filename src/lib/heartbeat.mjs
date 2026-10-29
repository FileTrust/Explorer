export const HEARTBEAT_FRESH_SECONDS = 45 * 60;
export function heartbeatFresh(lastHeartbeat, now) {
  const last = BigInt(lastHeartbeat || 0);
  const current = BigInt(now);
  return last > 0n && last <= current && current - last <= BigInt(HEARTBEAT_FRESH_SECONDS);
}
