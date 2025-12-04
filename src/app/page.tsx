'use client';

import { generateUuid } from '@/lib/uuid-border';
import Link from 'next/link';
import { UUIDInput, ColorVisualization } from '@/components/UUIDInput';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useCallback, useState, useRef } from 'react';
import html2canvas from 'html2canvas';

export default function EncoderPage() {
  const [uuid, setUuid] = useState(generateUuid());
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  const regenerateUuid = useCallback(() => {
    setUuid(generateUuid());
  }, []);

  const handleUuidChange = useCallback((newUuid: string) => {
    setUuid(newUuid);
  }, []);

  const downloadScreenshot = useCallback(async () => {
    if (!inputContainerRef.current) return;
    
    setDownloading(true);
    try {
      const canvas = await html2canvas(inputContainerRef.current, {
        backgroundColor: null,
        scale: 2,
      });
      
      const link = document.createElement('a');
      link.download = `uuid-border-${uuid.slice(0, 8)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
    }
    setDownloading(false);
  }, [uuid]);

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-md animate-color-cycle" />
            <h1 className="text-2xl font-light tracking-wide text-[var(--foreground)]">
              UUID Border
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link 
              href="/decode"
              className="ml-4 text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase flex items-center gap-2"
            >
              Decode <span className="text-lg">→</span>
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <div className="mb-16 stagger-children">
          <h2 className="text-4xl font-light mb-6 leading-tight gradient-text">
            Hidden data<br />in plain sight
          </h2>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Your UUID is encoded into the subtle color variations of the border below. 
            Screenshot it, share it, and decode it later.
          </p>
        </div>

        {/* Input Section */}
        <div className="mb-8 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div ref={inputContainerRef} className="bg-[var(--background)] p-1">
            <UUIDInput 
              uuid={uuid}
              onRegenerate={regenerateUuid}
              onUuidChange={handleUuidChange}
              placeholder="Type anything here..."
            />
          </div>
        </div>

        {/* Color Visualization */}
        <div className="mb-8 animate-fade-in" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
              Encoded Colors (84 segments)
            </span>
            <button
              onClick={downloadScreenshot}
              disabled={downloading}
              className="text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
            >
              {downloading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download
                </>
              )}
            </button>
          </div>
          <ColorVisualization uuid={uuid} />
        </div>

        {/* UUID Display */}
        <div className="pt-6 border-t border-[var(--border)] animate-fade-in" style={{ animationDelay: '400ms' }}>
          <span className="text-xs tracking-widest uppercase text-[var(--muted)] block mb-3">
            Current UUID
          </span>
          <code className="mono text-sm text-[var(--accent)] tracking-wide break-all">
            {uuid}
          </code>
        </div>

        {/* How It Works Section */}
        <div className="mt-16 animate-fade-in" style={{ animationDelay: '500ms' }}>
          <button
            onClick={() => setShowHowItWorks(!showHowItWorks)}
            className="flex items-center gap-2 text-sm tracking-wider uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg 
              className={`w-4 h-4 transition-transform ${showHowItWorks ? 'rotate-90' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            How it works
          </button>
          
          {showHowItWorks && (
            <div className="mt-6 p-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-slide-in">
              <div className="space-y-6 text-sm text-[var(--muted)]">
                <div>
                  <h4 className="font-medium text-[var(--foreground)] mb-2">8-Color Encoding</h4>
                  <p>Each UUID is converted into a sequence of 8 distinct colors. These colors differ only slightly in their RGB values, making them nearly invisible to the human eye but perfectly readable by a computer.</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-[var(--foreground)] mb-2">Self-Calibrating</h4>
                  <p>The border includes a calibration section with all 8 index colors, allowing the decoder to adapt to compression artifacts and color shifts from screenshots.</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-[var(--foreground)] mb-2">Start & End Markers</h4>
                  <p>Special marker patterns at the beginning and end ensure reliable detection even in complex images with multiple elements.</p>
                </div>

                <div className="pt-4 border-t border-[var(--border)]">
                  <h4 className="font-medium text-[var(--foreground)] mb-3">Color Palette</h4>
                  <div className="grid grid-cols-8 gap-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                      const BASE = 133;
                      const OFFSET = 10;
                      const r = BASE + ((i & 1) ? OFFSET : -OFFSET);
                      const g = BASE + ((i & 2) ? OFFSET : -OFFSET);
                      const b = BASE + ((i & 4) ? OFFSET : -OFFSET);
                      return (
                        <div key={i} className="text-center">
                          <div
                            className="w-full aspect-square rounded-sm mb-1"
                            style={{ backgroundColor: `rgb(${r}, ${g}, ${b})` }}
                          />
                          <span className="text-xs mono">{i}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--muted)] tracking-wide">
            A steganography experiment • Take a screenshot to encode
          </p>
        </footer>
      </div>
    </main>
  );
}
