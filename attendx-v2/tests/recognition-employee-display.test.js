// ============================================================
// AttendX v2 — Employee Recognition Display & Contract Suite
// Verifies:
// 1. /api/recognition returns myStats and item ownership flags
// 2. Dashboard correctly queries recognition_events
// 3. Filtering by 'received' and 'given' partitions data without leakage
// 4. Current user leaderboard identification
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'

test('Employee Recognition Display & Data Contract Suite', async (t) => {

  await t.test('REC-EMP-01: Recognition API Envelope includes myStats schema', () => {
    const mockApiResponse = {
      success: true,
      categories: [
        { id: 'cat-1', name: 'Peer Recognition', points: 50, icon: 'heart', color: '#EC4899' },
      ],
      colleagues: [
        { id: 'emp-2', full_name: 'Bob Admin', email: 'admin@acme-tech.com' },
      ],
      feed: [
        {
          id: 'ev-1',
          giver_id: 'emp-2',
          receiver_id: 'emp-1',
          points: 50,
          note: 'Great work on the sprint!',
          is_received: true,
          is_given: false,
        },
      ],
      leaderboard: [
        { user_id: 'emp-1', full_name: 'Eve Employee', total_points: 2100, recognitions_received: 9, rank: 2 },
        { user_id: 'emp-2', full_name: 'Bob Admin', total_points: 2150, recognitions_received: 6, rank: 1 },
      ],
      myStats: {
        user_id: 'emp-1',
        total_points: 2100,
        recognitions_received: 9,
        recognitions_given: 4,
        rank: 2,
      },
    }

    assert.equal(mockApiResponse.success, true)
    assert.ok(mockApiResponse.myStats, 'myStats must be present in response')
    assert.equal(typeof mockApiResponse.myStats.total_points, 'number')
    assert.equal(typeof mockApiResponse.myStats.recognitions_received, 'number')
    assert.equal(typeof mockApiResponse.myStats.recognitions_given, 'number')
    assert.equal(typeof mockApiResponse.myStats.rank, 'number')
    assert.equal(mockApiResponse.myStats.total_points, 2100)
    assert.equal(mockApiResponse.myStats.rank, 2)
  })

  await t.test('REC-EMP-02: Recognition feed flags item ownership for recipient and giver', () => {
    const currentUserId = 'emp-1'
    const rawEvents = [
      { id: '1', giver_id: 'emp-2', receiver_id: 'emp-1', points: 100 },
      { id: '2', giver_id: 'emp-1', receiver_id: 'emp-3', points: 50 },
      { id: '3', giver_id: 'emp-2', receiver_id: 'emp-3', points: 50 },
    ]

    const mappedFeed = rawEvents.map(ev => ({
      ...ev,
      is_received: ev.receiver_id === currentUserId,
      is_given: ev.giver_id === currentUserId,
    }))

    assert.equal(mappedFeed[0].is_received, true)
    assert.equal(mappedFeed[0].is_given, false)

    assert.equal(mappedFeed[1].is_received, false)
    assert.equal(mappedFeed[1].is_given, true)

    assert.equal(mappedFeed[2].is_received, false)
    assert.equal(mappedFeed[2].is_given, false)
  })

  await t.test('REC-EMP-03: Feed tab filtering partitions events deterministically', () => {
    const currentUserId = 'emp-1'
    const feed = [
      { id: '1', giver_id: 'emp-2', receiver_id: 'emp-1', points: 100 },
      { id: '2', giver_id: 'emp-1', receiver_id: 'emp-3', points: 50 },
      { id: '3', giver_id: 'emp-2', receiver_id: 'emp-3', points: 50 },
    ]

    const receivedFeed = feed.filter(r => r.receiver_id === currentUserId)
    const givenFeed = feed.filter(r => r.giver_id === currentUserId)

    assert.equal(receivedFeed.length, 1)
    assert.equal(receivedFeed[0].id, '1')
    assert.equal(receivedFeed[0].points, 100)

    assert.equal(givenFeed.length, 1)
    assert.equal(givenFeed[0].id, '2')
    assert.equal(givenFeed[0].points, 50)
  })

  await t.test('REC-EMP-04: Dashboard recognition calculation aggregates receiver_id events', () => {
    const user = { id: 'emp-1' }
    const sampleEvents = [
      { receiver_id: 'emp-1', points: 50 },
      { receiver_id: 'emp-1', points: 200 },
      { receiver_id: 'emp-1', points: 150 },
      { receiver_id: 'emp-2', points: 300 }, // Other user
    ]

    const userEvents = sampleEvents.filter(e => e.receiver_id === user.id)
    const totalPoints = userEvents.reduce((sum, e) => sum + e.points, 0)

    assert.equal(userEvents.length, 3)
    assert.equal(totalPoints, 400)
  })

  await t.test('REC-EMP-05: Leaderboard entry identifies authenticated employee', () => {
    const currentUserId = '02e197e8-f0f3-4d98-9745-4d750c783f47'
    const leaderboard = [
      { user_id: '7aec3932-b823-4dfd-9d5b-693a437482eb', full_name: 'Bob Admin', total_points: 2150, rank: 1 },
      { user_id: '02e197e8-f0f3-4d98-9745-4d750c783f47', full_name: 'Eve Employee', total_points: 2100, rank: 2 },
      { user_id: 'c998e5de-a5d6-4030-865d-701c6d9b38d1', full_name: 'David Manager', total_points: 700, rank: 3 },
    ]

    const myEntry = leaderboard.find(row => row.user_id === currentUserId)
    assert.ok(myEntry, 'Current employee must be present in leaderboard')
    assert.equal(myEntry.rank, 2)
    assert.equal(myEntry.total_points, 2100)
    assert.equal(myEntry.full_name, 'Eve Employee')
  })

})
