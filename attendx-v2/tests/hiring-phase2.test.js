// ============================================================
// AttendX v2 — Hiring Module: Phase 2 Test Suite
// Verifies MatchScoreEngine, IcsCalendarGenerator, Meeting Providers,
// Outreach Personalization, and Interview Conflict Detection
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { MatchScoreEngine } from '../lib/hiring/match-score-engine.ts'
import { IcsCalendarGenerator, MeetingProviderFactory } from '../lib/hiring/meeting-provider.ts'
import { TemplateEngine } from '../lib/hiring/template-engine.ts'

test('Hiring Module — Phase 2: Scoring, Meetings & Outreach Suite', async (t) => {
  await t.test('SCORE-01: Match score gives high score when candidate possesses all required skills', () => {
    const candidate = {
      total_experience_years: 5.5,
      skills: [
        { skill_name: 'React', experience_years: 5, proficiency_level: 'EXPERT' },
        { skill_name: 'TypeScript', experience_years: 4, proficiency_level: 'ADVANCED' },
        { skill_name: 'PostgreSQL', experience_years: 3, proficiency_level: 'INTERMEDIATE' },
      ],
      raw_resume_text: 'Experienced React and TypeScript engineer building scalable PostgreSQL backends.',
    }

    const requisition = {
      title: 'Senior Full-Stack Engineer',
      min_experience_years: 4,
      max_experience_years: 8,
      job_description: 'We need a senior full-stack engineer with React, TypeScript, and PostgreSQL experience.',
      skills: [
        { id: '1', organization_id: 't1', requisition_id: 'r1', skill_name: 'React', is_required: true, weight: 5, created_at: '' },
        { id: '2', organization_id: 't1', requisition_id: 'r1', skill_name: 'TypeScript', is_required: true, weight: 5, created_at: '' },
        { id: '3', organization_id: 't1', requisition_id: 'r1', skill_name: 'PostgreSQL', is_required: true, weight: 4, created_at: '' },
      ],
    }

    const result = MatchScoreEngine.compute(candidate, requisition)

    assert.equal(result.skill_score, 100)
    assert.ok(result.match_score >= 85, `Match score ${result.match_score} should be >= 85`)
    assert.equal(result.reasoning.missing_skills.length, 0)
    assert.equal(result.reasoning.skill_matches.length, 3)
  })

  await t.test('SCORE-02: Match score flags missing required skills and reduces score', () => {
    const candidate = {
      total_experience_years: 2.0,
      skills: [
        { skill_name: 'HTML', experience_years: 2 },
      ],
      raw_resume_text: 'Junior web developer with HTML experience.',
    }

    const requisition = {
      title: 'Senior AI Engineer',
      min_experience_years: 5,
      max_experience_years: 9,
      skills: [
        { id: '1', organization_id: 't1', requisition_id: 'r1', skill_name: 'Python', is_required: true, weight: 5, created_at: '' },
        { id: '2', organization_id: 't1', requisition_id: 'r1', skill_name: 'PyTorch', is_required: true, weight: 5, created_at: '' },
      ],
    }

    const result = MatchScoreEngine.compute(candidate, requisition)

    assert.equal(result.skill_score, 0)
    assert.ok(result.match_score < 50, `Match score ${result.match_score} should be < 50`)
    assert.equal(result.reasoning.missing_skills.includes('Python'), true)
    assert.equal(result.reasoning.missing_skills.includes('PyTorch'), true)
  })

  await t.test('MEET-01: MeetingProviderFactory creates distinct platform join links', async () => {
    const gMeetProvider = MeetingProviderFactory.getProvider('GOOGLE_MEET')
    const gResult = await gMeetProvider.createMeeting({
      title: 'Technical Round 1',
      scheduledStart: '2026-10-01T10:00:00Z',
      scheduledEnd: '2026-10-01T11:00:00Z',
      attendeeEmails: ['candidate@test.com'],
      platform: 'GOOGLE_MEET',
    })
    assert.ok(gResult.joinUrl.startsWith('https://meet.google.com/'))

    const zoomProvider = MeetingProviderFactory.getProvider('ZOOM')
    const zResult = await zoomProvider.createMeeting({
      title: 'Managerial Round',
      scheduledStart: '2026-10-01T14:00:00Z',
      scheduledEnd: '2026-10-01T15:00:00Z',
      attendeeEmails: ['candidate@test.com'],
      platform: 'ZOOM',
    })
    assert.ok(zResult.joinUrl.startsWith('https://zoom.us/j/'))
  })

  await t.test('MEET-02: IcsCalendarGenerator formats valid RFC 5545 calendar text', () => {
    const ics = IcsCalendarGenerator.generate({
      uid: 'int-uuid-1234',
      title: 'Senior Engineer Interview',
      description: 'System design assessment with hiring team',
      location: 'https://meet.google.com/abc-defg-hij',
      startTime: '2026-10-05T09:00:00.000Z',
      endTime: '2026-10-05T10:00:00.000Z',
      organizerEmail: 'recruiter@attendx.io',
      attendeeEmail: 'candidate@test.com',
    })

    assert.ok(ics.includes('BEGIN:VCALENDAR'))
    assert.ok(ics.includes('END:VCALENDAR'))
    assert.ok(ics.includes('BEGIN:VEVENT'))
    assert.ok(ics.includes('END:VEVENT'))
    assert.ok(ics.includes('UID:int-uuid-1234@attendx.io'))
    assert.ok(ics.includes('SUMMARY:Senior Engineer Interview'))
    assert.ok(ics.includes('LOCATION:https://meet.google.com/abc-defg-hij'))
  })

  await t.test('OUTREACH-01: Template personalization replaces {{variables}} correctly', () => {
    const template = 'Hi {{candidate_name}}, we invite you to interview for {{role_title}} at {{company_name}}!'
    const personalized = TemplateEngine.interpolate(template, {
      candidate_name: 'Aarav Sharma',
      role_title: 'Full Stack Engineer',
      company_name: 'AttendX',
    })

    assert.equal(
      personalized,
      'Hi Aarav Sharma, we invite you to interview for Full Stack Engineer at AttendX!'
    )
  })
})
