'use client';

import { useState, useCallback, useRef } from 'react';
import { useScanLoader } from '@/hooks/useScanLoader';
import { useScanStore } from '@/lib/stores/scanStore';
import JSZip from 'jszip';
import { motion } from 'framer-motion';

/**
 * Drag-and-drop upload zone that accepts .obj + two .csv files or a .zip.
 */
export default function UploadZone() {
  const [dragOver, setDragOver] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { loadScan } = useScanLoader();
  const isLoading = useScanStore((s) => s.isLoading);
  const error = useScanStore((s) => s.error);

  const processFiles = useCallback(async (files: File[]) => {
    let objText = '';
    let coreMeasuresText = '';
    let bodyCompText = '';
    const names: string[] = [];

    for (const file of files) {
      names.push(file.name);

      if (file.name.endsWith('.zip')) {
        // Extract from zip
        const zip = await JSZip.loadAsync(file);
        const zipFiles = Object.values(zip.files).filter(f => !f.dir);

        for (const zf of zipFiles) {
          const content = await zf.async('string');
          const name = zf.name.toLowerCase();
          if (name.endsWith('.obj')) {
            objText = content;
          } else if (name.endsWith('.csv')) {
            // Heuristic: body comp CSVs are smaller and have simpler structure
            const lines = content.trim().split('\n');
            const header = lines[0]?.toLowerCase() ?? '';
            if (header.includes('type') && header.includes('name') && (header.includes('value') || header.includes('x (mm)'))) {
              coreMeasuresText = content;
            } else {
              bodyCompText = content;
            }
          }
        }
      } else if (file.name.endsWith('.obj')) {
        objText = await file.text();
      } else if (file.name.endsWith('.csv')) {
        const content = await file.text();
        const header = content.trim().split('\n')[0]?.toLowerCase() ?? '';
        if (header.includes('type') && header.includes('name') && (header.includes('value') || header.includes('x (mm)'))) {
          coreMeasuresText = content;
        } else {
          bodyCompText = content;
        }
      }
    }

    setFileNames(names);

    if (!objText) {
      useScanStore.getState().setError('Missing .obj file');
      return;
    }
    if (!coreMeasuresText) {
      useScanStore.getState().setError('Missing Core Measures CSV');
      return;
    }
    if (!bodyCompText) {
      useScanStore.getState().setError('Missing Body Composition CSV');
      return;
    }

    await loadScan(objText, coreMeasuresText, bodyCompText);
  }, [loadScan]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  }, [processFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  return (
    <div className="w-full max-w-lg mx-auto">
      <motion.div
        className="relative rounded-panel p-8 text-center cursor-pointer transition-all duration-150"
        style={{
          background: dragOver ? 'var(--rc-accent-dim)' : 'var(--rc-bg-surface)',
          border: dragOver ? '2px dashed var(--rc-accent)' : '2px dashed var(--rc-border-default)',
          boxShadow: dragOver ? 'var(--rc-shadow-glow)' : 'none',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".obj,.csv,.zip"
          onChange={handleFileInput}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--rc-accent)', borderTopColor: 'transparent' }} />
            <span className="text-rc-sm" style={{ color: 'var(--rc-text-secondary)' }}>Processing scan data...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 48 48" stroke="currentColor" style={{ color: dragOver ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M24 4v28m0 0l-8-8m8 8l8-8M8 36v4a4 4 0 004 4h24a4 4 0 004-4v-4" />
            </svg>
            <div>
              <p className="text-rc-base font-body" style={{ color: 'var(--rc-text-primary)' }}>
                Drop your scan files here
              </p>
              <p className="text-rc-sm mt-1" style={{ color: 'var(--rc-text-dim)' }}>
                .obj + 2 CSVs, or a .zip containing all three
              </p>
            </div>
          </div>
        )}

        {fileNames.length > 0 && !isLoading && (
          <div className="mt-3 text-rc-xs font-mono" style={{ color: 'var(--rc-text-dim)' }}>
            {fileNames.join(', ')}
          </div>
        )}
      </motion.div>

      {error && (
        <motion.div
          className="mt-3 px-4 py-2 rounded-lg text-rc-sm"
          style={{ background: 'rgba(224, 68, 90, 0.12)', color: 'var(--rc-bf-very-high)', border: '1px solid rgba(224, 68, 90, 0.3)' }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      {/* Privacy notice */}
      <div className="mt-4 text-center">
        <p className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
          🔒 Your scan data never leaves your device.
        </p>
      </div>
    </div>
  );
}
