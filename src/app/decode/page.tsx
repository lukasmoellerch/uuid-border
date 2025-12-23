'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow, findEncodingByMarkers, isEncodedColor } from '@/lib/uuid-border';

export default function DecodePage() {
  const [image, setImage] = useState<string | null>(null);
  const [decodedUuids, setDecodedUuids] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Define scanForEncodedBorders first (no dependencies on other functions)
  const scanForEncodedBorders = useCallback((imageData: ImageData): { found: string[], debug: string } => {
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

    // Check if a color looks like a border color (grayish)
    const isBorderColor = (c: RGB): boolean => {
      const avg = (c.r + c.g + c.b) / 3;
      return avg > 100 && avg < 180 && Math.abs(c.g - c.b) < 30;
    };

    const processedRows = new Set<number>();
    let candidatesFound = 0;

    for (let y = 0; y < height; y++) {
      // Skip if we already found something on nearby rows
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
        
        // Look for border-like pixels (either general gray or encoded colors)
        if (!isBorderColor(pixel) && !isEncodedColor(pixel)) continue;

        // Find the extent of this border region
        let borderEnd = x;
        while (borderEnd < width && (isBorderColor(getPixel(borderEnd, y)) || isEncodedColor(getPixel(borderEnd, y)))) {
          borderEnd++;
        }
        const borderWidth = borderEnd - x;
        
        // Need enough width for all segments (at least 148 pixels)
        if (borderWidth < TOTAL_SEGMENTS) {
          x = borderEnd;
          continue;
        }

        candidatesFound++;

        // Multi-row voting: Try marker detection on multiple rows
        // and use consensus to handle cases where some rows have damage.
        // This is more robust than single-row detection.
        const rowsToTry = [y];
        // Add adjacent rows if they're in the border region
        for (const dy of [1, 2, -1, -2]) {
          const adjY = y + dy;
          if (adjY >= 0 && adjY < height && !processedRows.has(adjY)) {
            // Quick check if this row also has border-like pixels
            const adjPixel = getPixel(x + 5, adjY);
            if (isBorderColor(adjPixel) || isEncodedColor(adjPixel)) {
              rowsToTry.push(adjY);
            }
          }
        }

        // Collect encoding parameters from all rows that successfully detect markers
        const detections: Array<{ startX: number; segmentWidth: number; row: number }> = [];
        
        for (const testY of rowsToTry) {
          // Use ratio-based marker detection (like QR codes/barcodes)
          // This finds start/end markers by analyzing run lengths and their ratios,
          // making it scale-invariant without any hardcoded offsets.
          const encodingLocation = findEncodingByMarkers(
            (px) => getPixel(px, testY),
            x,
            borderEnd
          );
          
          if (encodingLocation) {
            detections.push({
              ...encodingLocation,
              row: testY,
            });
          }
        }

        // If we have detections, use the most common parameters (voting)
        if (detections.length > 0) {
          // Find consensus on segment width (round to nearest integer for grouping)
          const widthVotes = new Map<number, number>();
          for (const d of detections) {
            const roundedWidth = Math.round(d.segmentWidth);
            widthVotes.set(roundedWidth, (widthVotes.get(roundedWidth) || 0) + 1);
          }
          
          // Find the most voted segment width
          let bestWidth = detections[0].segmentWidth;
          let bestVotes = 0;
          for (const [w, votes] of widthVotes) {
            if (votes > bestVotes) {
              bestVotes = votes;
              bestWidth = w;
            }
          }
          
          // Find consensus on startX among detections with similar segment width
          const startXVotes = new Map<number, number>();
          for (const d of detections) {
            if (Math.abs(d.segmentWidth - bestWidth) <= 1) {
              // Group startX by small ranges
              const roundedX = Math.round(d.startX / 2) * 2;
              startXVotes.set(roundedX, (startXVotes.get(roundedX) || 0) + 1);
            }
          }
          
          let bestStartX = detections[0].startX;
          bestVotes = 0;
          for (const [sx, votes] of startXVotes) {
            if (votes > bestVotes) {
              bestVotes = votes;
              bestStartX = sx;
            }
          }

          const encodedWidth = Math.round(bestWidth) * TOTAL_SEGMENTS;
          
          // Try to decode using each row until one succeeds
          let decoded = false;
          for (const testY of rowsToTry) {
            const result = decodeFromPixelRow(
              (px) => getPixel(px, testY),
              bestStartX,
              encodedWidth
            );

            if (result) {
              if (debugLines.length < 3) {
                debugLines.push(`Found at y=${testY}, x=${bestStartX}, segW=${Math.round(bestWidth)} (${detections.length} rows voted)${result.endMarkerMatch ? '' : ' (end marker mismatch)'}`);
              }
              
              if (!found.includes(result.uuid)) {
                found.push(result.uuid);
                // Mark all tested rows as processed
                for (const r of rowsToTry) {
                  processedRows.add(r);
                }
              }
              decoded = true;
              break;
            }
          }
          
          // If voting-based decode failed, try each detection individually
          if (!decoded) {
            for (const d of detections) {
              const result = decodeFromPixelRow(
                (px) => getPixel(px, d.row),
                d.startX,
                Math.round(d.segmentWidth) * TOTAL_SEGMENTS
              );

              if (result) {
                if (debugLines.length < 3) {
                  debugLines.push(`Found at y=${d.row}, x=${d.startX}, segW=${Math.round(d.segmentWidth)} (individual)${result.endMarkerMatch ? '' : ' (end marker mismatch)'}`);
                }
                
                if (!found.includes(result.uuid)) {
                  found.push(result.uuid);
                  processedRows.add(d.row);
                }
                decoded = true;
                break;
              }
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
  }, []);

  // Define decodeFromImage next (depends on scanForEncodedBorders)
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
  }, [scanForEncodedBorders]);

  // Define processImage last (depends on decodeFromImage)
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
  }, [decodeFromImage]);

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
  }, []);

  return (
    <main 
      className="min-h-screen relative overflow-hidden"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-gradient-to-bl from-[var(--accent-secondary)]/10 to-transparent blur-3xl pointer-events-none" />
      
      <div className="max-w-2xl mx-auto px-8 py-16 relative">
        {/* Header */}
        <header className="flex justify-between items-center mb-16">
          <Link 
            href="/" 
            className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all duration-300"
          >
            <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent)] group-hover:-translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm tracking-wider text-[var(--muted)] group-hover:text-[var(--foreground)] transition-colors">
              Encode
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent)] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-lg font-light tracking-wide">Decode</span>
          </div>
        </header>

        {/* Hero section */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-light tracking-tight mb-6">
            <span className="text-[var(--foreground)]">Extract</span>
            <br />
            <span className="gradient-text">hidden UUIDs</span>
          </h1>
          <p className="text-[var(--muted)] text-lg font-light max-w-md leading-relaxed">
            Drop a screenshot or paste from your clipboard to reveal the encoded data.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            card cursor-pointer transition-all duration-300 overflow-hidden
            ${isDragging 
              ? 'border-[var(--accent)] glow' 
              : 'hover:border-[var(--accent)]/30'
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
          
          <div className="py-16 px-8 text-center relative">
            {/* Upload icon */}
            <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300 ${
              isDragging ? 'bg-[var(--accent)]/20 scale-110' : 'bg-[var(--surface-hover)]'
            }`}>
              <svg className={`w-8 h-8 transition-colors ${isDragging ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            
            <p className="text-[var(--foreground)] text-base mb-2">
              {isDragging ? 'Release to decode...' : 'Drop image here'}
            </p>
            <p className="text-[var(--muted)] text-sm">
              or click to browse · <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-xs">⌘V</kbd> to paste
            </p>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(image || isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-8 space-y-6">
            {/* Preview */}
            {image && (
              <div className="card p-4 relative group">
                <button
                  onClick={(e) => { e.stopPropagation(); clearImage(); }}
                  className="absolute top-6 right-6 p-2 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                  title="Clear image"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <img 
                  src={image} 
                  alt="Screenshot" 
                  className="max-w-full h-auto rounded-lg"
                />
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="card p-6 pulse-glow">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--accent)] animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[var(--foreground)]">Scanning image...</p>
                    <p className="text-sm text-[var(--muted)]">Looking for encoded borders</p>
                  </div>
                </div>
              </div>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--success)]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm tracking-wide text-[var(--foreground)]">
                    Found {decodedUuids.length} {decodedUuids.length === 1 ? 'UUID' : 'UUIDs'}
                  </span>
                </div>
                
                {decodedUuids.map((uuid, index) => (
                  <div 
                    key={index}
                    className="card p-4 flex items-center justify-between gap-4"
                  >
                    <code className="mono text-sm md:text-base text-[var(--accent)] tracking-wide break-all">
                      {uuid}
                    </code>
                    <button
                      onClick={() => copyUuid(uuid, index)}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm transition-all ${
                        copiedIndex === index 
                          ? 'bg-[var(--success)]/20 text-[var(--success)]' 
                          : 'bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      {copiedIndex === index ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Debug info */}
            {debugInfo && !isProcessing && decodedUuids.length === 0 && (
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[var(--muted)]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm text-[var(--foreground)]">No UUIDs detected</span>
                </div>
                <p className="mono text-xs text-[var(--muted)] whitespace-pre-line leading-relaxed pl-11">
                  {debugInfo}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tips section */}
        <div className="mt-16 pt-8 border-t border-[var(--border)]">
          <h2 className="text-sm tracking-widest uppercase text-[var(--muted)] mb-6">Tips</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-lg bg-[var(--surface)]/50 flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-[var(--muted)]">Take a screenshot of the entire input field with its border visible</p>
            </div>
            <div className="p-4 rounded-lg bg-[var(--surface)]/50 flex items-start gap-3">
              <svg className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <p className="text-sm text-[var(--muted)]">Higher resolution screenshots improve detection accuracy</p>
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
