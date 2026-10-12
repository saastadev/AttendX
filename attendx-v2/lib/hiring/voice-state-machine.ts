// ============================================================
// AttendX v2 — Voice AI Call State Machine (Module 4.4)
// Authoritative single source of truth for call lifecycle states.
// Invalid transitions throw VoiceCallStateMachineError (HTTP 409 Conflict).
// ============================================================

import type { VoiceCallStatus } from '../../types/hiring.ts'

export const VALID_VOICE_CALL_STATUSES: readonly VoiceCallStatus[] = [
  'INITIATED',
  'IN_PROGRESS',
  'COMPLETED',
  'BUSY',
  'NO_ANSWER',
  'FAILED',
] as const

/**
 * Strict transition map for Voice AI call lifecycle.
 * - INITIATED: Agent dialing/ringing candidate; can move to IN_PROGRESS (answered), or terminal failure (BUSY, NO_ANSWER, FAILED)
 * - IN_PROGRESS: Conversation active; can complete successfully (COMPLETED) or drop/fail (FAILED)
 * - COMPLETED, BUSY, NO_ANSWER, FAILED: Terminal states. No further transitions permitted.
 */
export const VOICE_CALL_TRANSITION_MAP: Record<VoiceCallStatus, readonly VoiceCallStatus[]> = {
  INITIATED: ['IN_PROGRESS', 'COMPLETED', 'BUSY', 'NO_ANSWER', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  BUSY: [],
  NO_ANSWER: [],
  FAILED: [],
}

export class VoiceCallStateMachineError extends Error {
  public readonly status = 409
  public readonly fromStatus: VoiceCallStatus
  public readonly toStatus: VoiceCallStatus

  constructor(fromStatus: VoiceCallStatus, toStatus: VoiceCallStatus) {
    super(
      `Invalid voice call status transition: Cannot transition call from '${fromStatus}' to '${toStatus}'. ` +
      `Allowed transitions from '${fromStatus}' are: [${(VOICE_CALL_TRANSITION_MAP[fromStatus] || []).join(', ')}]`
    )
    this.name = 'VoiceCallStateMachineError'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}

export class VoiceCallStateMachine {
  /**
   * Validates whether transition from fromStatus to toStatus is permitted.
   * Throws VoiceCallStateMachineError (409 Conflict) if transition is invalid.
   */
  static validateTransition(fromStatus: string, toStatus: string): void {
    const from = fromStatus.toUpperCase() as VoiceCallStatus
    const to = toStatus.toUpperCase() as VoiceCallStatus

    if (!VALID_VOICE_CALL_STATUSES.includes(from)) {
      throw new Error(`Unknown origin voice call status: '${fromStatus}'`)
    }
    if (!VALID_VOICE_CALL_STATUSES.includes(to)) {
      throw new Error(`Unknown destination voice call status: '${toStatus}'`)
    }

    // Idempotent identical status is permitted
    if (from === to) return

    const allowed = VOICE_CALL_TRANSITION_MAP[from] || []
    if (!allowed.includes(to)) {
      throw new VoiceCallStateMachineError(from, to)
    }
  }

  /**
   * Non-throwing predicate to check if a transition is valid.
   */
  static canTransition(fromStatus: string, toStatus: string): boolean {
    try {
      this.validateTransition(fromStatus, toStatus)
      return true
    } catch {
      return false
    }
  }

  /**
   * Validates and returns the target status.
   */
  static transition(fromStatus: string, toStatus: string): VoiceCallStatus {
    this.validateTransition(fromStatus, toStatus)
    return toStatus.toUpperCase() as VoiceCallStatus
  }

  /**
   * Checks if status is a terminal state.
   */
  static isTerminal(status: string): boolean {
    const s = status.toUpperCase() as VoiceCallStatus
    return (VOICE_CALL_TRANSITION_MAP[s] || []).length === 0
  }
}
