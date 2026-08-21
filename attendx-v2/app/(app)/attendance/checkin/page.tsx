'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, MapPin, CheckCircle, AlertCircle, RefreshCw, Clock, WifiOff, X } from 'lucide-react'
import { format } from 'date-fns'
import Webcam from 'react-webcam'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { addToOfflineQueue } from '@/lib/offline/queue'
import { useOfflineSync } from '@/hooks/useOfflineSync'
import { useToast } from '@/components/ui/Toast'
import type { AttendanceRecord, Geofence } from '@/types/database'

type Step = 'intro' | 'camera' | 'confirming' | 'success' | 'error'
type CheckinType = 'in' | 'out'

// Calculate distance between two GPS points (Haversine formula)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function CheckInPage() {
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()
  const user = useAuthStore(s => s.user)
  const { isOnline } = useOfflineSync()
  const { success: toastSuccess, error: toastError } = useToast()
  const queryClient = useQueryClient()

  const webcamRef = useRef<Webcam>(null)
  const [step, setStep] = useState<Step>('intro')
  const [checkinType, setCheckinType] = useState<CheckinType>('in')
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [geofenceResult, setGeofenceResult] = useState<{
    valid: boolean
    geofence: Geofence | null
    distance: number | null
  } | null>(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  // Today's attendance record
  const { data: todayAttendance } = useQuery<AttendanceRecord | null>({
    queryKey: ['attendance-today', user?.id, today],
    queryFn: async () => {
      if (!user) return null
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', today)
        .maybeSingle()
      return data
    },
    enabled: !!user,
  })

  // Geofences for this tenant
  const { data: geofences } = useQuery<Geofence[]>({
    queryKey: ['geofences', user?.tenant?.id],
    queryFn: async () => {
      if (!user) return []
      const { data } = await supabase
        .from('geofences')
        .select('*')
        .eq('tenant_id', user.tenant.id)
        .eq('is_active', true)
      return data ?? []
    },
    enabled: !!user,
  })

  // Set check-in type based on current state
  useEffect(() => {
    if (todayAttendance?.clock_in_at && !todayAttendance?.clock_out_at) {
      setCheckinType('out')
    } else {
      setCheckinType('in')
    }
  }, [todayAttendance])

  // Get GPS and validate against geofences
  const getGPS = useCallback(() => {
    setGpsLoading(true)
    setGpsError(null)

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.')
      setGpsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setGpsCoords(coords)
        setGpsLoading(false)

        // Validate against geofences
        if (geofences && geofences.length > 0) {
          let nearestGeofence: Geofence | null = null
          let nearestDistance = Infinity

          for (const gf of geofences) {
            const dist = haversineDistance(coords.lat, coords.lng, gf.lat, gf.lng)
            if (dist < nearestDistance) {
              nearestDistance = dist
              nearestGeofence = gf
            }
          }

          const isValid = nearestGeofence !== null && nearestDistance <= nearestGeofence.radius_m

          setGeofenceResult({
            valid: isValid,
            geofence: nearestGeofence,
            distance: Math.round(nearestDistance),
          })
        } else {
          // No geofences configured — allow clock-in from anywhere
          setGeofenceResult({ valid: true, geofence: null, distance: null })
        }
      },
      (err) => {
        setGpsLoading(false)
        if (err.code === 1) {
          setGpsError('Location permission denied. Please allow location access and try again.')
        } else if (err.code === 2) {
          setGpsError('Location unavailable. Check your GPS settings.')
        } else {
          setGpsError('Location request timed out. Please try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }, [geofences])

  // Capture selfie
  const captureSelfie = useCallback(() => {
    if (!webcamRef.current) return
    const imageSrc = webcamRef.current.getScreenshot()
    if (imageSrc) {
      setSelfieDataUrl(imageSrc)
      setStep('confirming')
    }
  }, [])

  // Retake photo
  const retakeSelfie = () => {
    setSelfieDataUrl(null)
    setStep('camera')
  }

  // Submit clock in/out
  const checkinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated')
      if (!selfieDataUrl) throw new Error('Selfie required')

      const now = new Date().toISOString()
      let selfieUrl: string | null = null

      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`
      }

      // Upload selfie via server API (if online)
      if (isOnline && selfieDataUrl) {
        const fileName = `${user.tenant.id}/${user.id}/${today}-${checkinType}-${Date.now()}.jpg`
        try {
          const selfieRes = await fetch('/api/attendance/selfie', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ selfieDataUrl, fileName }),
          })
          if (selfieRes.ok) {
            const { publicUrl } = await selfieRes.json()
            selfieUrl = publicUrl
          } else {
            console.warn('[Checkin] Selfie upload failed via API:', await selfieRes.text())
          }
        } catch (e) {
          console.warn('[Checkin] Selfie upload exception:', e)
        }
      }

      if (checkinType === 'in') {
        // Clock IN
        const payload = {
          tenant_id: user.tenant.id,
          employee_id: user.id,
          date: today,
          clock_in_at: now,
          status: 'PRESENT' as const,
          method: 'SELFIE_GPS' as const,
          clock_in_selfie_url: selfieUrl,
          clock_in_lat: gpsCoords?.lat ?? null,
          clock_in_lng: gpsCoords?.lng ?? null,
          geofence_id: geofenceResult?.geofence?.id ?? null,
          geofence_valid: geofenceResult?.valid ?? null,
        }

        if (!isOnline) {
          // Queue for sync when back online
          await addToOfflineQueue({
            id: crypto.randomUUID(),
            entityType: 'attendance',
            action: 'create',
            payload: { ...payload, clock_in_selfie_url: null },
          })
          return { offline: true }
        }

        const checkinRes = await fetch('/api/attendance/checkin', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ type: 'clock_in', payload }),
        })

        if (!checkinRes.ok) {
          const errData = await checkinRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to clock in')
        }

      } else {
        // Clock OUT
        if (!todayAttendance?.id) throw new Error('No clock-in record found')

        const clockInAt = todayAttendance.clock_in_at!
        const workMinutes = Math.round(
          (new Date(now).getTime() - new Date(clockInAt).getTime()) / (1000 * 60)
        )

        const payload = {
          clock_out_at: now,
          clock_out_selfie_url: selfieUrl,
          clock_out_lat: gpsCoords?.lat ?? null,
          clock_out_lng: gpsCoords?.lng ?? null,
          work_minutes: workMinutes,
          status: workMinutes < (8 * 60 * 0.5) ? 'HALF_DAY' as const : 'PRESENT' as const,
        }

        if (!isOnline) {
          await addToOfflineQueue({
            id: crypto.randomUUID(),
            entityType: 'attendance',
            action: 'update',
            payload: { ...payload, id: todayAttendance.id, clock_out_selfie_url: null },
          })
          return { offline: true }
        }

        const checkinRes = await fetch('/api/attendance/checkin', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ type: 'clock_out', recordId: todayAttendance.id, payload }),
        })

        if (!checkinRes.ok) {
          const errData = await checkinRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to clock out')
        }
      }

      return { offline: false }
    },

    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      setStep('success')
      if (result.offline) {
        toastSuccess(
          checkinType === 'in' ? 'Clock-in queued offline' : 'Clock-out queued offline',
          'Will sync automatically when you\'re back online'
        )
      } else {
        toastSuccess(
          checkinType === 'in' ? '✅ Clocked in!' : '✅ Clocked out!',
          checkinType === 'in'
            ? 'Have a great day!'
            : `You worked today — great job!`
        )
      }
    },

    onError: (error) => {
      setStep('error')
      toastError('Clock-in failed', error instanceof Error ? error.message : 'Please try again')
    },
  })

  // ---- Render: Already done today ----
  if (todayAttendance?.clock_out_at) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', padding: 'var(--space-10) var(--space-4)' }}>
        <div className="neu-empty-state">
          <div className="neu-empty-state-icon">
            <CheckCircle size={40} color="var(--success)" />
          </div>
          <h1 className="neu-empty-state-title">All done for today!</h1>
          <p className="neu-empty-state-body">
            You clocked in at {format(new Date(todayAttendance.clock_in_at!), 'h:mm a')} and
            clocked out at {format(new Date(todayAttendance.clock_out_at), 'h:mm a')}.
            <br />
            {todayAttendance.work_minutes && (
              <strong> Total: {Math.floor(todayAttendance.work_minutes / 60)}h {todayAttendance.work_minutes % 60}m worked.</strong>
            )}
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="neu-btn neu-btn--primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <button
          onClick={() => step === 'camera' || step === 'confirming' ? setStep('intro') : router.back()}
          className="neu-btn neu-btn--secondary neu-btn--icon"
          aria-label="Go back"
        >
          <X size={18} />
        </button>
        <h1 style={{ fontSize: '1.375rem' }}>
          {checkinType === 'in' ? 'Clock In' : 'Clock Out'}
        </h1>
      </div>

      {/* Offline Warning */}
      {!isOnline && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          background: 'var(--warning-light)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-4)',
          color: 'var(--warning)',
          fontSize: '0.9rem',
        }} role="alert">
          <WifiOff size={18} aria-hidden="true" />
          <span>Offline — your check-in will be queued and synced automatically.</span>
        </div>
      )}

      {/* Step: Intro */}
      {step === 'intro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="neu-card" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
            <div style={{
              width: 80, height: 80,
              background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
              borderRadius: '50%',
              boxShadow: 'var(--shadow-raised-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto var(--space-4)',
            }}>
              <Camera size={36} color="white" aria-hidden="true" />
            </div>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>
              {checkinType === 'in' ? 'Take a Selfie to Clock In' : 'Take a Selfie to Clock Out'}
            </h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
              We'll capture your selfie and GPS location as attendance verification.
              Your manager/HR can view this as visual confirmation.
            </p>
          </div>

          {/* GPS Status */}
          <div className="neu-card neu-card--sm">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <MapPin size={18} color="var(--accent)" aria-hidden="true" />
                <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                  Location
                </span>
              </div>
              {gpsCoords ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {geofenceResult?.valid
                    ? <CheckCircle size={16} color="var(--success)" aria-hidden="true" />
                    : <AlertCircle size={16} color="var(--warning)" aria-hidden="true" />
                  }
                  <span style={{
                    fontSize: '0.875rem',
                    color: geofenceResult?.valid ? 'var(--success)' : 'var(--warning)',
                    fontWeight: 600,
                  }}>
                    {geofenceResult?.valid
                      ? `In range${geofenceResult.geofence ? ` (${geofenceResult.geofence.name})` : ''}`
                      : `${geofenceResult?.distance}m away from nearest site`
                    }
                  </span>
                </div>
              ) : gpsLoading ? (
                <span style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>Getting location…</span>
              ) : gpsError ? (
                <button
                  onClick={getGPS}
                  className="neu-btn neu-btn--ghost neu-btn--sm"
                  style={{ color: 'var(--error)' }}
                >
                  Retry
                </button>
              ) : (
                <button onClick={getGPS} className="neu-btn neu-btn--secondary neu-btn--sm">
                  <MapPin size={14} aria-hidden="true" /> Get location
                </button>
              )}
            </div>
            {gpsError && (
              <p style={{ color: 'var(--error)', fontSize: '0.8125rem', marginTop: 8 }} role="alert">
                {gpsError}
              </p>
            )}
          </div>

          <button
            id="open-camera-btn"
            onClick={() => { getGPS(); setStep('camera') }}
            className="neu-btn neu-btn--primary neu-btn--lg"
            style={{ width: '100%' }}
            aria-label="Open camera to take selfie"
          >
            <Camera size={20} aria-hidden="true" />
            Open Camera
          </button>
        </div>
      )}

      {/* Step: Camera */}
      {step === 'camera' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-raised-lg)',
            position: 'relative',
            aspectRatio: '3/4',
            background: 'var(--neu-base-dark)',
          }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.85}
              videoConstraints={{
                facingMode: 'user',
                width: { ideal: 720 },
                height: { ideal: 960 },
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              aria-label="Camera preview for selfie capture"
            />

            {/* Face guide overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }} aria-hidden="true">
              <div className="scan-line" />
              <div style={{
                width: 200, height: 220,
                borderRadius: '50% 50% 45% 45%',
                border: '2px dashed rgba(255,255,255,0.6)',
              }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={() => setStep('intro')}
              className="neu-btn neu-btn--secondary"
              aria-label="Cancel and go back"
            >
              Cancel
            </button>
            <button
              id="capture-selfie-btn"
              onClick={captureSelfie}
              className="neu-btn neu-btn--primary"
              style={{ flex: 1 }}
              aria-label="Capture selfie photo"
            >
              <Camera size={18} aria-hidden="true" />
              Take Photo
            </button>
          </div>
        </div>
      )}

      {/* Step: Confirming */}
      {step === 'confirming' && selfieDataUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-raised-lg)',
            aspectRatio: '3/4',
            position: 'relative',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selfieDataUrl}
              alt="Your selfie preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>

          {/* GPS result */}
          {gpsCoords && (
            <div className="neu-card neu-card--sm" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}>
              <MapPin size={16} color="var(--accent)" aria-hidden="true" />
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {geofenceResult?.valid
                  ? `✅ Location verified${geofenceResult.geofence ? ` — ${geofenceResult.geofence.name}` : ''}`
                  : `⚠️ ${geofenceResult?.distance}m from nearest work site (out of range)`
                }
              </span>
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
            Look good? Confirm to {checkinType === 'in' ? 'clock in' : 'clock out'}.
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={retakeSelfie}
              className="neu-btn neu-btn--secondary"
              aria-label="Retake selfie photo"
            >
              <RefreshCw size={16} aria-hidden="true" /> Retake
            </button>
            <button
              id="confirm-checkin-btn"
              onClick={() => checkinMutation.mutate()}
              disabled={checkinMutation.isPending}
              className={`neu-btn neu-btn--primary ${checkinMutation.isPending ? 'neu-btn--loading' : ''}`}
              style={{ flex: 1 }}
              aria-label={`Confirm ${checkinType === 'in' ? 'clock in' : 'clock out'}`}
            >
              {!checkinMutation.isPending && <CheckCircle size={18} aria-hidden="true" />}
              {checkinMutation.isPending
                ? 'Submitting…'
                : checkinType === 'in' ? 'Confirm Clock In' : 'Confirm Clock Out'
              }
            </button>
          </div>
        </div>
      )}

      {/* Step: Success */}
      {step === 'success' && (
        <div className="neu-empty-state" style={{ padding: 'var(--space-10) 0' }}>
          <div
            className="neu-empty-state-icon"
            style={{ width: 100, height: 100, background: 'var(--success-light)' }}
            aria-hidden="true"
          >
            <CheckCircle size={52} color="var(--success)" />
          </div>
          <h2 className="neu-empty-state-title" style={{ color: 'var(--success)' }}>
            {checkinType === 'in' ? '🎉 Clocked In!' : '👋 Clocked Out!'}
          </h2>
          <p className="neu-empty-state-body">
            {checkinType === 'in'
              ? 'Your attendance has been recorded. Have a productive day!'
              : 'Great work today! See you tomorrow.'
            }
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="neu-btn neu-btn--primary"
            id="checkin-success-home"
          >
            Back to Dashboard
          </button>
        </div>
      )}

      {/* Step: Error */}
      {step === 'error' && (
        <div className="neu-empty-state" style={{ padding: 'var(--space-10) 0' }}>
          <div
            className="neu-empty-state-icon"
            style={{ background: 'var(--error-light)' }}
            aria-hidden="true"
          >
            <AlertCircle size={40} color="var(--error)" />
          </div>
          <h2 className="neu-empty-state-title">Something went wrong</h2>
          <p className="neu-empty-state-body">
            {checkinMutation.error instanceof Error
              ? checkinMutation.error.message
              : 'We couldn\'t record your attendance. Please try again.'
            }
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              onClick={() => setStep('intro')}
              className="neu-btn neu-btn--secondary"
            >
              Try Again
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="neu-btn neu-btn--ghost"
            >
              Go Back
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
