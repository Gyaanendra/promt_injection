import { useState, useEffect, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [messages, setMessages] = useState([]);   // { role: 'user'|'assistant', content: string }
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState(''); // live tokens
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (input.trim() === '' || isLoading) return;

    const userMsg = { role: 'user', content: input.trim() };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      // Rate-limit / validation errors come back as plain JSON (not a stream)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      // ── Read the SSE stream ──────────────────────────────────────────────
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        buffer = parts.pop(); // keep incomplete tail

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;

          const raw = line.slice(5).trim();
          if (raw === '[DONE]') break;

          try {
            const parsed = JSON.parse(raw);

            if (parsed.error) throw new Error(parsed.error);

            if (parsed.delta) {
              accumulated += parsed.delta;
              setStreamingContent(accumulated);
            }
          } catch (parseErr) {
            // Ignore malformed chunks
          }
        }
      }

      // Commit the complete reply to the message list
      const finalReply = accumulated || 'The guardian is silent...';
      setMessages((prev) => [...prev, { role: 'assistant', content: finalReply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠ ${err.message}` },
      ]);
    } finally {
      setStreamingContent('');
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: '#0a0e1a', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>

      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(135deg, #0d1117 0%, #161b27 100%)',
        borderBottom: '1px solid #00ff9520',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexShrink: 0,
      }}>
        {/* Terminal dots */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', display: 'block' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e', display: 'block' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840', display: 'block' }} />
        </div>

        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#00ff95', fontSize: '0.8rem' }}>▶</span>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, letterSpacing: '0.05em', color: '#e2e8f0' }}>
              <span style={{ color: '#00ff95' }}>CRYPTIC</span>
              <span style={{ color: '#64748b', margin: '0 0.3em' }}>::</span>
              <span style={{ color: '#a78bfa' }}>Guardian AI</span>
            </h1>
            <span style={{ color: '#00ff95', fontSize: '0.8rem' }}>◀</span>
          </div>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Prompt Injection Challenge — Can you extract the flag?
          </p>
        </div>

        {/* Live badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          background: '#00ff9510', border: '1px solid #00ff9530',
          borderRadius: '999px', padding: '3px 10px', flexShrink: 0,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#00ff95', boxShadow: '0 0 6px #00ff95',
            display: 'block',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '0.65rem', color: '#00ff95', fontWeight: 600 }}>LIVE</span>
        </div>
      </header>

      {/* ── Messages Area ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        scrollbarWidth: 'thin',
        scrollbarColor: '#1e293b transparent',
      }}>

        {/* Empty state */}
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            flex: 1, gap: '1rem', opacity: 0.6,
          }}>
            <div style={{ fontSize: '3rem' }}>🔐</div>
            <p style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', maxWidth: '400px', lineHeight: 1.6, margin: 0 }}>
              The Guardian AI holds a secret flag.<br />
              <span style={{ color: '#a78bfa' }}>Try prompt injection to extract it...</span>
            </p>
            <div style={{ color: '#1e3a2e', fontSize: '0.75rem' }}>
              $ ./jailbreak_attempt.sh --target guardian_ai
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div key={i} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              gap: '4px',
            }}>
              <div style={{
                fontSize: '0.65rem',
                color: isUser ? '#60a5fa' : '#00ff95',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                padding: '0 0.5rem',
              }}>
                {isUser ? '▸ you@attacker' : '▸ guardian@ai'}
              </div>

              <div style={{
                maxWidth: '70%',
                padding: '0.75rem 1rem',
                borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: isUser
                  ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)'
                  : 'linear-gradient(135deg, #0f1923 0%, #131e2e 100%)',
                border: isUser ? '1px solid #3b82f640' : '1px solid #00ff9220',
                boxShadow: isUser ? '0 4px 20px #2563eb25' : '0 4px 20px #00ff9210',
                color: isUser ? '#e2e8f0' : '#94a3b8',
                fontSize: '0.875rem',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicator — only shown while waiting for first token */}
        {isLoading && streamingContent === '' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            <div style={{ fontSize: '0.65rem', color: '#00ff95', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, padding: '0 0.5rem' }}>
              ▸ guardian@ai
            </div>
            <div style={{
              padding: '0.75rem 1.2rem',
              borderRadius: '16px 16px 16px 4px',
              background: 'linear-gradient(135deg, #0f1923 0%, #131e2e 100%)',
              border: '1px solid #00ff9220',
              display: 'flex', gap: '5px', alignItems: 'center',
            }}>
              {[0, 1, 2].map((d) => (
                <span key={d} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#00ff95', display: 'block',
                  animation: `blink 1.2s ease-in-out ${d * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Live streaming bubble — grows token by token */}
        {streamingContent !== '' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
            <div style={{ fontSize: '0.65rem', color: '#00ff95', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, padding: '0 0.5rem' }}>
              ▸ guardian@ai
            </div>
            <div style={{
              maxWidth: '70%',
              padding: '0.75rem 1rem',
              borderRadius: '16px 16px 16px 4px',
              background: 'linear-gradient(135deg, #0f1923 0%, #131e2e 100%)',
              border: '1px solid #00ff9220',
              boxShadow: '0 4px 20px #00ff9210',
              color: '#94a3b8',
              fontSize: '0.875rem',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {streamingContent}
              {/* Blinking cursor at end of stream */}
              <span style={{
                display: 'inline-block',
                width: '2px',
                height: '1em',
                background: '#00ff95',
                marginLeft: '2px',
                verticalAlign: 'text-bottom',
                animation: 'pulse 0.8s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ── */}
      <div style={{
        padding: '1rem 1.5rem',
        background: '#0d1117',
        borderTop: '1px solid #00ff9515',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <div style={{ color: '#00ff95', fontSize: '0.9rem', fontWeight: 700, paddingBottom: '0.6rem', flexShrink: 0, userSelect: 'none' }}>
          $
        </div>

        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type your injection attempt... (Enter to send, Shift+Enter for newline)"
          disabled={isLoading}
          rows={1}
          style={{
            flex: 1,
            background: '#0a0e1a',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            padding: '0.65rem 1rem',
            color: '#e2e8f0',
            fontSize: '0.875rem',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineHeight: 1.6,
            resize: 'none',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = '#00ff9540';
            e.target.style.boxShadow = '0 0 0 3px #00ff9510';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = '#1e293b';
            e.target.style.boxShadow = 'none';
          }}
        />

        <button
          onClick={handleSend}
          disabled={isLoading || input.trim() === ''}
          style={{
            padding: '0.65rem 1.25rem',
            background: isLoading || input.trim() === ''
              ? '#1e293b'
              : 'linear-gradient(135deg, #059669, #00ff95)',
            border: 'none',
            borderRadius: '10px',
            color: isLoading || input.trim() === '' ? '#475569' : '#0a0e1a',
            fontSize: '0.875rem',
            fontWeight: 700,
            cursor: isLoading || input.trim() === '' ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
            letterSpacing: '0.05em',
            boxShadow: isLoading || input.trim() === '' ? 'none' : '0 0 20px #00ff9530',
            fontFamily: "'JetBrains Mono', monospace",
          }}
          onMouseEnter={(e) => {
            if (!isLoading && input.trim() !== '') {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 0 28px #00ff9550';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = isLoading || input.trim() === '' ? 'none' : '0 0 20px #00ff9530';
          }}
        >
          {isLoading ? '...' : 'SEND ▶'}
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '0.4rem 1.5rem 0.6rem',
        background: '#0d1117',
        textAlign: 'center',
        borderTop: '1px solid #0f172a',
      }}>
        <span style={{ fontSize: '0.65rem', color: '#1e3a2e', letterSpacing: '0.06em' }}>
          redcrypt · prompt injection challenge · find the flag
        </span>
      </div>

      {/* ── Animations ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
        textarea::placeholder { color: #334155; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.9); }
          40% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

export default App;