'use client';

import { generateUuid } from '@/lib/uuid-border';
import Link from 'next/link';
import { UUIDInput } from '@/components/UUIDInput';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useCallback, useState } from 'react';

export default function EncoderPage() {
  const [uuid, setUuid] = useState(generateUuid());

  const regenerateUuid = useCallback(() => {
    setUuid(generateUuid());
  }, []);

  return (
    <main className="min-h-screen relative">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center glass rounded-2xl px-6 py-3 border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-sm font-medium tracking-wide text-[var(--foreground)]">
                UUID Border
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Link 
                href="/decode"
                className="btn-ghost text-xs tracking-wider"
              >
                Decode
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 pt-32 pb-20">
        {/* Hero Section */}
        <div className="space-y-6 mb-16 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 badge mb-4">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span>Steganography</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-light tracking-tight text-[var(--foreground)] leading-[1.1]">
            Hidden data in{' '}
            <span className="gradient-text font-normal">plain sight</span>
          </h1>
          
          <p className="text-lg text-[var(--muted)] font-light leading-relaxed max-w-lg">
            Your UUID is encoded into the subtle color variations of the border below. 
            Invisible to the eye, but perfectly recoverable from a screenshot.
          </p>
        </div>

        {/* Input Section */}
        <div className="space-y-8 animate-fade-in-up stagger-2" style={{ opacity: 0 }}>
          <div className="relative">
            <UUIDInput 
              uuid={uuid}
              onRegenerate={regenerateUuid}
              placeholder="Type anything here..."
            />
            
            {/* Decorative elements */}
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-gradient-to-b from-transparent via-[var(--accent)] to-transparent opacity-20" />
          </div>

          {/* UUID Display Card */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 card-hover">
            {/* Shimmer effect */}
            <div className="absolute inset-0 animate-shimmer opacity-50" />
            
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
                  Encoded UUID
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  <span className="text-xs text-[var(--success)]">Active</span>
                </div>
              </div>
              
              <code className="mono text-base md:text-lg text-[var(--accent)] tracking-wide block">
                {uuid}
              </code>
            </div>
          </div>
        </div>

        {/* How it works section */}
        <div className="mt-20 pt-12 border-t border-[var(--border)] animate-fade-in-up stagger-3" style={{ opacity: 0 }}>
          <h2 className="text-xs tracking-widest uppercase text-[var(--muted)] mb-8">
            How it works
          </h2>
          
          <div className="grid gap-6">
            {[
              {
                step: '01',
                title: 'Encode',
                description: 'The UUID is converted into a sequence of colors using Reed-Solomon error correction.',
              },
              {
                step: '02',
                title: 'Embed',
                description: 'Colors are painted into the border as subtle variations, invisible to the human eye.',
              },
              {
                step: '03',
                title: 'Capture',
                description: 'Take a screenshot. The data survives compression, scaling, and noise.',
              },
            ].map((item) => (
              <div 
                key={item.step}
                className="flex gap-6 group"
              >
                <span className="mono text-xs text-[var(--accent)] opacity-50 group-hover:opacity-100 transition-opacity pt-1">
                  {item.step}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-medium text-[var(--foreground)] mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--muted)] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>A steganography experiment</span>
            <Link 
              href="/decode" 
              className="inline-flex items-center gap-2 hover:text-[var(--accent)] transition-colors"
            >
              Try decoding
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
