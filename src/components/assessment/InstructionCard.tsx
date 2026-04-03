'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { TaskType } from '@/types/assessment';

const TASK_CONFIG: Record<TaskType, { title: string; subtitle: string; instruction: string }> = {
  perceived: {
    title: 'How You See Yourself',
    subtitle: 'Task 1 of 3',
    instruction: 'Adjust the body to match how you believe your body currently looks. Use the global slider and regional controls until the avatar matches your perception of your own body.',
  },
  ideal: {
    title: 'How You Want to Look',
    subtitle: 'Task 2 of 3',
    instruction: 'Now adjust the body to show your ideal body — how you would most like to look.',
  },
  partner: {
    title: 'What Others Find Attractive',
    subtitle: 'Task 3 of 3',
    instruction: 'Adjust the body to show what you think a romantic partner would find most attractive.',
  },
};

interface InstructionCardProps {
  taskType: TaskType;
}

export default function InstructionCard({ taskType }: InstructionCardProps) {
  const config = TASK_CONFIG[taskType];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={taskType}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.3 }}
        className="mx-4 mt-2 px-4 py-3 rounded-xl"
        style={{
          background: 'rgba(26, 29, 40, 0.85)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--rc-border-default)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-[2px] font-mono" style={{ color: 'var(--rc-accent)' }}>
            {config.subtitle}
          </span>
        </div>
        <h3 className="font-mono font-bold text-rc-base mb-1" style={{ color: 'var(--rc-text-primary)' }}>
          {config.title}
        </h3>
        <p className="text-rc-xs leading-relaxed" style={{ color: 'var(--rc-text-secondary)' }}>
          {config.instruction}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
