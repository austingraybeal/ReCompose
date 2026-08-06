'use client';

import type { AssessmentStep, TaskType } from '@/types/assessment';
import { getTaskDefinition } from '@/lib/assessment/taskRegistry';

interface ProgressBarProps {
  currentStep: AssessmentStep;
  selectedTasks: TaskType[];
  completedTasks: Set<TaskType>;
}

export default function ProgressBar({ currentStep, selectedTasks, completedTasks }: ProgressBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {selectedTasks.map((task, i) => {
        const isActive = currentStep === task;
        const isComplete = completedTasks.has(task);
        const isPast = isComplete || currentStep === 'complete';
        const label = getTaskDefinition(task).shortLabel;

        return (
          <div key={task} className="flex items-center gap-2 flex-1 min-w-0">
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
                {label}
              </span>
            </div>

            {/* Connector line */}
            {i < selectedTasks.length - 1 && (
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
