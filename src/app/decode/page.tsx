'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow } from '@/lib/uuid-border';

export default function DecodePage() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedUuids, setDecodedUuids] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage(dataUrl);
      decodeFromImage(dataUrl);
    };
    reader.onerror = () => {
      setDebugInfo('Failed to read file');
    };
    reader.readAsDataURL(file);
  }, []);

  const decodeFromImage = useCallback((dataUrl: string) => {
    setIsProcessing(true);
    setDecodedUuids([]);
    setDebugInfo('');

    const img = new Image();
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
        setDebugInfo(debug || 'No UUIDs found');
      }
    };
    img.onerror = () => {
      setIsProcessing(false);
      setDebugInfo('Failed to load image');
    };
    img.src = dataUrl;
  }, []);

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
                debugLines.push(`Found at y=${y}, x=${startX}, w=${encodedWidth}${result.endMarkerMatch ? '' : ' (end marker mismatch)'}`);
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

  const copyUuid = (uuid: string, index: number) => {
    navigator.clipboard.writeText(uuid);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const clearImage = () => {
    setImage(null);
    setDecodedUuids([]);
    setDebugInfo('');
  };

  return (
    <main 
      className="min-h-screen relative noise"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Decorative elements */}
      <div className="absolute top-40 right-20 w-80 h-80 bg-[var(--accent-secondary)]/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-40 left-20 w-72 h-72 bg-[var(--accent)]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-2xl mx-auto px-6 py-20 relative">
        {/* Header */}
        <header className="flex justify-between items-center mb-16 fade-in">
          <Link 
            href="/" 
            className="
              group flex items-center gap-2 px-4 py-2 rounded-full
              text-sm tracking-wider text-[var(--muted)] 
              hover:text-[var(--foreground)] 
              bg-[var(--surface)] hover:bg-[var(--surface-elevated)]
              border border-[var(--border)] hover:border-[var(--accent)]/30
              transition-all duration-300
            "
          >
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Encode</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent)] flex items-center justify-center shadow-lg shadow-[var(--accent-secondary)]/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-xl font-light tracking-wide text-[var(--foreground)]">
              Decode
            </span>
          </div>
        </header>

        {/* Hero section */}
        <div className="mb-12 fade-in-delay-1">
          <h1 className="text-5xl md:text-6xl font-light tracking-tight mb-6 leading-[1.1]">
            <span className="text-[var(--foreground)]">Extract</span>
            <br />
            <span className="text-gradient">hidden UUIDs</span>
          </h1>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Drop a screenshot or paste from clipboard to discover embedded UUIDs hidden in the image.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !image && fileInputRef.current?.click()}
          className={`
            glass-card overflow-hidden transition-all duration-300 fade-in-delay-2
            ${!image ? 'cursor-pointer' : ''}
            ${isDragging ? 'glow border-[var(--accent)]/50' : 'glow-hover'}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          {!image ? (
            <div className="py-24 px-8 text-center">
              <div className={`
                w-20 h-20 mx-auto mb-6 rounded-2xl 
                bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 
                flex items-center justify-center
                transition-transform duration-300
                ${isDragging ? 'scale-110' : ''}
              `}>
                <svg className="w-10 h-10 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[var(--foreground)] text-lg font-light mb-2">
                {isDragging ? 'Release to decode...' : 'Drop image here'}
              </p>
              <p className="text-[var(--muted)] text-sm">
                or click to browse • paste from clipboard
              </p>
              <div className="flex items-center justify-center gap-3 mt-6 text-xs text-[var(--muted)]/60">
                <span className="px-2 py-1 rounded bg-[var(--surface-elevated)] border border-[var(--border)]">⌘V</span>
                <span>to paste</span>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="p-4">
                <img 
                  src={image} 
                  alt="Screenshot" 
                  className="max-w-full h-auto rounded-lg"
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearImage();
                }}
                className="absolute top-6 right-6 p-2 rounded-lg bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 transition-all"
                title="Clear image"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-8 space-y-6 fade-in">
            {/* Processing */}
            {isProcessing && (
              <div className="glass-card p-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-secondary)]/20 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div>
                    <p className="text-[var(--foreground)] font-light">Scanning image...</p>
                    <p className="text-[var(--muted)] text-sm">Looking for hidden data</p>
                  </div>
                </div>
              </div>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
                    Discovered {decodedUuids.length} {decodedUuids.length === 1 ? 'UUID' : 'UUIDs'}
                  </span>
                </div>
                {decodedUuids.map((uuid, index) => (
                  <div 
                    key={index}
                    className="glass-card p-5 glow-hover group"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400/20 to-emerald-400/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <code className="mono text-sm text-[var(--accent)] tracking-wide break-all">
                          {uuid}
                        </code>
                      </div>
                      <button
                        onClick={() => copyUuid(uuid, index)}
                        className="btn-ghost flex-shrink-0"
                      >
                        {copiedIndex === index ? (
                          <span className="text-green-400 text-xs tracking-wider uppercase">Copied!</span>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!isProcessing && decodedUuids.length === 0 && debugInfo && (
              <div className="glass-card p-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400/20 to-amber-400/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[var(--foreground)] font-light mb-1">No UUIDs found</p>
                    <p className="mono text-xs text-[var(--muted)]/70 whitespace-pre-line leading-relaxed">
                      {debugInfo}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-12 text-center fade-in-delay-3">
          <p className="text-[var(--muted)]/60 text-sm font-light">
            Need to encode a new UUID?{' '}
            <Link href="/" className="text-[var(--accent)] hover:text-[var(--accent-secondary)] transition-colors">
              Go to Encode
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
