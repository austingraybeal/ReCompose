/**
 * Registry of all available BIDS assessment tasks.
 *
 * 'perceived' is mandatory — every other task is scored as a discrepancy
 * against the perceived body. The base battery (perceived, ideal, partner,
 * social media) is on by default; athlete/social tasks are opt-in per
 * assessment. The welcome screen renders toggles from this registry, and
 * scoring/exports/reports adapt to whatever set was selected.
 */

export type TaskId =
  | 'perceived'
  | 'ideal'
  | 'partner'
  | 'social_media'
  | 'friends'
  | 'parents'
  | 'high_performer'
  | 'coach'
  | 'teammate'
  | 'teammate_ideal';

export interface TaskDefinition {
  id: TaskId;
  /** Main display text, e.g. "How you see yourself". */
  label: string;
  /** Short label for pills/columns/exports, e.g. "Perceived". */
  shortLabel: string;
  /** Full in-task instruction. */
  instruction: string;
  /** Confirm button label. */
  confirmLabel: string;
  /** Cannot be toggled off. */
  mandatory?: boolean;
  /** Included in a fresh assessment unless toggled off. */
  defaultOn?: boolean;
  category: 'core' | 'social' | 'athlete';
}

export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  {
    id: 'perceived',
    label: 'How you see yourself',
    shortLabel: 'Perceived',
    instruction:
      'Adjust the body to match how you believe your body currently looks. Use the global slider and regional controls until the avatar matches your perception of your own body.',
    confirmLabel: 'Confirm Perceived Body',
    mandatory: true,
    defaultOn: true,
    category: 'core',
  },
  {
    id: 'ideal',
    label: 'How you want to look',
    shortLabel: 'Ideal',
    instruction: 'Adjust the body to show your ideal body — how you would most like to look.',
    confirmLabel: 'Confirm Ideal Body',
    defaultOn: true,
    category: 'core',
  },
  {
    id: 'partner',
    label: 'What others find attractive',
    shortLabel: 'Partner',
    instruction:
      'Adjust the body to show what you think a romantic partner would find most attractive.',
    confirmLabel: 'Confirm Partner Preference',
    defaultOn: true,
    category: 'core',
  },
  {
    id: 'social_media',
    label: 'Social media approval',
    shortLabel: 'Social Media',
    instruction:
      'Adjust the body to show the appearance you believe would get the most approval on social media platforms.',
    confirmLabel: 'Confirm Social Media Body',
    defaultOn: true,
    category: 'social',
  },
  {
    id: 'friends',
    label: 'Peer approval',
    shortLabel: 'Friends',
    instruction:
      'Adjust the body to show the appearance you believe would get the most approval from your friends or peers.',
    confirmLabel: 'Confirm Peer Approval Body',
    category: 'social',
  },
  {
    id: 'parents',
    label: 'Parent approval',
    shortLabel: 'Parents',
    instruction:
      'Adjust the body to show the appearance you believe would get the most approval from your parents.',
    confirmLabel: 'Confirm Parent Approval Body',
    category: 'social',
  },
  {
    id: 'high_performer',
    label: 'Performance-based ideal',
    shortLabel: 'High Performer',
    instruction:
      'Adjust the body to the point that you think best represents the appearance of the highest performers in your sport or event.',
    confirmLabel: 'Confirm Performance Ideal',
    category: 'athlete',
  },
  {
    id: 'coach',
    label: 'Coach-driven ideal',
    shortLabel: 'Coach',
    instruction:
      'Adjust the body to the point that you think best represents what your coach wants your appearance to be.',
    confirmLabel: 'Confirm Coach Ideal',
    category: 'athlete',
  },
  {
    id: 'teammate',
    label: 'Teammate body norm',
    shortLabel: 'Teammate',
    instruction:
      'Adjust the body to the point that you think best represents the appearance of your average teammate.',
    confirmLabel: 'Confirm Teammate Norm',
    category: 'athlete',
  },
  {
    id: 'teammate_ideal',
    label: 'Teammate body ideal',
    shortLabel: 'Teammate Ideal',
    instruction:
      'Adjust the body to the point that you think best represents the appearance that your average teammate would consider ideal.',
    confirmLabel: 'Confirm Teammate Ideal',
    category: 'athlete',
  },
] as const;

export const DEFAULT_SELECTED_TASKS: TaskId[] = TASK_DEFINITIONS.filter(
  (t) => t.defaultOn,
).map((t) => t.id);

const BY_ID = new Map(TASK_DEFINITIONS.map((t) => [t.id, t]));

export function getTaskDefinition(id: TaskId): TaskDefinition {
  return BY_ID.get(id)!;
}
