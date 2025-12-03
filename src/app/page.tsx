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
    <main className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto px-8 py-16">
        {/* Header */}
        <header className="flex justify-between items-baseline mb-20">
          <h1 className="text-2xl font-light tracking-wide text-[var(--foreground)]">
            Encode
          </h1>
          <Link 
            href="/decode"
            className="text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase"
          >
            Decode <span className="ml-1">→</span>
          </Link>
        </header>

        {/* Subtitle */}
        <p className="text-[var(--muted)] text-lg font-light mb-12 max-w-md leading-relaxed">
          Hidden data in plain sight. Your UUID is encoded into the subtle variations of the border below.
        </p>

        {/* Input */}
        <div className="mb-8">
          <UUIDInput 
            uuid={uuid}
            onRegenerate={regenerateUuid}
            placeholder="Type something..."
          />
        </div>

        {/* UUID Display */}
        <div className="pt-6 border-t border-[var(--border)]">
          <span className="text-xs tracking-widest uppercase text-[var(--muted)] block mb-3">
            Current UUID
          </span>
          <code className="mono text-sm text-[var(--accent)] tracking-wide">
            {uuid}
          </code>
        </div>
      </div>
    </main>
  );
}
