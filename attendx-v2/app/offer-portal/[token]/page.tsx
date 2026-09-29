'use client'

import { useState, use } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CheckCircle2, XCircle, FileText, Building2, MapPin,
  Calendar, Award, Shield, AlertCircle, Upload, Check,
  Download, ExternalLink
} from 'lucide-react'

export default function CandidateOfferPortalPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const resolvedParams = use(params)
  const token = resolvedParams.token

  const [eAckName, setEAckName] = useState('')
  const [eAckConfirmed, setEAckConfirmed] = useState(false)
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [completedDecision, setCompletedDecision] = useState<'ACCEPT' | 'DECLINE' | null>(null)

  // Document upload state
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, string>>({})
  const [docUploadUrl, setDocUploadUrl] = useState('')
  const [selectedDocType, setSelectedDocType] = useState('ID_PROOF')

  // Validate Token Query
  const { data, isLoading, error } = useQuery({
    queryKey: ['offer-portal-token', token],
    queryFn: async () => {
      const res = await fetch(`/api/hiring/offer-portal/${token}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load offer')
      }
      return res.json()
    },
    retry: false,
  })

  // Submit Decision Mutation
  const responseMutation = useMutation({
    mutationFn: async ({ decision, reason }: { decision: 'ACCEPT' | 'DECLINE'; reason?: string }) => {
      const res = await fetch(`/api/hiring/offer-portal/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          decline_reason: reason,
          e_ack_name: eAckName,
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Submission failed')
      }
      return res.json()
    },
    onSuccess: (result, vars) => {
      setCompletedDecision(vars.decision)
    }
  })

  // Submit Document Mutation
  const submitDocMutation = useMutation({
    mutationFn: async ({ docType, docName, fileUrl }: { docType: string; docName: string; fileUrl: string }) => {
      const res = await fetch('/api/hiring/onboarding/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_id: data?.onboarding_id || data?.offer?.id,
          document_type: docType,
          document_name: docName,
          file_url: fileUrl,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload submission failed')
      }
      return res.json()
    },
    onSuccess: (res, vars) => {
      setUploadedDocs(prev => ({ ...prev, [vars.docType]: vars.fileUrl }))
      setDocUploadUrl('')
    }
  })

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8EBF2',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center', color: '#4A5272' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>Verifying Secure Token…</div>
          <div style={{ fontSize: '0.85rem' }}>Loading candidate offer details securely</div>
        </div>
      </div>
    )
  }

  if (error || !data?.valid) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8EBF2',
        padding: 20,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: '#F2F4F9',
          padding: 32,
          borderRadius: 20,
          boxShadow: '8px 8px 20px #C2C6D6, -8px -8px 20px #FFFFFF',
          textAlign: 'center',
        }}>
          <AlertCircle size={48} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>
            Invalid or Expired Offer Link
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#4A5272', lineHeight: 1.5 }}>
            {(error as any)?.message || 'This offer portal link has expired or has already been used. Please contact the talent acquisition team for assistance.'}
          </p>
        </div>
      </div>
    )
  }

  const { offer, candidate, requisition } = data

  if (completedDecision === 'ACCEPT') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8EBF2',
        padding: 20,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          maxWidth: 540,
          width: '100%',
          background: '#F2F4F9',
          padding: 36,
          borderRadius: 24,
          boxShadow: '12px 12px 30px #C2C6D6, -12px -12px 30px #FFFFFF',
          textAlign: 'center',
        }}>
          <CheckCircle2 size={56} color="#10B981" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>
            Offer Accepted! Welcome to the Team
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#4A5272', lineHeight: 1.6, marginBottom: 24 }}>
            Congratulations <b>{candidate.full_name}</b>! Your formal acceptance has been digitally verified and registered in the AttendX system.
          </p>

          <div style={{
            background: '#E8EBF2',
            padding: 20,
            borderRadius: 16,
            textAlign: 'left',
            fontSize: '0.85rem',
            color: '#1A1D2E',
            lineHeight: 1.6,
          }}>
            <div>• <b>Position:</b> {offer.designation}</div>
            <div>• <b>Joining Date:</b> {offer.joining_date}</div>
            <div>• <b>Electronic Acknowledgment:</b> {eAckName || candidate.full_name}</div>
            <div>• <b>Timestamp:</b> {new Date().toLocaleString()}</div>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#8890B0', marginTop: 24 }}>
            Your onboarding checklist and IT credentials setup are now in progress. You will receive an orientation schedule via email shortly.
          </p>
        </div>
      </div>
    )
  }

  if (completedDecision === 'DECLINE') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8EBF2',
        padding: 20,
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: '#F2F4F9',
          padding: 36,
          borderRadius: 24,
          boxShadow: '12px 12px 30px #C2C6D6, -12px -12px 30px #FFFFFF',
          textAlign: 'center',
        }}>
          <XCircle size={56} color="#EF4444" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A1D2E', marginBottom: 8 }}>
            Offer Declined
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#4A5272', lineHeight: 1.5 }}>
            Thank you for letting us know, {candidate.full_name}. We appreciate your time and wish you the best in your career endeavors.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8EBF2',
      padding: '40px 20px',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        {/* Header Branding */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#4F46E5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: '1.2rem',
            }}>
              A
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#1A1D2E' }}>AttendX</div>
              <div style={{ fontSize: '0.75rem', color: '#8890B0' }}>Candidate Career Portal</div>
            </div>
          </div>

          <div style={{
            background: 'rgba(79, 70, 229, 0.1)',
            color: '#4F46E5',
            padding: '6px 14px',
            borderRadius: 14,
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Shield size={14} /> 256-Bit Encrypted Link
          </div>
        </div>

        {/* Offer Summary Card */}
        <div style={{
          background: '#F2F4F9',
          borderRadius: 24,
          padding: 32,
          boxShadow: '8px 8px 20px #C2C6D6, -8px -8px 20px #FFFFFF',
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid rgba(128,128,180,0.15)', paddingBottom: 24, marginBottom: 24 }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Employment Offer Letter
              </span>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1A1D2E', marginTop: 4 }}>
                {offer.designation}
              </h1>
              <div style={{ fontSize: '0.9rem', color: '#4A5272', marginTop: 4 }}>
                Extended to: <b>{candidate.full_name}</b> ({candidate.email})
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#8890B0' }}>Offer Reference</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1A1D2E' }}>{offer.offer_number}</div>
            </div>
          </div>

          {/* Key Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 28,
          }}>
            <div style={{ background: '#E8EBF2', padding: 16, borderRadius: 14 }}>
              <div style={{ fontSize: '0.75rem', color: '#8890B0', marginBottom: 4 }}>Total CTC (Annual)</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4F46E5' }}>
                ₹{Number(offer.total_ctc).toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ background: '#E8EBF2', padding: 16, borderRadius: 14 }}>
              <div style={{ fontSize: '0.75rem', color: '#8890B0', marginBottom: 4 }}>Joining Date</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A1D2E' }}>
                {offer.joining_date}
              </div>
            </div>

            <div style={{ background: '#E8EBF2', padding: 16, borderRadius: 14 }}>
              <div style={{ fontSize: '0.75rem', color: '#8890B0', marginBottom: 4 }}>Work Mode & Location</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1A1D2E' }}>
                {offer.work_mode} ({offer.work_location})
              </div>
            </div>
          </div>

          {/* Compensation Breakdown */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A1D2E', marginBottom: 12 }}>
              Compensation Breakdown
            </h3>
            <div style={{ background: '#E8EBF2', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(128,128,180,0.1)' }}>
                <span style={{ fontSize: '0.875rem', color: '#4A5272' }}>Fixed Annual Salary:</span>
                <b style={{ fontSize: '0.875rem', color: '#1A1D2E' }}>₹{Number(offer.fixed_salary).toLocaleString('en-IN')}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(128,128,180,0.1)' }}>
                <span style={{ fontSize: '0.875rem', color: '#4A5272' }}>Performance Variable:</span>
                <b style={{ fontSize: '0.875rem', color: '#1A1D2E' }}>₹{Number(offer.variable_salary || 0).toLocaleString('en-IN')}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ fontSize: '0.875rem', color: '#4A5272' }}>Joining / Retention Bonus:</span>
                <b style={{ fontSize: '0.875rem', color: '#1A1D2E' }}>₹{Number(offer.bonus || 0).toLocaleString('en-IN')}</b>
              </div>
            </div>
          </div>

          {/* Terms */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A1D2E', marginBottom: 8 }}>
              Terms & Conditions
            </h3>
            <div style={{
              background: '#E8EBF2',
              padding: 16,
              borderRadius: 14,
              fontSize: '0.85rem',
              color: '#4A5272',
              lineHeight: 1.6,
            }}>
              {offer.terms_and_conditions || 'Standard employment policies of AttendX apply. This offer is contingent upon successful verification of identity and academic credentials.'}
            </div>
          </div>

          {/* Electronic Acknowledgment Section */}
          <div style={{
            background: 'rgba(79, 70, 229, 0.05)',
            border: '1px solid rgba(79, 70, 229, 0.25)',
            borderRadius: 16,
            padding: 24,
            marginBottom: 28,
          }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1A1D2E', marginBottom: 12 }}>
              Electronic Acknowledgment & Signature
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#4A5272', marginBottom: 16, lineHeight: 1.5 }}>
              By entering your full name and clicking "Accept Offer", you electronically sign this agreement and confirm your commitment to join AttendX on {offer.joining_date}.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4A5272', display: 'block', marginBottom: 6 }}>
                Full Legal Name (Electronic Signature)
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={eAckName}
                onChange={(e) => setEAckName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(128,128,180,0.3)',
                  background: '#FFFFFF',
                  fontSize: '0.95rem',
                  color: '#1A1D2E',
                  outline: 'none',
                }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.85rem', color: '#1A1D2E' }}>
              <input
                type="checkbox"
                checked={eAckConfirmed}
                onChange={(e) => setEAckConfirmed(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: '#4F46E5' }}
              />
              <span>I have read, understood, and accept all the terms of this offer.</span>
            </label>
          </div>

          {/* Decision Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
            <button
              onClick={() => setShowDeclineModal(true)}
              style={{
                background: 'transparent',
                color: '#EF4444',
                border: '1px solid #EF4444',
                borderRadius: 12,
                padding: '12px 24px',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Decline Offer
            </button>

            <button
              onClick={() => responseMutation.mutate({ decision: 'ACCEPT' })}
              disabled={!eAckName.trim() || !eAckConfirmed || responseMutation.isPending}
              style={{
                background: (!eAckName.trim() || !eAckConfirmed || responseMutation.isPending) ? '#C2C6D6' : '#10B981',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 12,
                padding: '12px 32px',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: (!eAckName.trim() || !eAckConfirmed) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Check size={18} /> {responseMutation.isPending ? 'Processing…' : 'Accept Offer'}
            </button>
          </div>
        </div>

        {/* Decline Modal */}
        {showDeclineModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}>
            <div style={{
              background: '#F2F4F9',
              borderRadius: 20,
              padding: 28,
              maxWidth: 440,
              width: '100%',
              boxShadow: '12px 12px 30px #C2C6D6',
            }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A1D2E', marginBottom: 12 }}>
                Confirm Decline
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#4A5272', marginBottom: 14 }}>
                Please provide a brief reason to help us improve our offer and hiring process:
              </p>
              <textarea
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g. Accepted another offer, compensation mismatch, location preference…"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(128,128,180,0.3)',
                  marginBottom: 16,
                  outline: 'none',
                  fontSize: '0.85rem',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setShowDeclineModal(false)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => responseMutation.mutate({ decision: 'DECLINE', reason: declineReason })}
                  disabled={responseMutation.isPending}
                  style={{
                    background: '#EF4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 18px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Confirm Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
