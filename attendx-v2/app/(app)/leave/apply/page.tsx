'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ArrowLeft, Send, AlertCircle } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/components/ui/Toast'
import { addToOfflineQueue } from '@/lib/offline/queue'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { PageWrapper } from '@/components/ui/PageWrapper'
import type { LeaveType } from '@/types/database'

export default function LeaveApplyPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { success, error } = useToast()
  const { isOnline } = useOfflineSync()
  const queryClient = useQueryClient()

  const [leaveTypeId, setLeaveTypeId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [reason, setReason] = useState<string>('')

  // Fetch available Leave Types for this tenant
  const { data: leaveTypes } = useQuery<LeaveType[]>({
    queryKey: ['leave-types', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('leave_types')
        .select('*')
        .eq('tenant_id', user.tenant.id)
      return data ?? []
    },
    enabled: !!user,
  })

  // Calculate total days between start and end date
  const calculateDays = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const diffTime = end.getTime() - start.getTime()
    if (diffTime < 0) return 0
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  }

  const totalDays = calculateDays()

  // Apply Leave Mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      if (!leaveTypeId) throw new Error('Please select a leave type')
      if (!startDate || !endDate) throw new Error('Please select start and end dates')
      if (totalDays <= 0) throw new Error('End date must be on or after start date')
      if (!reason.trim()) throw new Error('Please provide a reason for leave')

      const payload = {
        tenant_id: user.tenant.id,
        employee_id: user.id,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        reason,
        status: 'PENDING' as const,
        applied_at: new Date().toISOString(),
      }

      if (!isOnline) {
        await addToOfflineQueue({
          id: crypto.randomUUID(),
          entityType: 'leave',
          action: 'create',
          payload,
        })
        return { offline: true }
      }

      const { error: err } = await supabase.from('leaves').insert(payload)
      if (err) throw err

      return { offline: false }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] })
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] })

      if (res.offline) {
        success('Leave application queued offline!', 'Will submit automatically when connection is restored.')
      } else {
        success('Leave application submitted successfully!')
      }

      router.push('/leave')
    },
    onError: (err: any) => {
      error('Failed to submit leave', err.message)
    },
  })

  return (
    <PageWrapper style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <button onClick={() => router.back()} className="btn btn-secondary btn-icon" aria-label="Go back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.5rem', marginBottom: 0 }}>Apply for Leave</h1>
          <p className="page-subtitle" style={{ fontSize: '0.875rem' }}>Submit a new time-off request to your manager</p>
        </div>
      </div>

      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); applyMutation.mutate() }}>
          <div className="form-section">
            {/* Leave Type Selector */}
            <div className="input-group">
              <label className="input-label input-label-required">Leave Type</label>
              <select
                className="input select"
                value={leaveTypeId}
                onChange={e => setLeaveTypeId(e.target.value)}
                required
              >
                <option value="">Select leave type…</option>
                {leaveTypes?.map(lt => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name} ({lt.days_per_year} days/yr)
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="form-row">
              <div className="input-group">
                <label className="input-label input-label-required">Start Date</label>
                <input
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label input-label-required">End Date</label>
                <input
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Total Days Indicator */}
            {totalDays > 0 && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--accent-light)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-dark)',
                fontWeight: 600,
                fontSize: '0.9375rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <CalendarDays size={18} /> Requested Duration: {totalDays} {totalDays === 1 ? 'day' : 'days'}
              </div>
            )}

            {/* Reason */}
            <div className="input-group">
              <label className="input-label input-label-required">Reason for Leave</label>
              <textarea
                className="input textarea"
                placeholder="Brief description of reason for leave…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                required
                rows={4}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button
                type="button"
                onClick={() => router.back()}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={applyMutation.isPending}
                className={`btn btn-primary ${applyMutation.isPending ? 'btn-loading' : ''}`}
                style={{ flex: 1 }}
                id="btn-submit-leave"
              >
                <Send size={18} /> {applyMutation.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PageWrapper>
  )
}
