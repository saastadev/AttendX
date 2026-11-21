'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders the copilot's Markdown answers: lists, bold, tables (scroll on
 * small screens), code and links (new tab). Raw HTML in the model's text is
 * never rendered (react-markdown escapes it), so answers can't inject markup.
 */
export function CopilotMarkdown({ text }: { text: string }) {
  return (
    <div className="copilot-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="copilot-md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
      <style>{`
        .copilot-md { font-size: var(--text-sm); line-height: 1.65; color: var(--text-primary); overflow-wrap: anywhere; }
        .copilot-md > :first-child { margin-top: 0; }
        .copilot-md > :last-child { margin-bottom: 0; }
        .copilot-md p { margin: 0 0 0.65em; }
        .copilot-md h1, .copilot-md h2, .copilot-md h3, .copilot-md h4 {
          font-family: var(--font-display); font-weight: 700; line-height: 1.3; margin: 0.9em 0 0.4em;
        }
        .copilot-md h1 { font-size: 1.15em; } .copilot-md h2 { font-size: 1.08em; } .copilot-md h3, .copilot-md h4 { font-size: 1em; }
        .copilot-md ul, .copilot-md ol { margin: 0 0 0.65em; padding-left: 1.3em; }
        .copilot-md li { margin: 0.2em 0; }
        .copilot-md li::marker { color: var(--accent); }
        .copilot-md strong { font-weight: 700; color: var(--text-primary); }
        .copilot-md a { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
        .copilot-md code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em;
          background: rgba(var(--accent-rgb), 0.08); padding: 0.1em 0.35em; border-radius: 6px;
        }
        .copilot-md pre { background: var(--neu-bg-deep); padding: 0.75em 0.9em; border-radius: 10px; overflow-x: auto; margin: 0 0 0.65em; }
        .copilot-md pre code { background: none; padding: 0; }
        .copilot-md blockquote {
          margin: 0 0 0.65em; padding: 0.4em 0.9em; border-left: 3px solid var(--accent);
          background: rgba(var(--accent-rgb), 0.06); border-radius: 0 8px 8px 0; color: var(--text-secondary);
        }
        .copilot-md hr { border: 0; border-top: 1px solid rgba(128,128,180,0.2); margin: 0.9em 0; }
        .copilot-md-table { overflow-x: auto; margin: 0.2em 0 0.75em; border-radius: 10px; border: 1px solid rgba(128,128,180,0.18); }
        .copilot-md table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
        .copilot-md th, .copilot-md td { padding: 0.45em 0.7em; text-align: left; border-bottom: 1px solid rgba(128,128,180,0.14); white-space: nowrap; }
        .copilot-md th { font-weight: 700; background: rgba(var(--accent-rgb), 0.07); color: var(--text-secondary); font-size: 0.92em; }
        .copilot-md tr:last-child td { border-bottom: 0; }
      `}</style>
    </div>
  )
}
