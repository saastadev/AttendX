// ============================================================
// AttendX v2 — Geolocation & GPS Security Utilities
// Provides Haversine distance, coordinate bounds validation,
// stale location detection, and mock location fraud detection.
// ============================================================

/**
 * Calculates great-circle distance between two points on a sphere (in meters)
 * using the Haversine formula.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Validates presence, type, and geographic bounds of GPS coordinates.
 * Valid ranges: -90 <= lat <= 90, -180 <= lng <= 180.
 */
export function validateCoordinates(
  lat: any,
  lng: any
): { valid: boolean; error?: string; lat?: number; lng?: number } {
  if (
    lat === undefined ||
    lat === null ||
    lat === '' ||
    lng === undefined ||
    lng === null ||
    lng === ''
  ) {
    return {
      valid: false,
      error: 'Missing GPS coordinates: latitude and longitude are required',
    }
  }

  // Reject booleans or other non-numeric types
  if (typeof lat === 'boolean' || typeof lng === 'boolean') {
    return {
      valid: false,
      error: 'Invalid GPS coordinates format: coordinates must be numeric',
    }
  }

  const numLat = Number(lat)
  const numLng = Number(lng)

  if (Number.isNaN(numLat) || Number.isNaN(numLng)) {
    return {
      valid: false,
      error: 'Invalid GPS coordinates format: coordinates must be numeric',
    }
  }

  if (numLat < -90 || numLat > 90 || numLng < -180 || numLng > 180) {
    return {
      valid: false,
      error: 'GPS coordinates out of valid range (-90 to 90 lat, -180 to 180 lng)',
    }
  }

  return { valid: true, lat: numLat, lng: numLng }
}

/**
 * Validates freshness of a client location timestamp against server time.
 * If provided, rejects timestamps older than maxAgeMs (default 60,000ms / 1 min).
 */
export function validateLocationFreshness(
  timestamp: any,
  maxAgeMs = 60000
): { valid: boolean; error?: string } {
  if (timestamp === undefined || timestamp === null || timestamp === '') {
    return { valid: true }
  }

  const clientTime = new Date(timestamp).getTime()
  if (Number.isNaN(clientTime)) {
    return { valid: false, error: 'Invalid location timestamp format' }
  }

  const diffMs = Math.abs(Date.now() - clientTime)
  if (diffMs > maxAgeMs) {
    return {
      valid: false,
      error: `Stale location data: timestamp exceeds allowable freshness window (${Math.round(
        maxAgeMs / 1000
      )}s)`,
    }
  }

  return { valid: true }
}

/**
 * Checks whether the incoming request or payload contains mock location flags.
 */
export function isMockLocation(payload: any, body?: any): boolean {
  return (
    payload?.isMockLocation === true ||
    payload?.is_mock_location === true ||
    payload?.mocked === true ||
    payload?.is_mock === true ||
    body?.isMockLocation === true ||
    body?.is_mock_location === true ||
    body?.mocked === true ||
    body?.is_mock === true
  )
}
