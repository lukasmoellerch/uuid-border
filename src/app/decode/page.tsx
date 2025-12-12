'use client';

import Link from 'next/link';
import { useState, useCallback, useRef } from 'react';
import { RGB, TOTAL_SEGMENTS, decodeFromPixelRow, findEncodingByMarkers, isEncodedColor } from '@/lib/uuid-border';
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
      className="min-h-screen relative"
      onPaste={handlePaste}
      tabIndex={0}
    >
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center glass rounded-2xl px-6 py-3 border border-[var(--border)]">
            <div className="flex items-center gap-2">
              <Link 
                href="/"
                className="btn-ghost text-xs tracking-wider"
              >
                Encode
              </Link>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
              <span className="text-sm font-medium tracking-wide text-[var(--foreground)]">
                Decoder
              </span>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-6 pt-32 pb-20">
        {/* Hero Section */}
        <div className="space-y-6 mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 badge mb-4">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 7l-3.2 9h1.9l.7-2h3.2l.7 2h1.9L13 7h-2zm-.15 5.65L12 9l1.15 3.65h-2.3zM20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zm-2 5.79V18h-3.52L12 20.48 9.52 18H6v-3.52L3.52 12 6 9.52V6h3.52L12 3.52 14.48 6H18v3.52L20.48 12 18 14.48z"/>
            </svg>
            <span>Extract</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-light tracking-tight text-[var(--foreground)] leading-[1.1]">
            Reveal the{' '}
            <span className="gradient-text font-normal">hidden</span>
          </h1>
          
          <p className="text-lg text-[var(--muted)] font-light leading-relaxed max-w-lg">
            Drop a screenshot to extract encoded UUIDs. Paste from clipboard with{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-xs mono">⌘V</kbd>
          </p>
        </div>

        {/* Drop Zone */}
        <div 
          className="animate-fade-in-up stagger-2" 
          style={{ opacity: 0 }}
        >
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div className="relative z-10 flex flex-col items-center gap-4">
              {/* Icon */}
              <div className={`
                w-16 h-16 rounded-2xl flex items-center justify-center
                bg-[var(--surface)] border border-[var(--border)]
                transition-all duration-300
                ${isDragging ? 'scale-110 border-[var(--accent)]' : ''}
              `}>
                {isDragging ? (
                  <svg className="w-7 h-7 text-[var(--accent)] animate-float" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                )}
              </div>
              
              {/* Text */}
              <div className="text-center">
                <p className={`
                  text-base font-light transition-colors duration-300
                  ${isDragging ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}
                `}>
                  {isDragging ? 'Release to decode' : 'Drop image or click to browse'}
                </p>
                <p className="text-sm text-[var(--muted)] opacity-60 mt-1">
                  PNG, JPEG, WebP supported
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Results */}
        {(image || isProcessing || decodedUuids.length > 0 || debugInfo) && (
          <div className="mt-10 space-y-6 animate-fade-in">
            {/* Preview */}
            {image && (
              <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background-secondary)]">
                  <span className="text-xs tracking-wider uppercase text-[var(--muted)]">
                    Preview
                  </span>
                  <button
                    onClick={clearImage}
                    className="text-xs tracking-wider uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </button>
                </div>
                
                {/* Image */}
                <div className="p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={image} 
                    alt="Screenshot" 
                    className="max-w-full h-auto rounded-lg"
                  />
                </div>
              </div>
            )}

            {/* Processing */}
            {isProcessing && (
              <div className="flex items-center justify-center gap-3 py-8">
                <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin-slow" />
                <p className="text-[var(--muted)] font-light">
                  Scanning for hidden data...
                </p>
              </div>
            )}

            {/* Decoded UUIDs */}
            {decodedUuids.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                  <span className="text-xs tracking-widest uppercase text-[var(--muted)]">
                    {decodedUuids.length === 1 ? '1 UUID discovered' : `${decodedUuids.length} UUIDs discovered`}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {decodedUuids.map((uuid, index) => (
                    <div 
                      key={index}
                      className="group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] card-hover"
                    >
                      {/* Success indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--success)] to-[var(--accent)]" />
                      
                      <div className="flex items-center justify-between p-4 pl-5">
                        <code className="mono text-base text-[var(--foreground)] tracking-wide">
                          {uuid}
                        </code>
                        
                        <button
                          onClick={() => copyUuid(uuid, index)}
                          className="icon-btn ml-3"
                          title={copiedIndex === index ? 'Copied!' : 'Copy UUID'}
                        >
                          {copiedIndex === index ? (
                            <svg className="w-4 h-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Debug info - only when no results */}
            {debugInfo && !isProcessing && decodedUuids.length === 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  <span className="text-xs tracking-wider uppercase text-[var(--muted)]">
                    No UUIDs found
                  </span>
                </div>
                <p className="mono text-xs text-[var(--muted)] opacity-70 whitespace-pre-line leading-relaxed">
                  {debugInfo}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!image && !isProcessing && decodedUuids.length === 0 && (
          <div className="mt-16 animate-fade-in-up stagger-3" style={{ opacity: 0 }}>
            <h2 className="text-xs tracking-widest uppercase text-[var(--muted)] mb-6">
              Quick tips
            </h2>
            
            <div className="grid gap-4">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                  ),
                  title: 'Paste from clipboard',
                  description: 'Use ⌘V / Ctrl+V to paste screenshots directly',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  ),
                  title: 'Error correction',
                  description: 'Works with JPEG compression, noise, and scaling',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                  ),
                  title: 'Round-trip safe',
                  description: 'Encode → Screenshot → Decode reliably',
                },
              ].map((tip, index) => (
                <div 
                  key={index}
                  className="flex gap-4 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] card-hover"
                >
                  <div className="text-[var(--accent)] opacity-70">
                    {tip.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-[var(--foreground)] mb-0.5">
                      {tip.title}
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                      {tip.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span>A steganography experiment</span>
            <Link 
              href="/" 
              className="inline-flex items-center gap-2 hover:text-[var(--accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Create new encoding
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
