'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Calendar, Trash2, Eye, Camera, CheckCircle,
  AlertCircle, Search, Filter, ShieldCheck, User
} from 'lucide-react'
import Image from 'next/image'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { PageWrapper } from '@/components/ui/PageWrapper'

interface AttendanceItem {
  user_id: string
  full_name: string
  email: string
  avatar_url: string | null
  employee_code: string
  department_name: string
  liveStatus: 'PRESENT' | 'COMPLETED' | 'LATE' | 'ON_LEAVE' | 'ABSENT'
  attendance: {
    id: string
    clock_in_at: string | null
    clock_out_at: string | null
    status: string
    method: string
    clock_in_selfie_url: string | null
    clock_out_selfie_url: string | null
    work_minutes: number | null
  } | null
  leave: {
    leave_type_name: string
    reason: string
  } | null
}

export default function AdminAttendancePage() {
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchTerm, setSearchTerm] = useState('')
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<{ recordId: string; target: 'clock_in' | 'clock_out' | 'both'; name: string } | null>(null)

  // Fetch Attendance Records
  const { data: responseData, isLoading } = useQuery<{
    date: string
    stats: { total: number; present: number; completed: number; late: number; on_leave: number; absent: number }
    items: AttendanceItem[]
  }>({
    queryKey: ['admin-attendance-records', user?.tenant?.id, selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/admin/attendance?date=${selectedDate}`)
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    enabled: !!user,
  })

  // Delete Selfie Mutation
  const deleteSelfieMutation = useMutation({
    mutationFn: async ({ recordId, target }: { recordId: string; target: 'clock_in' | 'clock_out' | 'both' }) => {
      const res = await fetch('/api/admin/attendance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record_id: recordId, target }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Failed to delete selfie' }))
        throw new Error(errJson.error)
      }
      return res.json()
    },
    onSuccess: (data) => {
      success(data.message || 'Selfie deleted successfully')
      setDeletingRecord(null)
      queryClient.invalidateQueries({ queryKey: ['admin-attendance-records'] })
    },
    onError: (err: Error) => {
      error(err.message || 'Failed to delete selfie image')
    },
  })

  const items = (responseData?.items ?? []).filter(item =>
    item.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const stats = responseData?.stats ?? { total: 0, present: 0, completed: 0, late: 0, on_leave: 0, absent: 0 }

  return (
    <PageWrapper style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 'var(--space-8)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)',
      }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', marginBottom: 4 }}>
            Attendance & Selfie Management
          </h1>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
            Inspect recorded check-in/out selfie photos and manage attendance verification records.
          </p>
        </div>

        {/* Date Selector */}
        <div className="input-wrap" style={{ width: 200 }}>
          <Calendar size={18} className="input-icon" aria-hidden="true" />
          <input
            type="date"
            className="input has-icon-left"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ height: 42 }}
          />
        </div>
      </div>

      {/* Stats Overview */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 'var(--space-4)', marginBottom: 'var(--space-6)',
      }}>
        <div className="neu-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>TOTAL EMPLOYEES</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{stats.total}</div>
        </div>
        <div className="neu-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>PRESENT NOW</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>{stats.present}</div>
        </div>
        <div className="neu-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>COMPLETED</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}>{stats.completed}</div>
        </div>
        <div className="neu-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>LATE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)', marginTop: 4 }}>{stats.late}</div>
        </div>
        <div className="neu-card" style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>ABSENT</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-tertiary)', marginTop: 4 }}>{stats.absent}</div>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <div className="input-wrap" style={{ maxWidth: 360 }}>
          <Search size={18} className="input-icon" aria-hidden="true" />
          <input
            type="text"
            className="input has-icon-left"
            placeholder="Search employee by name, code, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Employee List */}
      {isLoading ? (
        <div className="neu-card" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-tertiary)' }}>Loading attendance records...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="neu-card" style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
          <Camera size={40} color="var(--text-tertiary)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>No attendance records found</h3>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: 4 }}>
            No employee records match your selected date or search filter.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
          {items.map(item => {
            const att = item.attendance
            const hasClockInSelfie = !!att?.clock_in_selfie_url
            const hasClockOutSelfie = !!att?.clock_out_selfie_url

            return (
              <div key={item.user_id} className="neu-card" style={{ padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)' }}>
                {/* Employee Info Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-light)',
                    color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, overflow: 'hidden', flexShrink: 0,
                  }}>
                    {item.avatar_url ? (
                      <img src={item.avatar_url} alt={item.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      item.full_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.full_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {item.employee_code} • {item.department_name}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: 12,
                    background: item.liveStatus === 'PRESENT' || item.liveStatus === 'COMPLETED' ? 'var(--success-light)' : 'var(--neu-bg-deep)',
                    color: item.liveStatus === 'PRESENT' || item.liveStatus === 'COMPLETED' ? 'var(--success)' : 'var(--text-tertiary)',
                  }}>
                    {item.liveStatus}
                  </span>
                </div>

                {/* Selfie Section */}
                <div style={{ background: 'var(--neu-bg-deep)', padding: 12, borderRadius: 12 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Camera size={14} /> Recorded Selfies
                  </div>

                  {!att || (!hasClockInSelfie && !hasClockOutSelfie) ? (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '8px 0' }}>
                      No selfie images recorded for this date.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {/* Clock In Selfie */}
                      <div style={{ background: 'var(--neu-bg)', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                          CLOCK IN SELFIE
                        </div>
                        {hasClockInSelfie ? (
                          <div>
                            <div style={{ position: 'relative', width: '100%', height: 100, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                              <img
                                src={att.clock_in_selfie_url!}
                                alt="Clock In Selfie"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                onClick={() => setPreviewImage({ url: att.clock_in_selfie_url!, title: `${item.full_name} - Clock In Selfie` })}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1, height: 28, fontSize: '0.75rem', padding: '0 6px' }}
                                onClick={() => setPreviewImage({ url: att.clock_in_selfie_url!, title: `${item.full_name} - Clock In Selfie` })}
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ background: 'var(--danger-light)', color: 'var(--danger)', height: 28, padding: '0 8px' }}
                                onClick={() => setDeletingRecord({ recordId: att.id, target: 'clock_in', name: `${item.full_name} Clock In` })}
                                title="Delete Clock In Selfie"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Not recorded</div>
                        )}
                      </div>

                      {/* Clock Out Selfie */}
                      <div style={{ background: 'var(--neu-bg)', padding: 8, borderRadius: 8, border: '1px solid rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                          CLOCK OUT SELFIE
                        </div>
                        {hasClockOutSelfie ? (
                          <div>
                            <div style={{ position: 'relative', width: '100%', height: 100, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                              <img
                                src={att.clock_out_selfie_url!}
                                alt="Clock Out Selfie"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                onClick={() => setPreviewImage({ url: att.clock_out_selfie_url!, title: `${item.full_name} - Clock Out Selfie` })}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ flex: 1, height: 28, fontSize: '0.75rem', padding: '0 6px' }}
                                onClick={() => setPreviewImage({ url: att.clock_out_selfie_url!, title: `${item.full_name} - Clock Out Selfie` })}
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ background: 'var(--danger-light)', color: 'var(--danger)', height: 28, padding: '0 8px' }}
                                onClick={() => setDeletingRecord({ recordId: att.id, target: 'clock_out', name: `${item.full_name} Clock Out` })}
                                title="Delete Clock Out Selfie"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Not recorded</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setPreviewImage(null)}>
          <div style={{ background: 'var(--neu-bg)', borderRadius: 16, padding: 20, maxWidth: 500, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{previewImage.title}</h3>
              <button onClick={() => setPreviewImage(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <img src={previewImage.url} alt={previewImage.title} style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 12 }} />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: 'var(--neu-bg)', borderRadius: 16, padding: 24, maxWidth: 420, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AlertCircle size={24} color="var(--danger)" />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-primary)' }}>Delete Selfie Image?</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to delete the recorded selfie photo for <strong>{deletingRecord.name}</strong>? This action will remove the photo file from storage.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setDeletingRecord(null)}
                disabled={deleteSelfieMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: 'var(--danger)', color: 'white' }}
                onClick={() => deleteSelfieMutation.mutate({ recordId: deletingRecord.recordId, target: deletingRecord.target })}
                disabled={deleteSelfieMutation.isPending}
              >
                {deleteSelfieMutation.isPending ? 'Deleting...' : 'Delete Image'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
