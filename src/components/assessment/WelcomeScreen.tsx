'use client';

import { motion } from 'framer-motion';
import { useAssessmentStore } from '@/lib/stores/assessmentStore';
import { TASK_DEFINITIONS, getTaskDefinition } from '@/lib/assessment/taskRegistry';
import { QUESTIONNAIRES, getQuestionnaire, questionnaireItems } from '@/lib/assessment/questionnaires';

const CATEGORY_LABELS: Record<string, string> = {
  core: 'Core Battery',
  social: 'Social Influences',
  athlete: 'Athlete Battery',
};

export default function WelcomeScreen() {
  const beginFirstTask = useAssessmentStore((s) => s.beginFirstTask);
  const selectedTasks = useAssessmentStore((s) => s.selectedTasks);
  const toggleTask = useAssessmentStore((s) => s.toggleTask);
  const participantId = useAssessmentStore((s) => s.participantId);
  const setParticipantId = useAssessmentStore((s) => s.setParticipantId);
  const selectedQuestionnaires = useAssessmentStore((s) => s.selectedQuestionnaires);
  const toggleQuestionnaire = useAssessmentStore((s) => s.toggleQuestionnaire);

  // ~1 min per task; questionnaires estimated at ~1 min per 10 items.
  const questionnaireItemCount = selectedQuestionnaires.reduce(
    (n, id) => n + questionnaireItems(getQuestionnaire(id)).length,
    0,
  );
  const minutes = selectedTasks.length + Math.ceil(questionnaireItemCount / 10);
  const selectedInOrder = TASK_DEFINITIONS.filter((d) => selectedTasks.includes(d.id));

  const categories = ['core', 'social', 'athlete'] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto py-6"
      style={{ background: 'rgba(10, 11, 15, 0.96)', backdropFilter: 'blur(24px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="max-w-lg w-full mx-4 p-8 rounded-2xl my-auto"
        style={{
          background: 'var(--rc-bg-elevated)',
          border: '1px solid var(--rc-border-default)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(168, 98, 248, 0.15), rgba(168, 98, 248, 0.05))',
              border: '1px solid rgba(168, 98, 248, 0.25)',
            }}
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="var(--rc-accent)" strokeWidth="1.5">
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
            </svg>
          </div>
        </div>

        <h2
          className="text-center font-mono font-bold text-lg mb-2"
          style={{ color: 'var(--rc-text-primary)' }}
        >
          BIDS Assessment
        </h2>

        <p className="text-center text-rc-sm mb-5" style={{ color: 'var(--rc-text-secondary)' }}>
          This assessment uses an avatar to measure how you perceive your appearance. For this,
          you&apos;ll complete a few short tasks by changing the avatars relative to each task.
          There are no right or wrong answers &mdash; adjust the body based on your honest
          perception. Specifically, you will adjust the overall body and each segment to answer:
        </p>

        {/* Selected task list (numbered, main text only) */}
        <div className="space-y-2 mb-6">
          {selectedInOrder.map((def, i) => (
            <div
              key={def.id}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
              style={{ background: 'var(--rc-bg-surface)' }}
            >
              <span className="font-mono text-rc-sm font-bold shrink-0" style={{ color: 'var(--rc-accent)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-rc-sm font-medium" style={{ color: 'var(--rc-text-primary)' }}>
                {def.label}
              </span>
            </div>
          ))}
        </div>

        {/* Task selection toggles, grouped by category */}
        <div
          className="mb-6 p-4 rounded-xl"
          style={{ background: 'var(--rc-bg-surface)', border: '1px solid var(--rc-border-subtle)' }}
        >
          <div className="text-[10px] uppercase tracking-[2px] font-mono mb-3" style={{ color: 'var(--rc-text-dim)' }}>
            Assessment Tasks
          </div>
          {categories.map((cat) => {
            const defs = TASK_DEFINITIONS.filter((d) => d.category === cat);
            if (defs.length === 0) return null;
            return (
              <div key={cat} className="mb-3 last:mb-0">
                <div className="text-[9px] uppercase tracking-[1.5px] font-mono mb-1.5" style={{ color: 'var(--rc-text-dim)' }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {defs.map((def) => {
                    const on = selectedTasks.includes(def.id);
                    const locked = getTaskDefinition(def.id).mandatory;
                    return (
                      <button
                        key={def.id}
                        onClick={() => toggleTask(def.id)}
                        disabled={locked}
                        className="px-3 py-1.5 rounded-full text-rc-xs font-mono transition-all duration-150 whitespace-nowrap"
                        style={{
                          background: on
                            ? 'rgba(168, 98, 248, 0.15)'
                            : 'var(--rc-bg-elevated)',
                          color: on ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
                          border: on
                            ? '1px solid rgba(168, 98, 248, 0.35)'
                            : '1px solid var(--rc-border-default)',
                          opacity: locked ? 0.75 : 1,
                          cursor: locked ? 'default' : 'pointer',
                        }}
                      >
                        {def.shortLabel}
                        {locked && ' ●'}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Standardized questionnaire toggles */}
        <div
          className="mb-4 p-4 rounded-xl"
          style={{ background: 'var(--rc-bg-surface)', border: '1px solid var(--rc-border-subtle)' }}
        >
          <div className="text-[10px] uppercase tracking-[2px] font-mono mb-1" style={{ color: 'var(--rc-text-dim)' }}>
            Questionnaires
          </div>
          <div className="text-rc-xs mb-2.5" style={{ color: 'var(--rc-text-dim)' }}>
            Optional standardized instruments administered after the tasks.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUESTIONNAIRES.map((def) => {
              const on = selectedQuestionnaires.includes(def.id);
              const itemCount = questionnaireItems(def).length;
              return (
                <button
                  key={def.id}
                  onClick={() => toggleQuestionnaire(def.id)}
                  title={`${def.title} — ${itemCount} items`}
                  className="px-3 py-1.5 rounded-full text-rc-xs font-mono transition-all duration-150 whitespace-nowrap"
                  style={{
                    background: on ? 'rgba(168, 98, 248, 0.15)' : 'var(--rc-bg-elevated)',
                    color: on ? 'var(--rc-accent)' : 'var(--rc-text-dim)',
                    border: on
                      ? '1px solid rgba(168, 98, 248, 0.35)'
                      : '1px solid var(--rc-border-default)',
                  }}
                >
                  {def.shortTitle}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional participant        {/* Optional participant / session ID for research exports */}
        <div className="mb-4">
          <label
            className="block text-[10px] uppercase tracking-[2px] font-mono mb-1.5"
            style={{ color: 'var(--rc-text-dim)' }}
          >
            Participant / Session ID <span style={{ textTransform: 'none' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            placeholder="e.g. P014"
            maxLength={40}
            className="w-full px-3 py-2 rounded-lg font-mono text-rc-sm outline-none"
            style={{
              background: 'var(--rc-bg-surface)',
              border: '1px solid var(--rc-border-default)',
              color: 'var(--rc-text-primary)',
            }}
          />
        </div>

        <div className="flex items-center gap-2 mb-6">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="var(--rc-text-dim)" strokeWidth="1.5">
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
          </svg>
          <span className="text-rc-xs" style={{ color: 'var(--rc-text-dim)' }}>
            ~{minutes} minute{minutes === 1 ? '' : 's'}
          </span>
        </div>

        <button
          onClick={beginFirstTask}
          className="w-full py-3 rounded-xl font-mono font-bold text-rc-sm tracking-wide transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, var(--rc-accent), #4d1979)',
            color: '#0a0b0f',
            boxShadow: '0 4px 20px rgba(168, 98, 248, 0.25)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 6px 28px rgba(168, 98, 248, 0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(168, 98, 248, 0.25)'; }}
        >
          Begin Assessment
        </button>
      </motion.div>
    </motion.div>
  );
}
