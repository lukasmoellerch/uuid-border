'use client';

import { generateUuid } from '@/lib/uuid-border';
import Link from 'next/link';
import { UUIDInput } from '@/components/UUIDInput';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ColorSpectrum, ColorBreakdown } from '@/components/ColorSpectrum';
import { useCallback, useState } from 'react';

export default function EncoderPage() {
  const [uuid, setUuid] = useState(generateUuid());
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);

  const regenerateUuid = useCallback(() => {
    setUuid(generateUuid());
    setAnimationKey(k => k + 1);
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)] transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 sm:mb-20">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-light tracking-wide text-[var(--foreground)]">
              Encode
            </h1>
            <span className="hidden sm:inline-block text-xs tracking-widest uppercase text-[var(--muted)] bg-[var(--surface)] px-3 py-1 rounded-full border border-[var(--border)]">
              Steganography
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link 
              href="/decode"
              className="text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase flex items-center gap-1"
            >
              Decode <span className="text-lg">→</span>
            </Link>
          </div>
        </header>

        {/* Hero */}
        <div className="mb-12 animate-fade-in">
          <h2 className="text-4xl sm:text-5xl font-light leading-tight mb-6 gradient-text">
            Hidden data<br />
            in plain sight
          </h2>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Your UUID is encoded into subtle color variations of the border below. 
            Take a screenshot, and the data travels with it.
          </p>
        </div>

        {/* Input */}
        <div className="mb-8 animate-fade-in stagger-1">
          <UUIDInput 
            uuid={uuid}
            onRegenerate={regenerateUuid}
            placeholder="Type anything here..."
          />
        </div>

        {/* UUID Display */}
        <div className="pt-6 border-t border-[var(--border)] animate-fade-in stagger-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Current UUID
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(uuid)}
              className="text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--accent)] transition-colors"
            >
              Copy
            </button>
          </div>
          <code key={animationKey} className="mono text-sm sm:text-base text-[var(--accent)] tracking-wide block animate-slide-in">
            {uuid}
          </code>
        </div>

        {/* Color Spectrum Preview */}
        <div className="mt-10 pt-6 border-t border-[var(--border)] animate-fade-in stagger-3">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Encoded spectrum
            </span>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
            >
              {showBreakdown ? 'Hide' : 'Show'} breakdown
              <svg 
                className={`w-3 h-3 transition-transform duration-200 ${showBreakdown ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor" 
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          
          <div key={animationKey} className="space-y-4">
            <ColorSpectrum uuid={uuid} animated />
            <p className="text-xs text-[var(--muted)] italic">
              84 color segments encode markers, index, and 32 hex digits
            </p>
          </div>

          {showBreakdown && (
            <div className="mt-6 p-4 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
              <ColorBreakdown uuid={uuid} />
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-16 pt-8 border-t border-[var(--border)] animate-fade-in stagger-4">
          <h3 className="text-lg font-light mb-6 text-[var(--foreground)]">How it works</h3>
          <div className="grid gap-6 text-sm text-[var(--muted)]">
            <div className="flex gap-4">
              <span className="text-[var(--accent)] font-mono text-xs bg-[var(--surface)] w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--border)]">1</span>
              <p className="leading-relaxed">
                <strong className="text-[var(--foreground)] font-medium">Encoding:</strong> Each UUID4 is converted into 84 color segments using an 8-color palette with subtle RGB variations (±10 units from base gray).
              </p>
            </div>
            <div className="flex gap-4">
              <span className="text-[var(--accent)] font-mono text-xs bg-[var(--surface)] w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--border)]">2</span>
              <p className="leading-relaxed">
                <strong className="text-[var(--foreground)] font-medium">Self-calibrating:</strong> Start/end markers and an index block allow the decoder to adapt to compression artifacts and color shifts.
              </p>
            </div>
            <div className="flex gap-4">
              <span className="text-[var(--accent)] font-mono text-xs bg-[var(--surface)] w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border border-[var(--border)]">3</span>
              <p className="leading-relaxed">
                <strong className="text-[var(--foreground)] font-medium">Decoding:</strong> Upload any screenshot containing the border, and the UUID is automatically extracted by scanning for the encoded pattern.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--muted)]">
            A steganography experiment · Take a screenshot to preserve the UUID
          </p>
        </footer>
      </div>
    </main>
  );
}
