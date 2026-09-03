'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import {
  getQuestionnaire,
  questionnaireComplete,
  type QuestionnaireId,
  type QuestionnaireResults,
  type QOption,
} from '@/lib/assessment/questionnaires';

/**
 * Administers the selected standardized questionnaires, one per screen,
 * after the last adjustment task. Responses record the exact anchor
 * values from the source document; scoring runs on submit.
 */
export default function QuestionnairesForm() {
  const selected = useAssessmentStore((s) => s.selectedQuestionnaires);
  const submitQuestionnaires = useAssessmentStore((s) => s.submitQuestionnaires);

  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Partial<Record<QuestionnaireId, Record<string, number>>>>({});
  const resultsRef = useRef<QuestionnaireResults>({});
  const startedAt = useRef(Date.now());

  const qid = selected[index];
  const def = getQuestionnaire(qid);
  const current = responses[qid] ?? {};
  const complete = questionnaireComplete(def, current);
  const isLast = index === selected.length - 1;

  const setResponse = (itemId: string, value: number) =>
    setResponses((r) => ({ ...r, [qid]: { ...(r[qid] ?? {}), [itemId]: value } }));

  const handleContinue = () => {
    if (!complete) return;
    resultsRef.current[qid] = {
      responses: current,
      scores: def.score(current),
      durationMs: Date.now() - startedAt.current,
    };
    if (isLast) {
      submitQuestionnaires(resultsRef.current);
    } else {
      startedAt.current = Date.now();
      setIndex(index + 1);
      // Jump back to the top for the next instrument
      document.getElementById('questionnaire-scroll')?.scrollTo({ top: 0 });
    }
  };

  const optionButtons = (itemId: string, options: QOption[], compact: boolean) => (
    <div className={compact ? 'flex gap-1.5' : 'flex flex-col gap-1'}>
      {options.map((opt) => {
        const on = current[itemId] === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setResponse(itemId, opt.value)}
            className={
              compact
                ? 'w-8 h-8 rounded-lg text-rc-xs font-mono transition-all duration-100'
                : 'px-3 py-1.5 rounded-lg text-rc-xs text-left transition-all duration-100'
            }
            title={compact ? opt.label : undefined}
            style={{
              background: on ? 'rgba(168, 98, 248, 0.2)' : 'var(--rc-bg-surface)',
              color: on ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
              border: on
                ? '1px solid rgba(168, 98, 248, 0.45)'
                : '1px solid var(--rc-border-subtle)',
            }}
          >
            {compact ? opt.value : opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <motion.div
      key={qid}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      id="questionnaire-scroll"
      className="absolute inset-0 z-50 overflow-y-auto py-6"
      style={{ background: 'rgba(10, 11, 15, 0.97)', backdropFilter: 'blur(24px)' }}
    >
      <div className="max-w-2xl mx-auto px-4">
        <div
          className="p-6 rounded-2xl"
          style={{ background: 'var(--rc-bg-elevated)', border: '1px solid var(--rc-border-default)' }}
        >
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-[11px] uppercase tracking-[2px] font-mono font-bold mb-3"
            style={{
              color: 'var(--rc-accent)',
              background: 'rgba(168, 98, 248, 0.12)',
              border: '1px solid rgba(168, 98, 248, 0.3)',
            }}
          >
            Questionnaire {index + 1} of {selected.length}
          </span>
          <h2 className="font-mono font-bold text-lg mb-2" style={{ color: 'var(--rc-text-primary)' }}>
            {def.title}
          </h2>
          {def.intro && (
            <p className="text-rc-xs mb-4 leading-relaxed" style={{ color: 'var(--rc-text-secondary)' }}>
              {def.intro}
            </p>
          )}

          {def.sections.map((section, si) => (
            <div key={si} className="mb-5">
              {section.prompt && (
                <p className="text-rc-sm mb-2" style={{ color: 'var(--rc-text-secondary)' }}>
                  {section.prompt}
                </p>
              )}
              {section.scale && (
                <div
                  className="mb-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
                  style={{ background: 'var(--rc-bg-surface)', color: 'var(--rc-text-dim)' }}
                >
                  {section.scale.map((o) => `${o.value} = ${o.label}`).join('  ·  ')}
                </div>
              )}
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 flex items-start justify-between gap-4"
                  style={{ borderBottom: '1px solid var(--rc-border-subtle)' }}
                >
                  <span className="text-rc-sm leading-snug pt-1" style={{ color: 'var(--rc-text-primary)' }}>
                    {item.text}
                  </span>
                  <div className="shrink-0">
                    {optionButtons(item.id, item.options ?? section.scale!, !item.options)}
                  </div>
                </div>
              ))}
            </div>
          ))}

          <button
            onClick={handleContinue}
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
            {complete
              ? isLast ? 'Finish Assessment' : 'Continue'
              : 'Answer every item to continue'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
