'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Send, Bot, User, AlertCircle, Loader, Sparkles, Square, RotateCcw, Copy, Check, Search } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { SPRING_GENTLE } from '@/components/ui/MotionConfig'
import { PageWrapper } from '@/components/ui/PageWrapper'
import { CopilotMarkdown } from '@/components/copilot/CopilotMarkdown'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'done' | 'error'
  /** What the copilot is looking up right now (while streaming). */
  activity?: string
}

const PROMPTS: Record<'EMPLOYEE' | 'MANAGER' | 'ADMIN', string[]> = {
  EMPLOYEE: [
    'How many leave days do I have left?',
    'How was my attendance this month?',
    'When are the next holidays?',
    'Help me write a leave request for a family function',
  ],
  MANAGER: [
    "Who in my team hasn't clocked in today?",
    'What leave requests are waiting for me?',
    'Who is on leave this week?',
    'How was my attendance this month?',
  ],
  ADMIN: [
    'Give me a company overview for today',
    "Who hasn't clocked in today?",
    'Which leave requests are pending?',
    'Who checked in outside the office today?',
  ],
}

const TOOL_LABELS: Record<string, string> = {
  get_my_profile: 'Checking your profile',
  get_today_status: "Checking today's clock-in",
  get_my_attendance: 'Reading your attendance',
  get_my_leave_balance: 'Checking your leave balance',
  get_my_leave_requests: 'Looking at your leave requests',
  get_holidays: 'Looking up holidays',
  get_people_on_leave: "Checking who's on leave",
  get_team_attendance_today: "Checking your team's attendance",
  get_pending_approvals: 'Looking at pending approvals',
  get_company_overview: 'Pulling the company overview',
  get_performance_cycles: 'Checking review cycles',
  get_learning_courses: 'Browsing the course catalog',
}

function promptsFor(role: string | undefined) {
  const r = (role ?? 'EMPLOYEE').toUpperCase()
  if (r === 'MANAGER') return PROMPTS.MANAGER
  if (r === 'HR' || r === 'ADMIN' || r === 'SUPERADMIN') return PROMPTS.ADMIN
  return PROMPTS.EMPLOYEE
}

