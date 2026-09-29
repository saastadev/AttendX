'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileCheck, UserPlus, CheckCircle2, AlertCircle, XCircle,
  Clock, Shield, Send, ExternalLink, UserCheck, X,
  Building2, Briefcase, FileText, Check, Sparkles
} from 'lucide-react'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { useToast } from '@/components/ui/Toast'

export default function OnboardPage() {
  const { success, error: toastError } = useToast()
  const qc = useQueryClient()

  // Selected candidate / onboarding process
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [targetCandidateForOffer, setTargetCandidateForOffer] = useState<any | null>(null)
  const [generatedPortalLink, setGeneratedPortalLink] = useState<string | null>(null)

  // Offer Creation Form State
  const [offerForm, setOfferForm] = useState({
    designation: '',
    fixed_salary: 1500000,
    variable_salary: 300000,
    bonus: 200000,
    work_location: 'Bangalore Hub',
    work_mode: 'HYBRID',
    joining_date: '2026-10-15',
    probation_months: 3,
  })

  // Convert to employee form state
  const [convertForm, setConvertForm] = useState({
    work_email: '',
    role: 'EMPLOYEE',
  })
  const [showConvertModal, setShowConvertModal] = useState(false)

  // Fetch onboarding processes
  const { data: onboardData, isLoading } = useQuery({
    queryKey: ['hiring-onboarding-list'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/onboarding')
      if (!res.ok) return { processes: [] }
      return res.json()
    }
  })

  // Fetch candidates in SELECTED stage ready for offer
  const { data: selectedAppsData } = useQuery({
    queryKey: ['hiring-selected-applications'],
    queryFn: async () => {
      const res = await fetch('/api/hiring/applications?stage=SELECTED')
      if (!res.ok) return { applications: [] }
      return res.json()
    }
  })

  const processes = onboardData?.processes || []
  const selectedApps = selectedAppsData?.applications || []

  // Active onboarding details query
  const activeProcess = processes.find((p: any) => p.id === selectedProcessId) || processes[0]

  const { data: singleProcessData } = useQuery({
    queryKey: ['hiring-single-onboarding', activeProcess?.id],
    queryFn: async () => {
      if (!activeProcess?.id) return null
      const res = await fetch(`/api/hiring/onboarding/${activeProcess.id}`)
      if (!res.ok) return null
      const json = await res.json()
      return json.process
    },
    enabled: !!activeProcess?.id,
  })

  const detailedProcess = singleProcessData || activeProcess

  // Create & Release Offer Mutation
  const releaseOfferMutation = useMutation({
    mutationFn: async () => {
      if (!targetCandidateForOffer) throw new Error('No candidate selected for offer')

      // 1. Create Offer
      const createRes = await fetch('/api/hiring/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: targetCandidateForOffer.id,
          candidate_id: targetCandidateForOffer.candidate.id,
          designation: offerForm.designation || targetCandidateForOffer.requisition?.title,
          fixed_salary: Number(offerForm.fixed_salary),
          variable_salary: Number(offerForm.variable_salary),
          bonus: Number(offerForm.bonus),
          work_location: offerForm.work_location,
          work_mode: offerForm.work_mode,
          joining_date: offerForm.joining_date,
          probation_months: Number(offerForm.probation_months),
        })
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(err.error || 'Failed to create offer')
      }

      const { offer } = await createRes.json()

      // 2. Release Offer (Generates single-use 7-day portal link)
      const releaseRes = await fetch(`/api/hiring/offers/${offer.id}/release`, {
        method: 'POST',
      })

      if (!releaseRes.ok) {
        const err = await releaseRes.json()
        throw new Error(err.error || 'Failed to release offer')
      }

      return releaseRes.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['hiring-onboarding-list'] })
      qc.invalidateQueries({ queryKey: ['hiring-selected-applications'] })
      setGeneratedPortalLink(data.portalUrl)
      success(`Offer released successfully! Candidate portal link generated.`)
    },
    onError: (err: any) => {
      toastError(err.message || 'Offer release failed')
    }
  })

  // Verify Document Mutation
  const verifyDocMutation = useMutation({
    mutationFn: async ({ docId, decision }: { docId: string; decision: 'VERIFY' | 'REJECT' }) => {
      const res = await fetch('/api/hiring/onboarding/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: docId,
          decision,
          comment: decision === 'VERIFY' ? 'Document verified and approved' : 'Rejected - please re-upload clear copy',
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to verify document')
      }
      return res.json()
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['hiring-single-onboarding'] })
      qc.invalidateQueries({ queryKey: ['hiring-onboarding-list'] })
      success(vars.decision === 'VERIFY' ? 'Document verified!' : 'Document rejected, candidate requested to re-upload.')
    },
    onError: (err: any) => {
      toastError(err.message || 'Document verification failed')
    }
  })

  // Update Task Mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await fetch('/api/hiring/onboarding/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update task')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-single-onboarding'] })
      qc.invalidateQueries({ queryKey: ['hiring-onboarding-list'] })
      success('Onboarding checklist task updated!')
    },
    onError: (err: any) => {
      toastError(err.message || 'Task update failed')
    }
  })

  // Convert to Employee Mutation
  const convertEmployeeMutation = useMutation({
    mutationFn: async () => {
      if (!detailedProcess) throw new Error('No active process')
      const res = await fetch('/api/hiring/onboarding/convert-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboarding_id: detailedProcess.id,
          work_email: convertForm.work_email || detailedProcess.candidate?.email,
          role: convertForm.role,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Conversion failed')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-single-onboarding'] })
      qc.invalidateQueries({ queryKey: ['hiring-onboarding-list'] })
      setShowConvertModal(false)
      success('🎉 Candidate successfully converted to active employee in AttendX!')
    },
    onError: (err: any) => {
      toastError(err.message || 'Conversion failed')
    }
  })

  const totalCtcCalc = Number(offerForm.fixed_salary) + Number(offerForm.variable_salary) + Number(offerForm.bonus)

  return (
    <PageWrapper style={{ maxWidth: 1300, margin: '0 auto', paddingBottom: 64 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 800 }}>Automated Onboarding & Digital Offers</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
            Extend formal employment offers with single-use 7-day candidate links, verify credentials, and convert to active employees.
          </p>
        </div>
      </div>

      {/* Selected Candidates Waiting For Offer Banner */}
      {selectedApps.length > 0 && (
        <div className="card" style={{
          padding: 20,
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
          border: '1px solid rgba(79, 70, 229, 0.25)',
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="var(--accent)" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {selectedApps.length} Candidate{selectedApps.length > 1 ? 's' : ''} Ready for Offer Release
              </h3>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Interview evaluations completed</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {selectedApps.map((app: any) => (
              <div
                key={app.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'var(--neu-base)',
                  padding: '10px 16px',
                  borderRadius: 12,
                  boxShadow: 'var(--elev-1)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {app.candidate?.full_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {app.requisition?.title}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTargetCandidateForOffer(app)
                    setOfferForm(prev => ({
                      ...prev,
                      designation: app.requisition?.title || '',
                    }))
                    setGeneratedPortalLink(null)
                    setShowOfferModal(true)
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Send size={13} /> Release Offer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Onboarding List & Detail */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24 }}>
        {/* Onboarding Processes Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Active Onboarding ({processes.length})
          </h3>

          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading onboarding list…</div>
          ) : processes.length === 0 ? (
            <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-tertiary)', borderRadius: 16 }}>
              No candidates currently in onboarding. Release an offer above to begin.
            </div>
          ) : (
            processes.map((proc: any) => {
              const isSelected = (detailedProcess?.id === proc.id)
              return (
                <div
                  key={proc.id}
                  onClick={() => setSelectedProcessId(proc.id)}
                  className="card card-hover"
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    background: isSelected ? 'var(--neu-bg-raised)' : 'var(--neu-base)',
                    boxShadow: 'var(--elev-1)',
                    cursor: 'pointer',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.4)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {proc.candidate?.full_name}
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: proc.status === 'COMPLETED'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(79, 70, 229, 0.12)',
                      color: proc.status === 'COMPLETED' ? '#059669' : 'var(--accent)',
                    }}>
                      {proc.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                    Offer: <b>{proc.offer?.designation || 'Software Engineer'}</b> ({proc.offer?.offer_number})
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Completion</span>
                      <b style={{ color: 'var(--accent)' }}>{Math.round(proc.completion_percentage)}%</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--neu-bg-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${proc.completion_percentage}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Selected Onboarding Detail */}
        {detailedProcess ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Header info card */}
            <div className="card" style={{
              padding: 24,
              borderRadius: 18,
              background: 'var(--neu-base)',
              boxShadow: 'var(--elev-1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {detailedProcess.candidate?.full_name}
                    </h2>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 10,
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#059669',
                    }}>
                      {detailedProcess.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                    Email: {detailedProcess.candidate?.email} • Joining Date: <b>{detailedProcess.offer?.joining_date || 'TBD'}</b>
                  </div>
                </div>

                {/* Convert to Employee Button */}
                <div>
                  {detailedProcess.status === 'COMPLETED' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, fontSize: '0.875rem' }}>
                      <CheckCircle2 size={18} /> Active Employee
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setConvertForm({
                          work_email: detailedProcess.candidate?.email || '',
                          role: 'EMPLOYEE',
                        })
                        setShowConvertModal(true)
                      }}
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}
                    >
                      <UserCheck size={16} /> Convert to Employee
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Documents Verification Section */}
            <div className="card" style={{
              padding: 24,
              borderRadius: 18,
              background: 'var(--neu-base)',
              boxShadow: 'var(--elev-1)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Required Onboarding Documents
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Verify candidate submitted documents or request re-upload
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(detailedProcess.documents || []).length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                    No document requirements attached yet.
                  </div>
                ) : (
                  detailedProcess.documents.map((doc: any) => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 18px',
                        borderRadius: 12,
                        background: 'var(--neu-bg-raised)',
                        boxShadow: 'var(--elev-0)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                          {doc.document_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          Type: {doc.document_type} • Status: <b style={{
                            color: doc.status === 'VERIFIED' ? '#059669' : doc.status === 'SUBMITTED' ? '#0891B2' : 'var(--text-tertiary)'
                          }}>{doc.status}</b>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {doc.file_url && (
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: 'var(--neu-bg-deep)',
                              padding: '6px 10px',
                              borderRadius: 8,
                              color: 'var(--text-primary)',
                              fontSize: '0.75rem',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <FileText size={13} /> View File
                          </a>
                        )}

                        {doc.status !== 'VERIFIED' && (
                          <>
                            <button
                              onClick={() => verifyDocMutation.mutate({ docId: doc.id, decision: 'VERIFY' })}
                              disabled={verifyDocMutation.isPending}
                              style={{
                                background: '#10B981',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <Check size={13} /> Verify
                            </button>
                            <button
                              onClick={() => verifyDocMutation.mutate({ docId: doc.id, decision: 'REJECT' })}
                              disabled={verifyDocMutation.isPending}
                              style={{
                                background: 'transparent',
                                color: '#DC2626',
                                border: '1px solid #DC2626',
                                borderRadius: 8,
                                padding: '5px 10px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {doc.status === 'VERIFIED' && (
                          <span style={{ color: '#059669', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={16} /> Verified
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Checklist Tasks Section */}
            <div className="card" style={{
              padding: 24,
              borderRadius: 18,
              background: 'var(--neu-base)',
              boxShadow: 'var(--elev-1)',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Departmental Onboarding Checklist
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(detailedProcess.tasks || []).map((t: any) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: 'var(--neu-bg-raised)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={t.status === 'COMPLETED'}
                        onChange={(e) => updateTaskMutation.mutate({
                          taskId: t.id,
                          status: e.target.checked ? 'COMPLETED' : 'PENDING'
                        })}
                        style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
                      />
                      <div>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          textDecoration: t.status === 'COMPLETED' ? 'line-through' : 'none'
                        }}>
                          {t.task_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          [{t.category}] {t.description}
                        </div>
                      </div>
                    </div>

                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 8,
                      background: t.status === 'COMPLETED' ? 'rgba(16, 185, 129, 0.15)' : 'var(--neu-bg-deep)',
                      color: t.status === 'COMPLETED' ? '#059669' : 'var(--text-tertiary)',
                    }}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Release Offer Modal */}
      {showOfferModal && targetCandidateForOffer && (
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
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 580,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-4)',
            borderRadius: 20,
            padding: 28,
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Release Official Job Offer
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Candidate: <b>{targetCandidateForOffer.candidate?.full_name}</b>
                </p>
              </div>
              <button
                onClick={() => setShowOfferModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {generatedPortalLink ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <CheckCircle2 size={48} color="#10B981" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Offer Extended & Candidate Notified!
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 6, marginBottom: 20 }}>
                  A single-use 7-day secure token has been generated and emailed to the candidate.
                </p>
                <div style={{
                  background: 'var(--neu-bg-deep)',
                  padding: '12px 16px',
                  borderRadius: 12,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--accent)',
                  wordBreak: 'break-all',
                  marginBottom: 20,
                }}>
                  {generatedPortalLink}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <a
                    href={generatedPortalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
                  >
                    Open Candidate Portal <ExternalLink size={14} />
                  </a>
                  <button
                    onClick={() => setShowOfferModal(false)}
                    className="btn btn-secondary"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    Designation
                  </label>
                  <input
                    type="text"
                    value={offerForm.designation}
                    onChange={(e) => setOfferForm({ ...offerForm, designation: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(128,128,180,0.2)',
                      background: 'var(--neu-bg-raised)',
                      fontSize: '0.875rem',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Fixed Salary (₹)
                    </label>
                    <input
                      type="number"
                      value={offerForm.fixed_salary}
                      onChange={(e) => setOfferForm({ ...offerForm, fixed_salary: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 10,
                        border: '1px solid rgba(128,128,180,0.2)',
                        background: 'var(--neu-bg-raised)',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Variable (₹)
                    </label>
                    <input
                      type="number"
                      value={offerForm.variable_salary}
                      onChange={(e) => setOfferForm({ ...offerForm, variable_salary: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 10,
                        border: '1px solid rgba(128,128,180,0.2)',
                        background: 'var(--neu-bg-raised)',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Joining Bonus (₹)
                    </label>
                    <input
                      type="number"
                      value={offerForm.bonus}
                      onChange={(e) => setOfferForm({ ...offerForm, bonus: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '9px 10px',
                        borderRadius: 10,
                        border: '1px solid rgba(128,128,180,0.2)',
                        background: 'var(--neu-bg-raised)',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                </div>

                <div style={{
                  background: 'var(--neu-bg-deep)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Calculated Total CTC:</span>
                  <b style={{ fontSize: '1.05rem', color: 'var(--accent)' }}>₹{totalCtcCalc.toLocaleString('en-IN')}</b>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Joining Date
                    </label>
                    <input
                      type="date"
                      value={offerForm.joining_date}
                      onChange={(e) => setOfferForm({ ...offerForm, joining_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(128,128,180,0.2)',
                        background: 'var(--neu-bg-raised)',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      Work Mode
                    </label>
                    <select
                      value={offerForm.work_mode}
                      onChange={(e) => setOfferForm({ ...offerForm, work_mode: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid rgba(128,128,180,0.2)',
                        background: 'var(--neu-bg-raised)',
                        fontSize: '0.875rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <option value="HYBRID">Hybrid</option>
                      <option value="REMOTE">Remote</option>
                      <option value="ONSITE">On-Site</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <button
                    onClick={() => setShowOfferModal(false)}
                    className="btn btn-secondary"
                    disabled={releaseOfferMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => releaseOfferMutation.mutate()}
                    disabled={releaseOfferMutation.isPending}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {releaseOfferMutation.isPending ? 'Releasing Offer…' : 'Confirm & Release Offer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Convert to Employee Modal */}
      {showConvertModal && detailedProcess && (
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
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card" style={{
            width: '100%',
            maxWidth: 480,
            background: 'var(--neu-base)',
            boxShadow: 'var(--elev-4)',
            borderRadius: 20,
            padding: 28,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Convert to Active Employee
              </h3>
              <button
                onClick={() => setShowConvertModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
              This will transition <b>{detailedProcess.candidate?.full_name}</b> to <code>ONBOARDED</code> stage and provision an employee record in AttendX.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Company Work Email
                </label>
                <input
                  type="email"
                  value={convertForm.work_email}
                  onChange={(e) => setConvertForm({ ...convertForm, work_email: e.target.value })}
                  placeholder="e.g. employee@company.com"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Assigned System Role
                </label>
                <select
                  value={convertForm.role}
                  onChange={(e) => setConvertForm({ ...convertForm, role: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(128,128,180,0.2)',
                    background: 'var(--neu-bg-raised)',
                    fontSize: '0.875rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="HR">HR Specialist</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => setShowConvertModal(false)}
                  className="btn btn-secondary"
                  disabled={convertEmployeeMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={() => convertEmployeeMutation.mutate()}
                  disabled={convertEmployeeMutation.isPending}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {convertEmployeeMutation.isPending ? 'Converting…' : 'Confirm Conversion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  )
}
