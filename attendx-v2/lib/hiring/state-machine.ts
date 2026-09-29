// ============================================================
// AttendX v2 — Hiring Unified State Machine
// Single Source of Truth for Pipeline Transitions
// Enforced in service layer; invalid transitions reject with 409 Conflict
// ============================================================

import type { HiringStage } from '../../types/hiring'

export const VALID_STAGES: readonly HiringStage[] = [
  'SOURCED',
  'CONTACTED',
  'APPLIED',
  'SHORTLISTED',
  'INTERVIEW',
  'SELECTED',
  'OFFER_INTEREST_SENT',
  'OFFER_ACCEPTED',
  'DOCUMENTS_PENDING',
  'DOCUMENTS_VERIFIED',
  'OFFER_RELEASED',
  'OFFER_FINAL_ACCEPTED',
  'ONBOARDED',
  'REJECTED',
  'WITHDRAWN',
  'OFFER_DECLINED',
  'OFFER_FINAL_DECLINED',
] as const

/**
 * Strict transition map: defines valid destination stages from each origin stage.
 */
export const STAGE_TRANSITION_MAP: Record<HiringStage, readonly HiringStage[]> = {
  SOURCED: ['CONTACTED', 'APPLIED', 'REJECTED', 'WITHDRAWN'],
  CONTACTED: ['APPLIED', 'REJECTED', 'WITHDRAWN'],
  APPLIED: ['SHORTLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['SELECTED', 'REJECTED', 'WITHDRAWN'],
  SELECTED: ['OFFER_INTEREST_SENT', 'OFFER_RELEASED', 'REJECTED', 'WITHDRAWN'],
  OFFER_INTEREST_SENT: ['OFFER_ACCEPTED', 'OFFER_DECLINED', 'REJECTED', 'WITHDRAWN'],
  OFFER_ACCEPTED: ['DOCUMENTS_PENDING', 'REJECTED', 'WITHDRAWN'],
  DOCUMENTS_PENDING: ['DOCUMENTS_VERIFIED', 'REJECTED', 'WITHDRAWN'],
  DOCUMENTS_VERIFIED: ['OFFER_RELEASED', 'ONBOARDED', 'REJECTED', 'WITHDRAWN'],
  OFFER_RELEASED: ['OFFER_FINAL_ACCEPTED', 'OFFER_FINAL_DECLINED', 'REJECTED', 'WITHDRAWN'],
  OFFER_FINAL_ACCEPTED: ['ONBOARDED', 'DOCUMENTS_PENDING', 'WITHDRAWN'],
  ONBOARDED: [], // Terminal stage
  REJECTED: [], // Terminal stage
  WITHDRAWN: [], // Terminal stage
  OFFER_DECLINED: [], // Terminal stage
  OFFER_FINAL_DECLINED: [], // Terminal stage
}

export class HiringStateMachineError extends Error {
  public readonly status = 409
  public readonly fromStage: HiringStage
  public readonly toStage: HiringStage

  constructor(fromStage: HiringStage, toStage: HiringStage) {
    super(
      `Invalid stage transition: Cannot move application from '${fromStage}' to '${toStage}'. ` +
      `Allowed transitions from '${fromStage}' are: [${(STAGE_TRANSITION_MAP[fromStage] || []).join(', ')}]`
    )
    this.name = 'HiringStateMachineError'
    this.fromStage = fromStage
    this.toStage = toStage
  }
}

export class HiringStateMachine {
  /**
   * Validates whether transition from fromStage to toStage is allowed.
   * Throws HiringStateMachineError (status 409) if invalid.
   */
  static validateTransition(fromStage: string, toStage: string): void {
    if (!VALID_STAGES.includes(fromStage as HiringStage)) {
      throw new Error(`Unknown origin stage: '${fromStage}'`)
    }
    if (!VALID_STAGES.includes(toStage as HiringStage)) {
      throw new Error(`Unknown destination stage: '${toStage}'`)
    }

    const current = fromStage as HiringStage
    const target = toStage as HiringStage

    // No-op transition is allowed
    if (current === target) return

    const allowed = STAGE_TRANSITION_MAP[current] || []
    if (!allowed.includes(target)) {
      throw new HiringStateMachineError(current, target)
    }
  }

  /**
   * Helper predicate for checking if transition is valid without throwing
   */
  static canTransition(fromStage: string, toStage: string): boolean {
    try {
      this.validateTransition(fromStage, toStage)
      return true
    } catch {
      return false
    }
  }

  /**
   * Validates and returns the target stage.
   */
  static transition(fromStage: string, toStage: string, role?: string): HiringStage {
    this.validateTransition(fromStage, toStage)
    return toStage as HiringStage
  }

  /**
   * Maps each stage to its primary display status and pipeline column
   */
  static getStageMeta(stage: HiringStage): {
    label: string
    color: 'default' | 'primary' | 'success' | 'warning' | 'danger'
    isTerminal: boolean
  } {
    switch (stage) {
      case 'SOURCED':
        return { label: 'Sourced', color: 'default', isTerminal: false }
      case 'CONTACTED':
        return { label: 'Contacted', color: 'default', isTerminal: false }
      case 'APPLIED':
        return { label: 'Applied', color: 'primary', isTerminal: false }
      case 'SHORTLISTED':
        return { label: 'Shortlisted', color: 'primary', isTerminal: false }
      case 'INTERVIEW':
        return { label: 'Interview', color: 'warning', isTerminal: false }
      case 'SELECTED':
        return { label: 'Selected', color: 'success', isTerminal: false }
      case 'OFFER_INTEREST_SENT':
        return { label: 'Offer Interest Sent', color: 'warning', isTerminal: false }
      case 'OFFER_ACCEPTED':
        return { label: 'Offer Interest Accepted', color: 'success', isTerminal: false }
      case 'DOCUMENTS_PENDING':
        return { label: 'Documents Pending', color: 'warning', isTerminal: false }
      case 'DOCUMENTS_VERIFIED':
        return { label: 'Documents Verified', color: 'success', isTerminal: false }
      case 'OFFER_RELEASED':
        return { label: 'Offer Released', color: 'primary', isTerminal: false }
      case 'OFFER_FINAL_ACCEPTED':
        return { label: 'Offer Accepted', color: 'success', isTerminal: false }
      case 'ONBOARDED':
        return { label: 'Onboarded', color: 'success', isTerminal: true }
      case 'REJECTED':
        return { label: 'Rejected', color: 'danger', isTerminal: true }
      case 'WITHDRAWN':
        return { label: 'Withdrawn', color: 'danger', isTerminal: true }
      case 'OFFER_DECLINED':
        return { label: 'Offer Declined', color: 'danger', isTerminal: true }
      case 'OFFER_FINAL_DECLINED':
        return { label: 'Final Offer Declined', color: 'danger', isTerminal: true }
      default:
        return { label: stage, color: 'default', isTerminal: false }
    }
  }
}
