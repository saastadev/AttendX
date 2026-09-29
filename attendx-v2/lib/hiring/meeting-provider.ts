// ============================================================
// AttendX v2 — Hiring Module: Meeting Provider & Calendar Integration
// Pluggable meeting providers (Google Meet, Zoom, Teams, Manual)
// Generates standard RFC 5545 iCalendar (.ics) files
// ============================================================

import type { InterviewPlatform } from '../../types/hiring'

export interface CreateMeetingOptions {
  title: string
  description?: string
  scheduledStart: string
  scheduledEnd: string
  timezone?: string
  attendeeEmails: string[]
  platform: InterviewPlatform
  customLink?: string
}

export interface MeetingResult {
  joinUrl: string
  providerEventId: string
  platform: InterviewPlatform
}

export interface MeetingProvider {
  createMeeting(options: CreateMeetingOptions): Promise<MeetingResult>
}

// ------------------------------------------------------------
// Adapter 1: Google Meet Provider (Stub for Google Calendar API)
// ------------------------------------------------------------
export class GoogleMeetProvider implements MeetingProvider {
  async createMeeting(options: CreateMeetingOptions): Promise<MeetingResult> {
    // TODO(provider: google_calendar): Call Google Calendar API v3 to create event with conferenceData.
    const randomSlug = Math.random().toString(36).substring(2, 5) + '-' +
      Math.random().toString(36).substring(2, 6) + '-' +
      Math.random().toString(36).substring(2, 5)
    const joinUrl = options.customLink || `https://meet.google.com/${randomSlug}`
    const providerEventId = `gcal_${Date.now()}_${Math.floor(Math.random() * 10000)}`

    return {
      joinUrl,
      providerEventId,
      platform: 'GOOGLE_MEET',
    }
  }
}

// ------------------------------------------------------------
// Adapter 2: Zoom Provider (Stub for Zoom API)
// ------------------------------------------------------------
export class ZoomProvider implements MeetingProvider {
  async createMeeting(options: CreateMeetingOptions): Promise<MeetingResult> {
    // TODO(provider: zoom): Call Zoom Meetings API /users/me/meetings.
    const meetingId = Math.floor(10000000000 + Math.random() * 90000000000)
    const joinUrl = options.customLink || `https://zoom.us/j/${meetingId}?pwd=${Math.random().toString(36).slice(2, 8)}`
    const providerEventId = `zoom_${meetingId}`

    return {
      joinUrl,
      providerEventId,
      platform: 'ZOOM',
    }
  }
}

// ------------------------------------------------------------
// Adapter 3: Microsoft Teams Provider (Stub)
// ------------------------------------------------------------
export class TeamsProvider implements MeetingProvider {
  async createMeeting(options: CreateMeetingOptions): Promise<MeetingResult> {
    // TODO(provider: ms_teams): Call Microsoft Graph API /me/onlineMeetings.
    const joinUrl = options.customLink || `https://teams.microsoft.com/l/meetup-join/${Date.now()}`
    const providerEventId = `teams_${Date.now()}`

    return {
      joinUrl,
      providerEventId,
      platform: 'TEAMS',
    }
  }
}

// ------------------------------------------------------------
// Adapter 4: Manual / Fallback Provider
// ------------------------------------------------------------
export class ManualMeetingProvider implements MeetingProvider {
  async createMeeting(options: CreateMeetingOptions): Promise<MeetingResult> {
    return {
      joinUrl: options.customLink || 'In-Person / Phone meeting',
      providerEventId: `manual_${Date.now()}`,
      platform: options.platform,
    }
  }
}

// ------------------------------------------------------------
// Factory
// ------------------------------------------------------------
export class MeetingProviderFactory {
  static getProvider(platform: InterviewPlatform): MeetingProvider {
    switch (platform) {
      case 'GOOGLE_MEET':
        return new GoogleMeetProvider()
      case 'ZOOM':
        return new ZoomProvider()
      case 'TEAMS':
        return new TeamsProvider()
      case 'IN_PERSON':
      case 'PHONE':
      default:
        return new ManualMeetingProvider()
    }
  }
}

// ------------------------------------------------------------
// iCalendar (.ics) Generator
// ------------------------------------------------------------
export class IcsCalendarGenerator {
  /**
   * Generates standard RFC 5545 iCalendar content string for email attachment
   */
  static generate(params: {
    uid: string
    title: string
    description: string
    location: string
    startTime: string // ISO string
    endTime: string // ISO string
    organizerEmail: string
    attendeeEmail: string
  }): string {
    const formatDate = (isoStr: string) => {
      const d = new Date(isoStr)
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    }

    const now = formatDate(new Date().toISOString())
    const start = formatDate(params.startTime)
    const end = formatDate(params.endTime)

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AttendX Inc//Hiring Module//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${params.uid}@attendx.io`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${params.title.replace(/\n/g, ' ')}`,
      `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
      `LOCATION:${params.location}`,
      `ORGANIZER;CN=AttendX Hiring:MAILTO:${params.organizerEmail}`,
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:MAILTO:${params.attendeeEmail}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
  }
}
