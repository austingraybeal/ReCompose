'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import {
  SOCIO_ITEMS,
  SOCIO_SECTIONS,
  LIKERT_LABELS,
  scoreSociocultural,
  socioComplete,
  type SocioResponse,
  type SocioSection,
} from '@/lib/assessment/socioculturalItems';

/**
 * Sociocultural / appearance-exposure questionnaire, administered after
 * the adjustment tasks. Subscale scores export alongside the segmental
 * distortion vector.
 */
export default function SocioculturalForm() {
  const submitSociocultural = useAssessmentStore((s) => s.submitSociocultural);
  const [responses, setResponses] = useState<Record<string, SocioResponse>>({});
  const startedAt = useRef(Date.now());

  const setResponse = (id: string, value: SocioResponse) =>
    setResponses((r) => ({ ...r, [id]: value }));

  const toggleMulti = (id: string, option: string) => {
    const current = (responses[id] as string[] | undefined) ?? [];
    setResponse(
      id,
      current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option],
    );
  };

  const complete = socioComplete(responses);

  const handleSubmit = () => {
    if (!complete) return;
    submitSociocultural({
      responses,
      subscales: scoreSociocultural(responses),
      durationMs: Date.now() - startedAt.current,
    });
  };

  const sections: SocioSection[] = ['usage', 'exposure', 'comparison', 'editing', 'engagement'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 overflow-y-auto py-6"
      style={{ background: 'rgba(10, 11, 15, 0.97)', backdropFilter: 'blur(24px)' }}
    >
      <div className="max-w-lg mx-auto px-4">
        <div
          className="p-6 rounded-2xl"
          style={{
            background: 'var(--rc-bg-elevated)',
            border: '1px solid var(--rc-border-default)',
          }}
        >
          <h2 className="font-mono font-bold text-lg mb-1" style={{ color: 'var(--rc-text-primary)' }}>
            Media & Appearance
          </h2>
          <p className="text-rc-xs mb-5" style={{ color: 'var(--rc-text-secondary)' }}>
            A few quick questions about social media and appearance-related content.
            There are no right or wrong answers.
          </p>

          {sections.map((section) => {
            const items = SOCIO_ITEMS.filter((i) => i.section === section);
            return (
              <div key={section} className="mb-5">
                <div
                  className="text-[10px] uppercase tracking-[2px] font-mono mb-2.5"
                  style={{ color: 'var(--rc-accent)' }}
                >
                  {SOCIO_SECTIONS[section]}
                </div>

                {items.map((item) => (
                  <div key={item.id} className="mb-3.5">
                    <div className="text-rc-sm mb-1.5" style={{ color: 'var(--rc-text-primary)' }}>
                      {item.text}
                    </div>

                    {item.type === 'likert' && (
                      <div className="flex gap-1.5">
                        {LIKERT_LABELS.map((label, i) => {
                          const value = i + 1;
                          const on = responses[item.id] === value;
                          return (
                            <button
                              key={label}
                              onClick={() => setResponse(item.id, value)}
                              className="flex-1 px-1 py-1.5 rounded-lg text-[10px] font-mono transition-all duration-100"
                              style={{
                                background: on ? 'rgba(168, 98, 248, 0.18)' : 'var(--rc-bg-surface)',
                                color: on ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
                                border: on
                                  ? '1px solid rgba(168, 98, 248, 0.4)'
                                  : '1px solid var(--rc-border-subtle)',
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {(item.type === 'multi' || item.type === 'single') && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.options!.map((option) => {
                          const on =
                            item.type === 'multi'
                              ? ((responses[item.id] as string[] | undefined) ?? []).includes(option)
                              : responses[item.id] === option;
                          return (
                            <button
                              key={option}
                              onClick={() =>
                                item.type === 'multi'
                                  ? toggleMulti(item.id, option)
                                  : setResponse(item.id, option)
                              }
                              className="px-2.5 py-1.5 rounded-full text-rc-xs font-mono transition-all duration-100"
                              style={{
                                background: on ? 'rgba(168, 98, 248, 0.18)' : 'var(--rc-bg-surface)',
                                color: on ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
                                border: on
                                  ? '1px solid rgba(168, 98, 248, 0.4)'
                                  : '1px solid var(--rc-border-subtle)',
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <button
            onClick={handleSubmit}
            disabled={!complete}
            className="w-full py-3 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
            style={{
              background: complete
                ? 'linear-gradient(135deg, var(--rc-accent), #4d1979)'
                : 'var(--rc-bg-surface)',
              color: complete ? '#0a0b0f' : 'var(--rc-text-dim)',
              cursor: complete ? 'pointer' : 'default',
              boxShadow: complete ? '0 4px 20px rgba(168, 98, 248, 0.25)' : 'none',
            }}
          >
            {complete ? 'Finish Assessment' : 'Answer all rating questions to continue'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
