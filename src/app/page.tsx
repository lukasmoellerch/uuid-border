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
    <main className="min-h-screen relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-[var(--accent)]/10 to-transparent blur-3xl pointer-events-none" />
      
      <div className="max-w-2xl mx-auto px-8 py-16 relative">
        {/* Header */}
        <header className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-secondary)] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-lg font-light tracking-wide">UUID Border</span>
          </div>
          <Link 
            href="/decode"
            className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all duration-300"
          >
            <span className="text-sm tracking-wider text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors">
              Decode
            </span>
            <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </header>

        {/* Hero section */}
        <div className="mb-16">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-6">
            <span className="gradient-text">Hidden data</span>
            <br />
            <span className="text-[var(--foreground)]">in plain sight</span>
          </h1>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Your UUID is invisibly encoded into the subtle color variations of the input border below. 
            <span className="text-[var(--accent)]"> Try taking a screenshot.</span>
          </p>
        </div>

        {/* Main input card */}
        <div className="card p-6 mb-8 glow">
          <div className="mb-4">
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Encoded Input
            </span>
          </div>
          <UUIDInput 
            uuid={uuid}
            onRegenerate={regenerateUuid}
            placeholder="Type anything here..."
          />
        </div>

        {/* UUID Display */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Current UUID
            </span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              <span className="text-xs text-[var(--success)]">Active</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <code className="mono text-sm md:text-base text-[var(--accent)] tracking-wide break-all">
              {uuid}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(uuid)}
              className="flex-shrink-0 p-2 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
              title="Copy UUID"
            >
              <svg className="w-4 h-4 text-[var(--muted)] hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* How it works section */}
        <div className="mt-16 pt-8 border-t border-[var(--border)]">
          <h2 className="text-sm tracking-widest uppercase text-[var(--muted)] mb-6">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-[var(--surface)]/50">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-3">
                <span className="text-[var(--accent)] text-sm font-medium">1</span>
              </div>
              <p className="text-sm text-[var(--muted)]">UUID is converted to binary data</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--surface)]/50">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-3">
                <span className="text-[var(--accent)] text-sm font-medium">2</span>
              </div>
              <p className="text-sm text-[var(--muted)]">Encoded into border color variations</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--surface)]/50">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mb-3">
                <span className="text-[var(--accent)] text-sm font-medium">3</span>
              </div>
              <p className="text-sm text-[var(--muted)]">Survives screenshots & compression</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-sm text-[var(--muted)]">
            A steganography experiment · 
            <a href="https://github.com" className="text-[var(--accent)] hover:underline ml-1">View source</a>
          </p>
        </footer>
      </div>
    </main>
  );
}