/* ---- Ambient orb: pulses while the copilot is working ---- */
function AmbientOrb({ thinking }: { thinking: boolean }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 'clamp(56px, 13vw, 88px)', height: 'clamp(56px, 13vw, 88px)', flexShrink: 0 }}>
      {thinking && [1, 2, 3].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `2px solid rgba(var(--accent-rgb), ${0.4 - i * 0.1})`,
          animation: `orb-ring 1.8s ${i * 0.4}s ease-out infinite`,
        }} />
      ))}
      <div style={{
        position: 'absolute', inset: 6, borderRadius: '50%',
        backgroundImage: thinking
          ? 'linear-gradient(135deg, var(--accent), var(--brand-violet), var(--brand-cyan))'
          : 'linear-gradient(135deg, var(--accent-dark), var(--accent))',
        boxShadow: thinking ? '0 0 40px var(--accent-glow), 0 0 80px rgba(var(--accent-rgb),0.15)' : '0 0 20px var(--accent-glow)',
        animation: thinking ? 'orb-think 2s ease-in-out infinite' : 'orb-idle 6s ease-in-out infinite',
        backgroundSize: '200% 200%',
      }}>
        <div style={{ position: 'absolute', top: '20%', left: '20%', width: '30%', height: '30%', background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 80%)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {thinking
            ? <Loader size={22} color="rgba(255,255,255,0.9)" style={{ animation: 'spin 1s linear infinite' }} />
            : <Sparkles size={22} color="rgba(255,255,255,0.9)" />}
        </div>
      </div>
      <style>{`
        @keyframes orb-idle { 0%,100% { transform: scale(1); } 33% { transform: scale(1.06) rotate(5deg); } 66% { transform: scale(0.97) rotate(-3deg); } }
        @keyframes orb-think { 0%,100% { transform: scale(1); background-position: 0% 50%; } 50% { transform: scale(1.08); background-position: 100% 50%; } }
        @keyframes orb-ring { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes copilot-dot { 0%,80%,100% { transform: scale(0.8); opacity: 0.5 } 40% { transform: scale(1.2); opacity: 1 } }
        @keyframes copilot-caret { 50% { opacity: 0 } }
      `}</style>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard blocked */ }
      }}
      aria-label={copied ? 'Copied' : 'Copy answer'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '4px 8px', borderRadius: 8,
        border: 0, background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ---- One chat bubble ---- */
function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const waiting = msg.status === 'streaming' && !msg.content
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_GENTLE}
      style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: 'var(--space-3)', alignItems: 'flex-start' }}
    >
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          background: 'linear-gradient(135deg, var(--accent), var(--brand-violet))',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elev-accent)',
        }}>
          <Bot size={16} color="white" />
        </div>
      )}
      <div style={{
        maxWidth: isUser ? '78%' : 'min(88%, 640px)', minWidth: 0,
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'var(--neu-bg-raised)',
        boxShadow: isUser ? 'var(--elev-accent)' : 'var(--elev-1)',
        color: isUser ? 'white' : 'var(--text-primary)',
        fontSize: 'var(--text-sm)', lineHeight: 1.65,
        border: isUser ? 'none' : '1px solid rgba(128,128,180,0.08)',
      }}>
        {isUser ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
        ) : waiting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
            {msg.activity ? (
              <>
                <Search size={14} color="var(--accent)" aria-hidden="true" />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{msg.activity}…</span>
              </>
            ) : (
              <span aria-label="Thinking" style={{ display: 'flex', gap: 5, padding: '4px 0' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: `copilot-dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />
                ))}
              </span>
            )}
          </div>
        ) : (
          <>
            <CopilotMarkdown text={msg.content} />
            {msg.status === 'streaming' && (
              <span aria-hidden="true" style={{ display: 'inline-block', width: 7, height: 15, marginLeft: 2, verticalAlign: 'text-bottom', background: 'var(--accent)', borderRadius: 2, animation: 'copilot-caret 1s steps(1) infinite' }} />
            )}
            {msg.status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--danger)', fontSize: '0.75rem' }}>
                <AlertCircle size={12} /> Not answered
              </div>
            )}
            {msg.status === 'done' && <CopyButton text={msg.content} />}
          </>
        )}
      </div>
      {isUser && (
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--neu-bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--elev-1)' }}>
          <User size={16} color="var(--text-tertiary)" />
        </div>
      )}
    </motion.div>
  )
}

export default function CopilotPage() {
  const user = useAuthStore(s => s.user)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // One conversation id per chat, so the server keeps context for this user only.
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patch = useCallback((id: string, change: Partial<Message> | ((m: Message) => Partial<Message>)) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)))
  }, [])

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || busy) return
    setInput('')
    const answerId = crypto.randomUUID()
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text, status: 'done' },
      { id: answerId, role: 'assistant', content: '', status: 'streaming' },
    ])
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
        signal: controller.signal,
      })
      const type = res.headers.get('content-type') ?? ''

      // Guardrail refusals, rate limits and "not set up yet" come back as one JSON reply.
      if (!type.includes('ndjson') || !res.body) {
        const json = await res.json().catch(() => ({}))
        const reply = json.reply || json.error || `Something went wrong (${res.status}). Please try again.`
        patch(answerId, { content: reply, status: res.ok && !json.error ? 'done' : 'error' })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let failed: string | null = null
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (!line) continue
          let event: { type: string; text?: string; name?: string; message?: string }
          try { event = JSON.parse(line) } catch { continue }
          if (event.type === 'delta' && event.text) {
            const t = event.text
            patch(answerId, m => ({ content: m.content + t, activity: undefined }))
          } else if (event.type === 'tool' && event.name) {
            patch(answerId, { activity: TOOL_LABELS[event.name] ?? 'Looking that up' })
          } else if (event.type === 'error') {
            failed = event.message ?? 'The copilot could not answer.'
          }
        }
      }
      patch(answerId, m => failed
        ? { content: m.content ? `${m.content}\n\n_${failed}_` : failed!, status: 'error', activity: undefined }
        : { status: 'done', activity: undefined })
    } catch (err) {
      const stopped = (err as Error)?.name === 'AbortError'
      patch(answerId, m => ({
        content: m.content || (stopped ? '_Stopped._' : "I couldn't reach the server. Check your connection and try again."),
        status: stopped ? 'done' : 'error',
        activity: undefined,
      }))
    } finally {
      setBusy(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  function newChat() {
    abortRef.current?.abort()
    setMessages([])
    setSessionId(crypto.randomUUID())
    setInput('')
  }

  const firstName = user?.profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'
  const suggestions = promptsFor(user?.role)

  return (
    <PageWrapper className="neu-copilot-container" style={{ maxWidth: 860, margin: '0 auto', height: 'calc(100dvh - 150px)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexShrink: 0 }}>
        <AmbientOrb thinking={busy} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title" style={{ marginBottom: 4, fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>HR Copilot</h1>
          <p className="page-subtitle" style={{ fontSize: 'clamp(0.8125rem, 2.5vw, 0.9375rem)' }}>
            Answers from your real attendance, leave and team data
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={newChat} className="btn btn-sm btn-secondary neu-touch-btn" style={{ minHeight: 40, flexShrink: 0 }}>
            <RotateCcw size={15} /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        aria-live="polite"
        style={{
          flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elev-0)',
          padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-3)',
        }}
      >
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ margin: 'auto 0', textAlign: 'center', padding: 'var(--space-6) var(--space-2)' }}>
            <Sparkles size={34} color="var(--accent)" style={{ margin: '0 auto var(--space-3)', opacity: 0.7 }} />
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Hi {firstName}, what do you want to know?
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', maxWidth: 420, margin: '0 auto var(--space-5)' }}>
              I look things up in AttendX for you: your attendance, leave, holidays{suggestions === PROMPTS.EMPLOYEE ? '' : ', your team'} and more.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-2)', maxWidth: 620, margin: '0 auto' }}>
              {suggestions.map(p => (
                <button key={p} type="button" onClick={() => send(p)} className="btn btn-sm btn-secondary neu-touch-btn"
                  style={{ minHeight: 48, padding: '10px 14px', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.4, fontSize: '0.8125rem', justifyContent: 'flex-start' }}>
                  {p}
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
      </div>

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); send() }}
        style={{
          display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexShrink: 0,
          background: 'var(--neu-bg)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elev-1)',
          padding: 'var(--space-2) var(--space-3)', border: '1px solid rgba(128,128,180,0.08)',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about attendance, leave, your team…"
          rows={1}
          maxLength={4000}
          aria-label="Message to HR Copilot"
          style={{
            flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none', alignSelf: 'center',
            fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--text-primary)',
            lineHeight: 1.5, minHeight: 28, maxHeight: 140, overflowY: 'auto', padding: '10px 0',
          }}
        />
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-secondary btn-icon neu-touch-btn"
            style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 'var(--radius-md)' }} aria-label="Stop answering">
            <Square size={16} />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="btn btn-primary btn-icon neu-touch-btn"
            style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 'var(--radius-md)' }} aria-label="Send message" id="btn-copilot-send">
            <Send size={18} />
          </button>
        )}
      </form>
      <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 6, flexShrink: 0 }}>
        AI answers can be wrong. Check important details in AttendX.
      </p>
    </PageWrapper>
  )
}
