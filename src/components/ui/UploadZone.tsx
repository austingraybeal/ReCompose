'use client';

import { useState, useCallback, useRef } from 'react';
import { useScanLoader } from '@/hooks/useScanLoader';
import { useScanStore } from '@/lib/stores/scanStore';
import JSZip from 'jszip';
import { motion } from 'framer-motion';

interface FileSlot {
  label: string;
  accept: string;
  description: string;
  content: string | null;
  fileName: string | null;
}

/**
 * Upload zone supporting individual file selection or batch drag-and-drop.
 * Files can be added one at a time or all at once (including .zip).
 */
export default function UploadZone() {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<Record<string, FileSlot>>({
    obj: { label: 'OBJ Mesh', accept: '.obj', description: '3D body scan mesh', content: null, fileName: null },
    coreMeasures: { label: 'Core Measures CSV', accept: '.csv', description: 'Measurements & landmarks', content: null, fileName: null },
    bodyComp: { label: 'Body Composition CSV', accept: '.csv', description: 'Body fat %, BMI, weight...', content: null, fileName: null },
  });
  const { loadScan } = useScanLoader();
  const isLoading = useScanStore((s) => s.isLoading);
  const error = useScanStore((s) => s.error);
  const inputRefs = {
    obj: useRef<HTMLInputElement>(null),
    coreMeasures: useRef<HTMLInputElement>(null),
    bodyComp: useRef<HTMLInputElement>(null),
  };

  const classifyCSV = (content: string): 'coreMeasures' | 'bodyComp' => {
    const header = content.trim().split('\n')[0]?.toLowerCase() ?? '';
    if (header.includes('type') && header.includes('name') && (header.includes('value') || header.includes('x (mm)'))) {
      return 'coreMeasures';
    }
    return 'bodyComp';
  };

  const processFiles = useCallback(async (incoming: File[]) => {
    const updated = { ...files };

    for (const file of incoming) {
      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const zipFiles = Object.values(zip.files).filter(f => !f.dir);
        for (const zf of zipFiles) {
          const content = await zf.async('string');
          const name = zf.name.toLowerCase();
          if (name.endsWith('.obj')) {
            updated.obj = { ...updated.obj, content, fileName: zf.name };
          } else if (name.endsWith('.csv')) {
            const type = classifyCSV(content);
            updated[type] = { ...updated[type], content, fileName: zf.name };
          }
        }
      } else if (file.name.endsWith('.obj')) {
        updated.obj = { ...updated.obj, content: await file.text(), fileName: file.name };
      } else if (file.name.endsWith('.csv')) {
        const content = await file.text();
        const type = classifyCSV(content);
        updated[type] = { ...updated[type], content, fileName: file.name };
      }
    }

    setFiles(updated);

    // Auto-load if all three are present
    if (updated.obj.content && updated.coreMeasures.content && updated.bodyComp.content) {
      await loadScan(updated.obj.content, updated.coreMeasures.content, updated.bodyComp.content);
    }
  }, [files, loadScan]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  }, [processFiles]);

  const handleIndividualFile = useCallback((key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    if (fileList.length === 0) return;

    const file = fileList[0];
    file.text().then(content => {
      const updated = { ...files };
      if (key === 'obj') {
        updated.obj = { ...updated.obj, content, fileName: file.name };
      } else {
        // For CSVs, auto-detect type
        const type = classifyCSV(content);
        updated[type] = { ...updated[type], content, fileName: file.name };
      }
      setFiles(updated);

      if (updated.obj.content && updated.coreMeasures.content && updated.bodyComp.content) {
        loadScan(updated.obj.content, updated.coreMeasures.content, updated.bodyComp.content);
      }
    });
  }, [files, loadScan]);

  const allLoaded = files.obj.content && files.coreMeasures.content && files.bodyComp.content;
  const loadedCount = [files.obj.content, files.coreMeasures.content, files.bodyComp.content].filter(Boolean).length;

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Drag-and-drop zone */}
      <motion.div
        className="relative rounded-2xl p-6 text-center cursor-pointer transition-all duration-200"
        style={{
          background: dragOver ? 'rgba(62, 207, 180, 0.08)' : 'var(--rc-bg-surface)',
          border: dragOver ? '2px dashed var(--rc-accent)' : '2px dashed var(--rc-border-default)',
          boxShadow: dragOver ? 'var(--rc-shadow-glow)' : 'none',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        whileHover={{ scale: 1.005 }}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--rc-accent)', borderTopColor: 'transparent' }} />
            <span className="text-rc-sm" style={{ color: 'var(--rc-text-secondary)' }}>Processing scan data...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 48 48" stroke="currentColor" style={{ color: dragOver ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M24 4v28m0 0l-8-8m8 8l8-8M8 36v4a4 4 0 004 4h24a4 4 0 004-4v-4" />
            </svg>
            <p className="text-rc-base" style={{ color: 'var(--rc-text-primary)' }}>
              Drop all files here, or add individually below
            </p>
            <p className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
              .obj + 2 CSVs, or a .zip containing all three
            </p>
          </div>
        )}
      </motion.div>

      {/* Individual file slots */}
      <div className="mt-4 flex flex-col gap-2">
        {Object.entries(files).map(([key, slot]) => (
          <div
            key={key}
            className="flex items-center justify-between px-4 py-3 rounded-xl transition-all"
            style={{
              background: 'var(--rc-bg-surface)',
              border: slot.content
                ? '1px solid var(--rc-border-accent)'
                : '1px solid var(--rc-border-default)',
              boxShadow: slot.content ? '0 0 10px rgba(62, 207, 180, 0.1)' : 'none',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: slot.content ? 'var(--rc-accent)' : 'var(--rc-text-dim)' }}
              />
              <div>
                <div className="text-rc-sm font-body font-medium" style={{ color: 'var(--rc-text-primary)' }}>
                  {slot.label}
                </div>
                {slot.fileName ? (
                  <div className="text-rc-xs font-mono" style={{ color: 'var(--rc-accent)' }}>
                    {slot.fileName}
                  </div>
                ) : (
                  <div className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
                    {slot.description}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => inputRefs[key as keyof typeof inputRefs].current?.click()}
              className="px-3 py-1 rounded-lg text-rc-xs font-mono transition-colors"
              style={{
                background: slot.content ? 'var(--rc-accent-dim)' : 'var(--rc-bg-elevated)',
                color: slot.content ? 'var(--rc-accent)' : 'var(--rc-text-secondary)',
                border: '1px solid var(--rc-border-default)',
              }}
            >
              {slot.content ? 'Replace' : 'Choose'}
            </button>
            <input
              ref={inputRefs[key as keyof typeof inputRefs]}
              type="file"
              accept={slot.accept}
              onChange={(e) => handleIndividualFile(key, e)}
              className="hidden"
            />
          </div>
        ))}
      </div>

      {/* Status bar */}
      {loadedCount > 0 && !allLoaded && (
        <div className="mt-3 px-4 py-2 rounded-lg text-rc-sm text-center" style={{ background: 'var(--rc-accent-dim)', color: 'var(--rc-accent)' }}>
          {loadedCount}/3 files loaded — add the remaining to begin
        </div>
      )}

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

      <div className="mt-4 text-center">
        <p className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
          Your scan data never leaves your device.
        </p>
      </div>
    </div>
  );
}
