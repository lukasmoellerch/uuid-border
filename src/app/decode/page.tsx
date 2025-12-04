'use client';

import Link from 'next/link';
import { useState, useCallback, useRef, useEffect } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from '@/lib/uuid-border';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function DecodePage() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedUuids, setDecodedUuids] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Auto-focus for paste support
  useEffect(() => {
    mainRef.current?.focus();
  }, []);

  const decodeFromImageData = useCallback((dataUrl: string) => {
    setIsProcessing(true);
    setDecodedUuids([]);
    setDebugInfo('');

    const img = new window.Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      
      const { found, debug } = scanForEncodedBorders(imageData);
      
      setDecodedUuids(found);
      setIsProcessing(false);
      
      if (found.length === 0) {
        setDebugInfo(debug || 'No UUIDs found in image');
      }
    };
    img.onerror = () => {
      setIsProcessing(false);
      setDebugInfo('Failed to load image');
    };
    img.src = dataUrl;
  }, []);

  const processImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage(dataUrl);
      decodeFromImageData(dataUrl);
    };
    reader.onerror = () => {
      setDebugInfo('Failed to read file');
    };
    reader.readAsDataURL(file);
  }, [decodeFromImageData]);

  const scanForEncodedBorders = (imageData: ImageData): { found: string[], debug: string } => {
    const found: string[] = [];
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const debugLines: string[] = [];

    const getPixel = (x: number, y: number): RGB => {
      const idx = (y * width + x) * 4;
      return {
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
      };
    };

    const isBorderColor = (c: RGB): boolean => {
      const avg = (c.r + c.g + c.b) / 3;
      return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
    };

    const processedRows = new Set<number>();
    let candidatesFound = 0;

    for (let y = 0; y < height; y++) {
      let skipRow = false;
      for (let dy = -3; dy <= 3; dy++) {
        if (processedRows.has(y + dy)) {
          skipRow = true;
          break;
        }
      }
      if (skipRow) continue;

      for (let x = 0; x < width - 100; x++) {
        const pixel = getPixel(x, y);
        
        if (!isBorderColor(pixel)) continue;

        let borderEnd = x;
        while (borderEnd < width && isBorderColor(getPixel(borderEnd, y))) {
          borderEnd++;
        }
        const borderWidth = borderEnd - x;
        
        if (borderWidth < TOTAL_SEGMENTS) {
          x = borderEnd;
          continue;
        }

        candidatesFound++;

        const possibleEncodedWidths = [
          borderWidth,
          Math.floor(borderWidth * 0.95),
          Math.floor(borderWidth * 0.90),
          Math.floor(borderWidth * 0.85),
        ].filter(w => w >= TOTAL_SEGMENTS);

        const possibleOffsets = [0, 5, 10, 15, 20, 25, 30];

        let foundDecode = false;
        for (const encodedWidth of possibleEncodedWidths) {
          if (foundDecode) break;
          for (const offset of possibleOffsets) {
            if (foundDecode) break;
            
            const startX = x + offset;
            if (startX + encodedWidth > width) continue;

            const result = decodeFromPixelRow(
              (px) => getPixel(px, y),
              startX,
              encodedWidth
            );

            if (result) {
              if (debugLines.length < 3) {
                debugLines.push(`Found at y=${y}, x=${startX}, w=${encodedWidth}${result.endMarkerMatch ? '' : ' (partial)'}`);
              }
              
              if (!found.includes(result.uuid)) {
                found.push(result.uuid);
                processedRows.add(y);
              }
              foundDecode = true;
            }
          }
        }

        x = borderEnd;
      }
    }

    let debug = '';
    if (found.length === 0) {
      debug = `Scanned ${height} rows, found ${candidatesFound} border candidates`;
      if (debugLines.length > 0) {
        debug += '\n' + debugLines.join('\n');
      }
    } else if (debugLines.length > 0) {
      debug = debugLines.join('\n');
    }

    return { found, debug };
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  }, [processImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          processImage(file);
        }
        break;
      }
    }
  }, [processImage]);

  const copyUuid = useCallback((uuid: string, index: number) => {
    navigator.clipboard.writeText(uuid);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const clearImage = useCallback(() => {
    setImage(null);
    setDecodedUuids([]);
    setDebugInfo('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return (
    <main 
      ref={mainRef}
      className="min-h-screen bg-[var(--background)] outline-none"
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="max-w-2xl mx-auto px-8 py-12">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 animate-fade-in">
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="text-sm tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors uppercase flex items-center gap-2"
            >
              <span className="text-lg">←</span> Encode
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-light tracking-wide text-[var(--foreground)]">
              Decode
            </h1>
            <ThemeToggle />
          </div>
        </header>

        {/* Subtitle */}
        <div className="mb-12 stagger-children">
          <h2 className="text-3xl font-light mb-4 leading-tight gradient-text">
            Extract hidden data
          </h2>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Drop an image or paste from your clipboard. We&apos;ll scan for encoded UUIDs in the borders.
          </p>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="mb-6 flex items-center gap-2 text-xs text-[var(--muted)]">
          <kbd className="px-2 py-1 bg-[var(--surface)] border border-[var(--border)] rounded text-[10px] font-mono">
            ⌘V
          </kbd>
          <span>to paste from clipboard</span>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            cursor-pointer border-2 border-dashed transition-all duration-300 rounded-lg
            ${isDragging 
              ? 'border-[var(--accent)] bg-[var(--surface)] scale-[1.02]' 
              : 'border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface)]/50'
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="py-16 px-8 text-center">
            <div className="mb-4">
              <svg className={`w-12 h-12 mx-auto text-[var(--muted)] transition-transform ${isDragging ? 'scale-110' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[var(--muted)] text-base font-light">
              {isDragging ? 'Release to decode...' : 'Drop image here or click to browse'}
            </p>
            <p className="text-[var(--muted)]/60 text-sm mt-2">
              PNG, JPEG, or screenshot
            </p>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(image || isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-12 space-y-8 animate-fade-in">
            {/* Preview */}
            {image && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); clearImage(); }}
                  className="absolute -top-3 -right-3 z-10 p-2 bg-[var(--surface)] border border-[var(--border)] rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-all shadow-sm"
                  title="Clear image"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="border border-[var(--border)] p-3 rounded-lg bg-[var(--surface)] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={image} 
                    alt="Uploaded screenshot for UUID decoding" 
                    className="max-w-full h-auto rounded"
                  />
                </div>
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="flex items-center gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                <svg className="w-5 h-5 text-[var(--accent)] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-[var(--muted)] text-base font-light">
                  Scanning for hidden data...
                </p>
              </div>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm tracking-wider uppercase text-[var(--foreground)]">
                    Found {decodedUuids.length} UUID{decodedUuids.length > 1 ? 's' : ''}
                  </span>
                </div>
                {decodedUuids.map((uuid, index) => (
                  <div 
                    key={index}
                    className="group flex items-center justify-between p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:border-[var(--accent)]/50 transition-all hover-lift"
                  >
                    <code className="mono text-sm text-[var(--accent)] tracking-wide break-all">
                      {uuid}
                    </code>
                    <button
                      onClick={() => copyUuid(uuid, index)}
                      className="ml-4 p-2 text-[var(--muted)] hover:text-[var(--accent)] transition-colors shrink-0"
                      title="Copy UUID"
                    >
                      {copiedIndex === index ? (
                        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.25}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* No results found */}
            {!isProcessing && image && decodedUuids.length === 0 && (
              <div className="flex items-start gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-[var(--foreground)] font-medium mb-1">No UUIDs found</p>
                  <p className="text-[var(--muted)] text-sm">
                    Make sure the image contains a UUID Border input element. The border encoding may have been lost due to heavy compression.
                  </p>
                </div>
              </div>
            )}

            {/* Debug info */}
            {debugInfo && !isProcessing && decodedUuids.length === 0 && (
              <details className="text-xs text-[var(--muted)]/70">
                <summary className="cursor-pointer hover:text-[var(--muted)] transition-colors">
                  Technical details
                </summary>
                <pre className="mt-2 p-3 bg-[var(--surface)] border border-[var(--border)] rounded mono whitespace-pre-wrap">
                  {debugInfo}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-[var(--border)] text-center">
          <p className="text-xs text-[var(--muted)] tracking-wide">
            Paste a screenshot to extract hidden UUIDs
          </p>
        </footer>
      </div>
    </main>
  );
}
