'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, AlertCircle, Loader, Sparkles, Mic, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth.store'
import { SPRING_GENTLE, STAGGER_CONTAINER, STAGGER_ITEM } from '@/components/ui/MotionConfig'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  status?: 'sending' | 'error' | 'done'
}

const SUGGESTED_PROMPTS = [
  'How many leave days do I have left?',
  "What's my attendance rate this month?",
  'Show me my upcoming performance review',
  'Who is on leave today in my team?',
]

/* ---- Ambient Orb (CSS-only, no WebGL) ----
   A simple pulsing morphing blob reacting to "thinking" state.
   This is the personality moment — premium CSS, no R3F needed here
   since a CSS orb at this scale performs better and reduces complexity. */
function AmbientOrb({ thinking }: { thinking: boolean }) {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      {/* Glow rings */}
      {thinking && [1, 2, 3].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `2px solid rgba(var(--accent-rgb), ${0.4 - i * 0.1})`,
          animation: `orb-ring 1.8s ${i * 0.4}s ease-out infinite`,
        }} />
      ))}

      {/* Core orb */}
      <div style={{
        position: 'absolute', inset: 8,
        borderRadius: '50%',
        background: thinking
          ? 'linear-gradient(135deg, var(--accent), var(--brand-violet), var(--brand-cyan))'
          : 'linear-gradient(135deg, var(--accent-dark), var(--accent))',
        boxShadow: thinking
          ? '0 0 40px var(--accent-glow), 0 0 80px rgba(var(--accent-rgb),0.15)'
          : '0 0 20px var(--accent-glow)',
        animation: thinking
          ? 'orb-think 2s ease-in-out infinite'
          : 'orb-idle 6s ease-in-out infinite',
        backgroundSize: '200% 200%',
      }}>
        {/* Inner highlight */}
        <div style={{
          position: 'absolute', top: '20%', left: '20%', width: '30%', height: '30%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 80%)',
          borderRadius: '50%',
        }} />
        {/* Icon */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {thinking
            ? <Loader size={28} color="rgba(255,255,255,0.9)" style={{ animation: 'spin 1s linear infinite' }} />
            : <Sparkles size={28} color="rgba(255,255,255,0.9)" />
          }
        </div>
      </div>

      <style>{`
        @keyframes orb-idle {
          0%,100% { transform: scale(1); }
          33% { transform: scale(1.06) rotate(5deg); }
          66% { transform: scale(0.97) rotate(-3deg); }
        }
        @keyframes orb-think {
          0%,100% { transform: scale(1); background-position: 0% 50%; }
          50% { transform: scale(1.08); background-position: 100% 50%; }
        }
        @keyframes orb-ring {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

/* ---- Chat Message ---- */
function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING_GENTLE}
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: 'var(--space-3)',
        alignItems: 'flex-end',
      }}
    >
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--brand-violet))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--elev-accent)',
        }}>
          <Bot size={16} color="white" />
        </div>
      )}
      <div style={{
        maxWidth: '72%',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser
          ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))'
          : 'var(--neu-bg-raised)',
        boxShadow: isUser ? 'var(--elev-accent)' : 'var(--elev-1)',
        color: isUser ? 'white' : 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.65,
        border: isUser ? 'none' : '1px solid rgba(128,128,180,0.08)',
      }}>
        {msg.content}
        {msg.status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--danger)', fontSize: '0.75rem' }}>
            <AlertCircle size={12} /> Failed to send
          </div>
        )}
      </div>
      {isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: 'var(--neu-bg-deep)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--elev-1)',
        }}>
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
  const [thinking, setThinking] = useState(false)
  const [backendError, setBackendError] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function sendMessage() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      status: 'done',
    }
    setMessages(prev => [...prev, userMsg])
    setThinking(true)

    try {
      // Attempt to call the real API endpoint
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })

      if (!res.ok) {
        // Backend not implemented yet — honest error state
        if (res.status === 404) {
          setBackendError(true)
          throw new Error('Copilot backend is not yet deployed. Full UI is ready and wired — waiting on the API route.')
        }
        throw new Error(`API error: ${res.status} ${res.statusText}`)
      }

      const { reply } = await res.json()
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant', content: reply, timestamp: new Date(), status: 'done',
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: backendError
          ? '⚠️ The HR Copilot backend is not yet deployed. This chat UI is fully built and wired — it will work once the `/api/copilot` streaming endpoint goes live.'
          : `I ran into an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
        status: err.message.includes('not yet') ? 'done' : 'error',
      }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', height: 'calc(100dvh - 80px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', marginBottom: 'var(--space-5)', flexShrink: 0 }}>
        <AmbientOrb thinking={thinking} />
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>HR Copilot</h1>
          <p className="page-subtitle">Ask anything about your attendance, leave, performance, or team</p>
          {backendError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '0.75rem', color: 'var(--warning-dark)' }}>
              <AlertCircle size={12} />
              Backend not deployed — UI is ready, wired to <code>/api/copilot</code>
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: 'var(--neu-bg-deep)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--elev-0)', padding: 'var(--space-5)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}>
        {messages.length === 0 && !thinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: 'var(--space-10) 0', color: 'var(--text-tertiary)' }}
          >
            <Sparkles size={40} style={{ margin: '0 auto var(--space-4)', opacity: 0.5 }} />
            <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Hey {user?.profile.full_name.split(' ')[0]}, how can I help?
            </p>
            <p style={{ fontSize: 'var(--text-sm)' }}>Ask me anything about your workspace</p>
          </motion.div>
        )}

        {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}

        {thinking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--brand-violet))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} color="white" />
            </div>
            <div style={{ background: 'var(--neu-bg-raised)', borderRadius: '18px 18px 18px 4px', padding: '14px 18px', boxShadow: 'var(--elev-1)', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
        <style>{`@keyframes bounce { 0%,80%,100%{transform:scale(0.8);opacity:0.5} 40%{transform:scale(1.2);opacity:1} }`}</style>
      </div>

      {/* Suggested prompts */}
      {messages.length === 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p} onClick={() => { setInput(p); }}
              className="btn btn-sm btn-secondary"
              style={{ height: 'auto', padding: '6px 12px', whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.4 }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', flexShrink: 0,
        background: 'var(--neu-bg)', borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--elev-1)', padding: 'var(--space-3) var(--space-4)',
        border: '1px solid rgba(128,128,180,0.08)',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Ask me anything… (Enter to send, Shift+Enter for new line)"
          rows={1}
          aria-label="Message to HR Copilot"
          style={{
            flex: 1, resize: 'none', background: 'none', border: 'none', outline: 'none',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-base)',
            color: 'var(--text-primary)', lineHeight: 1.6, minHeight: 24, maxHeight: 160,
            overflowY: 'auto',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || thinking}
          className="btn btn-primary btn-icon"
          style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 'var(--radius-md)' }}
          aria-label="Send message"
          id="btn-copilot-send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
