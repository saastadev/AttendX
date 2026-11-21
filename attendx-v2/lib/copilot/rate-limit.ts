// A simple per-person limit on copilot messages (per server process), so one
// account can't run up the OpenAI bill. 12 messages a minute, 300 a day.
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const PER_MINUTE = 12
const PER_DAY = 300

const sent = new Map<string, number[]>()

export function allowCopilotRequest(userId: string, now = Date.now()): boolean {
  const recent = (sent.get(userId) ?? []).filter((t) => now - t < DAY)
  const lastMinute = recent.filter((t) => now - t < MINUTE).length
  if (lastMinute >= PER_MINUTE || recent.length >= PER_DAY) {
    sent.set(userId, recent)
    return false
  }
  recent.push(now)
  sent.set(userId, recent)
  return true
}
