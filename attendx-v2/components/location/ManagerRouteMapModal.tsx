'use client'

import { useState, useEffect } from 'react'
import { X, MapPin, Navigation, Clock, ShieldCheck, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface Waypoint {
  gps_log_id: string
  id: string
  tenant_id: string
  employee_id: string
  latitude: number
  longitude: number
  lat: number
  lng: number
  speed: number
  timestamp: string
}

interface ManagerRouteMapModalProps {
  employeeId: string | null
  employeeName: string
  isOpen: boolean
  onClose: () => void
}

export function ManagerRouteMapModal({
  employeeId,
  employeeName,
  isOpen,
  onClose,
}: ManagerRouteMapModalProps) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waypoints, setWaypoints] = useState<Waypoint[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen || !employeeId) {
      setWaypoints([])
      setError(null)
      return
    }

    let isSubscribed = true
    setLoading(true)
    setError(null)

    fetch(`/api/location/track?employee_id=${employeeId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json.error || `HTTP ${res.status}`)
        }
        return json
      })
      .then((json) => {
        if (isSubscribed) {
          setWaypoints(json.waypoints || [])
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isSubscribed) {
          setError(err.message || 'Failed to fetch GPS tracking breadcrumbs')
          setLoading(false)
        }
      })

    return () => {
      isSubscribed = false
    }
  }, [isOpen, employeeId])

  if (!mounted || !isOpen) return null

  // Compute SVG mapping for waypoints
  const svgWidth = 560
  const svgHeight = 280
  const pad = 40

  let polylinePoints = ''
  let mappedPoints: Array<{ x: number; y: number; wp: Waypoint; index: number }> = []

  if (waypoints.length > 0) {
    const lats = waypoints.map((w) => w.latitude ?? w.lat)
    const lngs = waypoints.map((w) => w.longitude ?? w.lng)

    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const latSpan = maxLat - minLat || 0.0001
    const lngSpan = maxLng - minLng || 0.0001

    mappedPoints = waypoints.map((wp, index) => {
      const lat = wp.latitude ?? wp.lat
      const lng = wp.longitude ?? wp.lng
      const x = pad + ((lng - minLng) / lngSpan) * (svgWidth - pad * 2)
      // Invert Y because latitude goes down in screen coords
      const y = pad + ((maxLat - lat) / latSpan) * (svgHeight - pad * 2)
      return { x, y, wp, index }
    })

    polylinePoints = mappedPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 15, 30, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 680,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 'var(--space-6)',
          backgroundColor: 'var(--bg-card, #121827)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.1))',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent, #6366f1)',
              }}
            >
              <Navigation size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
                Route Telemetry
              </h2>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-tertiary, #9ca3af)',
                  margin: 0,
                }}
              >
                Sequential GPS breadcrumbs for {employeeName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: 6, borderRadius: '50%' }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <div className="skeleton" style={{ height: 260, borderRadius: 8, marginBottom: 16 }} />
            <p style={{ fontSize: '0.875rem' }}>Loading authoritative GPS breadcrumbs from gps_tracking...</p>
          </div>
        ) : error ? (
          <div
            style={{
              padding: 'var(--space-4)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              color: '#ef4444',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Telemetry Retrieval Notice</div>
              <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>{error}</div>
            </div>
          </div>
        ) : waypoints.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-8)',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              margin: '16px 0',
            }}
          >
            <MapPin size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No GPS Telemetry Found</div>
            <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>
              No route breadcrumbs have been recorded for this employee in the current session.
            </div>
          </div>
        ) : (
          <div>
            {/* Telemetry Summary Stats */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Total Waypoints</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {waypoints.length}
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Route Start (T₁)</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {format(parseISO(waypoints[0].timestamp), 'h:mm:ss a')}
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Latest Ping (Tₙ)</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                  {format(parseISO(waypoints[waypoints.length - 1].timestamp), 'h:mm:ss a')}
                </div>
              </div>
            </div>

            {/* Native SVG Map Visualization */}
            <div
              style={{
                width: '100%',
                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                borderRadius: 8,
                border: '1px solid var(--border)',
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  CHRONOLOGICAL PATH VISUALIZATION
                </span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--accent, #6366f1)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    padding: '2px 8px',
                    borderRadius: 9999,
                  }}
                >
                  Sequential T₁ → Tₙ
                </span>
              </div>

              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
              >
                {/* Background Grid Lines */}
                <line x1="20" y1="70" x2={svgWidth - 20} y2="70" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="20" y1="140" x2={svgWidth - 20} y2="140" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <line x1="20" y1="210" x2={svgWidth - 20} y2="210" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />

                {/* Connecting Polyline Route */}
                {polylinePoints && (
                  <polyline
                    fill="none"
                    stroke="var(--accent, #6366f1)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={polylinePoints}
                  />
                )}

                {/* Waypoint Markers */}
                {mappedPoints.map((pt) => {
                  const isFirst = pt.index === 0
                  const isLast = pt.index === mappedPoints.length - 1

                  let markerColor = 'var(--accent, #6366f1)'
                  if (isFirst) markerColor = '#10b981' // Green start
                  if (isLast) markerColor = '#3b82f6' // Blue latest

                  return (
                    <g key={pt.wp.gps_log_id || pt.index}>
                      {/* Pulse ring for latest point */}
                      {isLast && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="12"
                          fill="none"
                          stroke={markerColor}
                          strokeWidth="1.5"
                          opacity="0.4"
                        />
                      )}
                      <circle cx={pt.x} cy={pt.y} r="6" fill={markerColor} stroke="#ffffff" strokeWidth="1.5" />
                      <text
                        x={pt.x}
                        y={pt.y - 10}
                        textAnchor="middle"
                        fill="#e5e7eb"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        T{pt.index + 1}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* Chronological Breadcrumbs Table */}
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '6px 8px' }}>#</th>
                    <th style={{ padding: '6px 8px' }}>Time</th>
                    <th style={{ padding: '6px 8px' }}>Coordinates</th>
                    <th style={{ padding: '6px 8px' }}>Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {waypoints.map((wp, idx) => (
                    <tr
                      key={wp.gps_log_id || idx}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        T{idx + 1}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {format(parseISO(wp.timestamp), 'HH:mm:ss')}
                      </td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                        {(wp.latitude ?? wp.lat).toFixed(5)}, {(wp.longitude ?? wp.lng).toFixed(5)}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        {(wp.speed ?? 0).toFixed(1)} km/h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 'var(--space-4)',
            paddingTop: 'var(--space-3)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
            <ShieldCheck size={14} color="var(--success, #10b981)" /> Authoritative Store: <code>public.gps_tracking</code>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
