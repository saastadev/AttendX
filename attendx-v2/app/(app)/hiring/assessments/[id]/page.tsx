'use client'

import React, { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Send,
  HelpCircle,
  FileText,
  Award,
  ShieldCheck,
  Check,
  AlertCircle
} from 'lucide-react'

interface Question {
  id: string
  question_text: string
  question_type: 'MULTIPLE_CHOICE' | 'TEXT' | 'CODE'
  options?: string[]
  points: number
}

interface AssessmentData {
  id: string
  title: string
  description?: string
  time_limit_minutes: number
  passing_score: number
  questions: Question[]
}

interface SessionData {
  candidate_assessment: {
    id: string
    status: 'ASSIGNED' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED' | 'EXPIRED'
    score?: number | null
    passed?: boolean | null
    started_at?: string
    submitted_at?: string
    ai_evaluation?: any
  }
  assessment: AssessmentData
  time_limit_minutes: number
  time_remaining_seconds: number
}

export default function CandidateAssessmentPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const resolvedParams = use(params)
  const assessmentId = resolvedParams.id

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)

  // Test-taking state
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<any | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch assessment session
  useEffect(() => {
    if (!mounted || !assessmentId) return

    async function loadAssessment() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/hiring/assessments/${assessmentId}?candidate=true`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load assessment')
        }

        setSession(data)
        if (data.candidate_assessment?.answers) {
          setAnswers(data.candidate_assessment.answers)
        }
        if (data.candidate_assessment?.status === 'EVALUATED' || data.candidate_assessment?.status === 'SUBMITTED') {
          setSubmissionResult({
            score: data.candidate_assessment.score,
            passed: data.candidate_assessment.passed,
            status: data.candidate_assessment.status,
            passing_score: data.assessment?.passing_score || 60,
          })
        } else {
          setSecondsRemaining(data.time_remaining_seconds ?? (data.time_limit_minutes * 60))
        }
      } catch (err: any) {
        setError(err.message || 'Error connecting to assessment server')
      } finally {
        setLoading(false)
      }
    }

    loadAssessment()
  }, [mounted, assessmentId])

  // Active countdown timer
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0 || submissionResult) return

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [secondsRemaining, submissionResult])

  const handleSelectAnswer = (questionId: string, answerValue: string | number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answerValue
    }))
  }

  const handleAutoSubmit = async () => {
    if (submitting || submissionResult) return
    await submitTestAnswers(true)
  }

  const submitTestAnswers = async (isAuto = false) => {
    try {
      setSubmitting(true)
      const res = await fetch(`/api/hiring/assessments/${assessmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit assessment answers')
      }

      setSubmissionResult(data.result || data.evaluation || data)
      setShowConfirmModal(false)
    } catch (err: any) {
      alert(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading secure test environment...</p>
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Assessment Unavailable</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{error || 'This assessment cannot be accessed.'}</p>
          <button
            onClick={() => router.push('/hiring')}
            className="w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const { assessment, candidate_assessment } = session
  const questions = assessment.questions || []
  const totalQuestions = questions.length
  const currentQ = questions[currentIdx]

  // Completed / Evaluated Screen
  if (submissionResult || candidate_assessment.status === 'EVALUATED' || candidate_assessment.status === 'SUBMITTED') {
    const res = submissionResult || {
      score: candidate_assessment.score,
      passed: candidate_assessment.passed,
      status: candidate_assessment.status,
      passing_score: assessment.passing_score
    }
    const isPassed = res.passed ?? (res.score >= (res.passing_score || 60))

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="max-w-xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isPassed
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 ring-8 ring-emerald-50/50'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 ring-8 ring-amber-50/50'
          }`}>
            {isPassed ? <Award className="w-10 h-10" /> : <FileText className="w-10 h-10" />}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
            Assessment Completed!
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mb-8">
            Thank you for completing <span className="font-semibold text-slate-800 dark:text-slate-200">{assessment.title}</span>. Your responses have been securely evaluated.
          </p>

          <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/60 mb-8">
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">Your Score</span>
              <span className={`text-3xl sm:text-4xl font-extrabold ${
                isPassed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {res.score ?? 0}%
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-1">Requirement</span>
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-700 dark:text-slate-300">
                {res.passing_score ?? 60}%
              </span>
            </div>
          </div>

          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-semibold mb-8 border">
            {isPassed ? (
              <span className="inline-flex items-center text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Met Passing Benchmark
              </span>
            ) : (
              <span className="inline-flex items-center text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 px-3 py-1 rounded-full">
                <AlertCircle className="w-4 h-4 mr-1.5" /> Reviewed by Hiring Team
              </span>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            The recruiting panel has been automatically notified. Next steps regarding your interview pipeline will be shared via your registered email.
          </p>

          <button
            onClick={() => router.push('/hiring')}
            className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-sm transition shadow-sm"
          >
            Done & Exit
          </button>
        </div>
      </div>
    )
  }

  // Format countdown timer
  const minutes = Math.floor((secondsRemaining || 0) / 60)
  const seconds = (secondsRemaining || 0) % 60
  const isTimeUrgent = (secondsRemaining || 0) < 300 // < 5 mins

  const answeredCount = Object.keys(answers).length
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Banner & Timer */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
              {assessment.title}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Question {currentIdx + 1} of {totalQuestions} • Passing threshold: {assessment.passing_score}%
            </p>
          </div>
        </div>

        {/* Live Timer Indicator */}
        <div className="flex items-center space-x-3">
          <div
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-mono font-bold tracking-wider border shadow-sm transition-colors ${
              isTimeUrgent
                ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 animate-pulse'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>

          <button
            onClick={() => setShowConfirmModal(true)}
            className="hidden sm:inline-flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            <span>Finish Test</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-800 h-1">
        <div
          className="bg-indigo-600 h-1 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Test Layout */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 flex flex-col">
        {totalQuestions === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800">
            <HelpCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">
              No questions found for this assessment.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Question Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm mb-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-3 py-1 rounded-full">
                  Question {currentIdx + 1} • {currentQ?.points || 10} Points
                </span>
                <span className="text-xs font-medium text-slate-500">
                  {answers[currentQ?.id] !== undefined ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center">
                      <Check className="w-3.5 h-3.5 mr-1" /> Answered
                    </span>
                  ) : (
                    'Not yet answered'
                  )}
                </span>
              </div>

              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-6 leading-relaxed">
                {currentQ?.question_text}
              </h2>

              {/* Multiple Choice Options */}
              {currentQ?.question_type === 'MULTIPLE_CHOICE' && (
                <div className="space-y-3 mb-6">
                  {(currentQ.options || []).map((optionText, optIdx) => {
                    const isSelected = answers[currentQ.id] === optIdx
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => handleSelectAnswer(currentQ.id, optIdx)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center space-x-3.5 ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500/20 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {String.fromCharCode(65 + optIdx)}
                        </div>
                        <span className="text-sm font-medium flex-1">{optionText}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Text / Code Question Input */}
              {(currentQ?.question_type === 'TEXT' || currentQ?.question_type === 'CODE') && (
                <div className="mb-6 flex-1 flex flex-col">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {currentQ.question_type === 'CODE' ? 'Write Your Code Solution' : 'Your Detailed Answer'}
                  </label>
                  <textarea
                    rows={8}
                    value={String(answers[currentQ.id] || '')}
                    onChange={e => handleSelectAnswer(currentQ.id, e.target.value)}
                    placeholder={
                      currentQ.question_type === 'CODE'
                        ? '// Write your function or implementation here...'
                        : 'Explain your reasoning and solution clearly...'
                    }
                    className="w-full flex-1 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                  />
                </div>
              )}

              {/* Navigator controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80 mt-auto">
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                {currentIdx < totalQuestions - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIdx(i => Math.min(totalQuestions - 1, i + 1))}
                    className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold transition"
                  >
                    <span>Next Question</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <span>Review & Submit</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Question Quick-Jump Dots */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-semibold text-slate-500">Quick Navigation:</span>
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIdx
                  const isAnswered = answers[q.id] !== undefined
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                        isCurrent
                          ? 'ring-2 ring-indigo-600 bg-indigo-600 text-white'
                          : isAnswered
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                className="sm:hidden text-xs font-bold text-indigo-600 py-1"
              >
                Submit Test
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Submit Assessment?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
              You have answered <span className="font-bold text-slate-900 dark:text-white">{answeredCount}</span> of{' '}
              <span className="font-bold text-slate-900 dark:text-white">{totalQuestions}</span> questions.
              Once submitted, you cannot change your answers.
            </p>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitTestAnswers(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
