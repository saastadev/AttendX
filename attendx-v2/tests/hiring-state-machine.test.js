// ============================================================
// AttendX v2 — Hiring Module: Unified State Machine Test Suite
// Verifies all happy paths, side exits, terminal invariants, and 409 errors
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { HiringStateMachine, HiringStateMachineError, STAGE_TRANSITION_MAP, VALID_STAGES } from '../lib/hiring/state-machine.ts'

test('Hiring Module — Unified State Machine Invariant Suite', async (t) => {
  await t.test('SM-01: Main progression path succeeds sequentially', () => {
    const mainPath = [
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
    ]

    for (let i = 0; i < mainPath.length - 1; i++) {
      const from = mainPath[i]
      const to = mainPath[i + 1]
      assert.doesNotThrow(
        () => HiringStateMachine.validateTransition(from, to),
        `Transition from '${from}' to '${to}' must be valid`
      )
      assert.equal(HiringStateMachine.canTransition(from, to), true)
    }
  })

  await t.test('SM-02: Optional SOURCED directly to APPLIED succeeds', () => {
    assert.doesNotThrow(() => HiringStateMachine.validateTransition('SOURCED', 'APPLIED'))
    assert.equal(HiringStateMachine.canTransition('SOURCED', 'APPLIED'), true)
  })

  await t.test('SM-03: Side exit REJECTED allowed from non-terminal active stages', () => {
    const stagesAllowingReject = [
      'SOURCED', 'CONTACTED', 'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED',
      'OFFER_INTEREST_SENT', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'DOCUMENTS_VERIFIED', 'OFFER_RELEASED'
    ]

    for (const stage of stagesAllowingReject) {
      assert.doesNotThrow(
        () => HiringStateMachine.validateTransition(stage, 'REJECTED'),
        `Rejecting from '${stage}' must be permitted`
      )
    }
  })

  await t.test('SM-04: Side exit WITHDRAWN allowed from active candidate stages', () => {
    const stagesAllowingWithdraw = [
      'SOURCED', 'CONTACTED', 'APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED',
      'OFFER_INTEREST_SENT', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'DOCUMENTS_VERIFIED',
      'OFFER_RELEASED', 'OFFER_FINAL_ACCEPTED'
    ]

    for (const stage of stagesAllowingWithdraw) {
      assert.doesNotThrow(
        () => HiringStateMachine.validateTransition(stage, 'WITHDRAWN'),
        `Withdrawal from '${stage}' must be permitted`
      )
    }
  })

  await t.test('SM-05: Offer declines only allowed from respective offer stages', () => {
    // Preliminary offer interest declined
    assert.doesNotThrow(() => HiringStateMachine.validateTransition('OFFER_INTEREST_SENT', 'OFFER_DECLINED'))
    assert.throws(
      () => HiringStateMachine.validateTransition('APPLIED', 'OFFER_DECLINED'),
      (err) => err instanceof HiringStateMachineError && err.status === 409
    )

    // Final offer declined
    assert.doesNotThrow(() => HiringStateMachine.validateTransition('OFFER_RELEASED', 'OFFER_FINAL_DECLINED'))
    assert.throws(
      () => HiringStateMachine.validateTransition('INTERVIEW', 'OFFER_FINAL_DECLINED'),
      (err) => err instanceof HiringStateMachineError && err.status === 409
    )
  })

  await t.test('SM-06: Illegal skip transitions throw 409 Conflict', () => {
    const illegalTransitions = [
      ['SOURCED', 'SELECTED'],
      ['APPLIED', 'ONBOARDED'],
      ['SHORTLISTED', 'OFFER_RELEASED'],
      ['INTERVIEW', 'DOCUMENTS_VERIFIED'],
      ['DOCUMENTS_PENDING', 'ONBOARDED'],
    ]

    for (const [from, to] of illegalTransitions) {
      assert.throws(
        () => HiringStateMachine.validateTransition(from, to),
        (err) => {
          assert.ok(err instanceof HiringStateMachineError)
          assert.equal(err.status, 409)
          assert.equal(err.fromStage, from)
          assert.equal(err.toStage, to)
          return true
        },
        `Illegal skip from '${from}' to '${to}' must reject with status 409`
      )
      assert.equal(HiringStateMachine.canTransition(from, to), false)
    }
  })

  await t.test('SM-07: Terminal stages are completely immutable', () => {
    const terminalStages = ['ONBOARDED', 'REJECTED', 'WITHDRAWN', 'OFFER_DECLINED', 'OFFER_FINAL_DECLINED']

    for (const terminal of terminalStages) {
      assert.equal(STAGE_TRANSITION_MAP[terminal].length, 0, `Terminal stage '${terminal}' must have 0 outgoing transitions`)

      for (const anyStage of VALID_STAGES) {
        if (anyStage === terminal) continue
        assert.throws(
          () => HiringStateMachine.validateTransition(terminal, anyStage),
          (err) => err instanceof HiringStateMachineError && err.status === 409,
          `Transitioning out of terminal stage '${terminal}' must be blocked`
        )
      }
    }
  })

  await t.test('SM-08: Same-stage transition is a safe no-op', () => {
    for (const stage of VALID_STAGES) {
      assert.doesNotThrow(() => HiringStateMachine.validateTransition(stage, stage))
      assert.equal(HiringStateMachine.canTransition(stage, stage), true)
    }
  })
})
