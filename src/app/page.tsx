'use client';

import { generateUuid } from '@/lib/uuid-border';
import Link from 'next/link';
import { UUIDInput } from '@/components/UUIDInput';
import { useCallback, useState } from 'react';

export default function EncoderPage() {
  const [uuid, setUuid] = useState(generateUuid());

  const regenerateUuid = useCallback(() => {
    setUuid(generateUuid());
  }, []);

  return (
    <main className="min-h-screen relative noise">
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--accent)]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-[var(--accent-secondary)]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-2xl mx-auto px-6 py-20 relative">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-xl font-light tracking-wide text-[var(--foreground)]">
              UUID Border
            </span>
          </div>
          <Link 
            href="/decode"
            className="
              group flex items-center gap-2 px-4 py-2 rounded-full
              text-sm tracking-wider text-[var(--muted)] 
              hover:text-[var(--foreground)] 
              bg-[var(--surface)] hover:bg-[var(--surface-elevated)]
              border border-[var(--border)] hover:border-[var(--accent)]/30
              transition-all duration-300
            "
          >
            <span>Decode</span>
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </header>

        {/* Hero section */}
        <div className="mb-16 fade-in-delay-1">
          <h1 className="text-5xl md:text-6xl font-light tracking-tight mb-6 leading-[1.1]">
            <span className="text-gradient">Hidden data</span>
            <br />
            <span className="text-[var(--foreground)]">in plain sight</span>
          </h1>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Your UUID is encoded into the subtle color variations of the border below. 
            Invisible to the eye, but recoverable from a screenshot.
          </p>
        </div>

        {/* Main input card */}
        <div className="glass-card p-8 mb-8 glow-hover fade-in-delay-2">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Encoding Active
            </span>
          </div>
          
          <UUIDInput 
            uuid={uuid}
            onRegenerate={regenerateUuid}
            placeholder="Type anything here..."
          />
        </div>

        {/* UUID Display */}
        <div className="glass-card p-6 fade-in-delay-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs tracking-widest uppercase text-[var(--muted)] block mb-2">
                Embedded UUID
              </span>
              <code className="mono text-sm text-[var(--accent)] tracking-wide break-all">
                {uuid}
              </code>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="mt-12 text-center fade-in-delay-3">
          <p className="text-[var(--muted)]/60 text-sm font-light">
            Take a screenshot and use{' '}
            <Link href="/decode" className="text-[var(--accent)] hover:text-[var(--accent-secondary)] transition-colors">
              Decode
            </Link>
            {' '}to extract the UUID
          </p>
        </div>
      </div>
    </main>
  );
}
