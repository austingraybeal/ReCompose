'use client';

import type { AssessmentStep, TaskType } from '@/types/assessment';

const STEPS: { key: TaskType; label: string }[] = [
  { key: 'perceived', label: 'Perceived' },
  { key: 'ideal', label: 'Ideal' },
  { key: 'partner', label: 'Partner' },
];

interface ProgressBarProps {
  currentStep: AssessmentStep;
  completedTasks: Set<TaskType>;
}

export default function ProgressBar({ currentStep, completedTasks }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {STEPS.map((step, i) => {
        const isActive = currentStep === step.key;
        const isComplete = completedTasks.has(step.key);
        const isPast = isComplete || (currentStep === 'complete');

        return (
          <div key={step.key} className="flex items-center gap-2 flex-1">
            {/* Step indicator */}
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 transition-all duration-300"
                style={{
                  background: isActive
                    ? 'var(--rc-accent)'
                    : isPast
                      ? 'rgba(62, 207, 180, 0.2)'
                      : 'var(--rc-bg-surface)',
                  color: isActive
                    ? '#0a0b0f'
                    : isPast
                      ? 'var(--rc-accent)'
                      : 'var(--rc-text-dim)',
                  border: isActive
                    ? '2px solid var(--rc-accent)'
                    : isPast
                      ? '2px solid rgba(62, 207, 180, 0.3)'
                      : '2px solid var(--rc-border-default)',
                  boxShadow: isActive ? '0 0 12px rgba(62, 207, 180, 0.3)' : 'none',
                }}
              >
                {isPast && !isActive ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className="text-[10px] uppercase tracking-[1.5px] font-mono truncate"
                style={{
                  color: isActive ? 'var(--rc-accent)' : isPast ? 'var(--rc-text-secondary)' : 'var(--rc-text-dim)',
                }}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className="flex-1 h-px min-w-4"
                style={{
                  background: isPast
                    ? 'rgba(62, 207, 180, 0.3)'
                    : 'var(--rc-border-default)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
