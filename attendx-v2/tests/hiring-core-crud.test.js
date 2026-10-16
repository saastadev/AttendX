// ============================================================
// AttendX v2 — Hiring Module: Core CRUD & Logic Suite
// Tests resume parsing, skill matching, stage metadata, and API contracts
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeParser } from '../lib/hiring/resume-parser.ts'
import { HiringStateMachine } from '../lib/hiring/state-machine.ts'
import { RequisitionService } from '../lib/hiring/requisition-service.ts'

test('Hiring Module — Core CRUD & Business Logic Suite', async (t) => {
  await t.test('CRUD-01: Resume parser extracts key technical skills accurately', () => {
    const resumeText = `
      John Doe - Staff Software Engineer
      Summary: Over 6 years of experience architecting large scale distributed web applications.
      Core Competencies: React, Next.js, TypeScript, Node.js, PostgreSQL, Docker, AWS, GraphQL.
      Employment History:
      Senior Full Stack Engineer at Acme Labs (3 years)
      Full Stack Developer at Tech Corp (3.5 years)
    `

    const parsed = ResumeParser.parse(resumeText)

    assert.ok(parsed.extractedSkills.includes('React'))
    assert.ok(parsed.extractedSkills.includes('TypeScript'))
    assert.ok(parsed.extractedSkills.includes('Node.js'))
    assert.ok(parsed.extractedSkills.includes('PostgreSQL'))
    assert.ok(parsed.extractedSkills.includes('Next.js'))
    assert.ok(parsed.extractedSkills.includes('Docker'))
    assert.ok(parsed.extractedSkills.includes('AWS'))
    assert.equal(parsed.estimatedExperienceYears, 6.0)
    assert.equal(parsed.inferredRole, 'Full Stack Engineer')
  })

  await t.test('CRUD-02: Resume parser infers role from DevOps keywords', () => {
    const resumeText = `
      Jane Smith - Cloud Platform Lead
      5+ years of experience managing Kubernetes clusters, CI/CD pipelines, and Terraform infrastructure.
      Extensive SRE on-call rotations and Datadog monitoring.
    `

    const parsed = ResumeParser.parse(resumeText)

    assert.ok(parsed.extractedSkills.includes('Kubernetes'))
    assert.ok(parsed.extractedSkills.includes('CI/CD'))
    assert.equal(parsed.estimatedExperienceYears, 5.0)
    assert.equal(parsed.inferredRole, 'DevOps / SRE')
  })

  await t.test('CRUD-03: Stage metadata provides consistent UI labels and theme colors', () => {
    const appliedMeta = HiringStateMachine.getStageMeta('APPLIED')
    assert.equal(appliedMeta.label, 'Applied')
    assert.equal(appliedMeta.isTerminal, false)

    const interviewMeta = HiringStateMachine.getStageMeta('INTERVIEW')
    assert.equal(interviewMeta.label, 'Interview')
    assert.equal(interviewMeta.color, 'warning')

    const selectedMeta = HiringStateMachine.getStageMeta('SELECTED')
    assert.equal(selectedMeta.label, 'Selected')
    assert.equal(selectedMeta.color, 'success')

    const onboardedMeta = HiringStateMachine.getStageMeta('ONBOARDED')
    assert.equal(onboardedMeta.label, 'Onboarded')
    assert.equal(onboardedMeta.isTerminal, true)

    const rejectedMeta = HiringStateMachine.getStageMeta('REJECTED')
    assert.equal(rejectedMeta.label, 'Rejected')
    assert.equal(rejectedMeta.isTerminal, true)
  })

  await t.test('CRUD-04: RequisitionService rejects invalid work_mode with 400', async () => {
    const dummyClient = {}
    await assert.rejects(
      async () => {
        await RequisitionService.create(dummyClient, 'org-1', 'user-1', {
          requisition_code: 'REQ-WM-FAIL',
          title: 'Staff Architect',
          work_mode: 'ANYWHERE',
        })
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes("Invalid work_mode 'ANYWHERE'"))
        return true
      }
    )
  })

  await t.test('CRUD-05: RequisitionService rejects target_close_date earlier than opening_date with 400', async () => {
    const dummyClient = {}
    await assert.rejects(
      async () => {
        await RequisitionService.create(dummyClient, 'org-1', 'user-1', {
          requisition_code: 'REQ-DATE-FAIL',
          title: 'Staff Architect',
          opening_date: '2026-10-25',
          target_close_date: '2026-10-10',
        })
      },
      (err) => {
        assert.equal(err.status, 400)
        assert.ok(err.message.includes('Target close date cannot be earlier than opening date'))
        return true
      }
    )
  })
})
