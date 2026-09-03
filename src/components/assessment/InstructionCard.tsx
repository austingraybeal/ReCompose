'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { TaskType } from '@/types/assessment';
import { getTaskDefinition } from '@/lib/assessment/taskRegistry';

interface InstructionCardProps {
  taskType: TaskType;
  taskIndex: number;   // 0-based position within the selected set
  taskCount: number;
}

export default function InstructionCard({ taskType, taskIndex, taskCount }: InstructionCardProps) {
  const def = getTaskDefinition(taskType);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={taskType}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.3 }}
        className="ml-4 mt-2 px-4 py-3 rounded-xl w-[340px] max-w-[45%]"
        style={{
          background: 'rgba(26, 29, 40, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--rc-border-default)',
        }}
      >
        {/* Narrow card anchored top-left with stacked lines, so it stays in
            the margin and clear of the avatar even when zoomed well in. */}
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-[11px] uppercase tracking-[2px] font-mono font-bold whitespace-nowrap leading-none mb-2"
          style={{
            color: 'var(--rc-accent)',
            background: 'rgba(168, 98, 248, 0.12)',
            border: '1px solid rgba(168, 98, 248, 0.3)',
          }}
        >
          Task {taskIndex + 1} of {taskCount}
        </span>
        <h3 className="font-mono font-bold text-rc-sm mb-1" style={{ color: 'var(--rc-text-primary)' }}>
          {def.label}
        </h3>
        <p className="text-rc-xs leading-snug" style={{ color: 'var(--rc-text-secondary)' }}>
          {def.instruction}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
