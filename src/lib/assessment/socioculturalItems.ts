/**
 * Sociocultural / appearance-exposure module (draft instrument).
 *
 * Structured after the constructs in the sociocultural body-image
 * literature (tripartite influence model; appearance-comparison and
 * self-objectification scales; photo-investment work): platform usage
 * intensity, appearance-focused content exposure, appearance comparison,
 * photo editing/filter use, and appearance-related engagement. The
 * inventive coupling is downstream: subscale scores export alongside the
 * segment-resolved distortion vector.
 *
 * DRAFT wording — review before research deployment.
 */

export type SocioSection =
  | 'usage'
  | 'exposure'
  | 'comparison'
  | 'editing'
  | 'engagement';

export interface SocioItem {
  id: string;
  section: SocioSection;
  text: string;
  type: 'likert' | 'multi' | 'single';
  /** For multi/single items. */
  options?: string[];
}

export const LIKERT_LABELS = ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] as const;

export const SOCIO_SECTIONS: Record<SocioSection, string> = {
  usage: 'Usage',
  exposure: 'Appearance-Focused Content Exposure',
  comparison: 'Appearance Comparison',
  editing: 'Photo Editing & Filters',
  engagement: 'Appearance-Related Engagement',
};

export const SOCIO_ITEMS: SocioItem[] = [
  {
    id: 'platforms',
    section: 'usage',
    text: 'Which platforms do you use regularly?',
    type: 'multi',
    options: ['Instagram', 'TikTok', 'Snapchat', 'YouTube', 'Facebook', 'X / Twitter', 'Other', 'None'],
  },
  {
    id: 'daily_time',
    section: 'usage',
    text: 'On a typical day, how much time do you spend on social media?',
    type: 'single',
    options: ['None', 'Under 30 min', '30–60 min', '1–2 hours', '2–4 hours', 'Over 4 hours'],
  },
  { id: 'exp_fitness_feed', section: 'exposure', type: 'likert',
    text: 'My feed shows fitness, diet, or body-transformation content.' },
  { id: 'exp_idealized', section: 'exposure', type: 'likert',
    text: 'I see idealized or edited bodies on social media.' },
  { id: 'exp_follow_looks', section: 'exposure', type: 'likert',
    text: 'I follow accounts primarily because of how the people in them look.' },
  { id: 'cmp_body', section: 'comparison', type: 'likert',
    text: 'I compare my body to bodies I see on social media.' },
  { id: 'cmp_parts', section: 'comparison', type: 'likert',
    text: 'I compare specific body parts (waist, arms, thighs) to those I see online.' },
  { id: 'cmp_feelings', section: 'comparison', type: 'likert',
    text: "Seeing others' bodies online changes how I feel about my own." },
  { id: 'edt_filters', section: 'editing', type: 'likert',
    text: 'I use filters or editing tools on photos of myself before sharing.' },
  { id: 'edt_retake', section: 'editing', type: 'likert',
    text: 'I retake photos of myself until my body looks right.' },
  { id: 'eng_post_body', section: 'engagement', type: 'likert',
    text: 'I post content where my body or appearance is visible.' },
  { id: 'eng_feedback', section: 'engagement', type: 'likert',
    text: 'Likes and comments on my appearance affect how I feel about my body.' },
];

export type SocioResponse = number | string | string[];

export interface SocioSubscales {
  exposure: number;
  comparison: number;
  editing: number;
  engagement: number;
  /** Mean of the four Likert subscales. */
  total: number;
}

export interface SocioculturalResult {
  responses: Record<string, SocioResponse>;
  subscales: SocioSubscales;
  durationMs: number;
}

const LIKERT_SECTIONS: SocioSection[] = ['exposure', 'comparison', 'editing', 'engagement'];

/** Subscale means (1–5) over answered Likert items. */
export function scoreSociocultural(
  responses: Record<string, SocioResponse>,
): SocioSubscales {
  const bySection: Record<string, number[]> = {};
  for (const item of SOCIO_ITEMS) {
    if (item.type !== 'likert') continue;
    const v = responses[item.id];
    if (typeof v === 'number' && v >= 1 && v <= 5) {
      (bySection[item.section] ??= []).push(v);
    }
  }
  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;
  const sub = Object.fromEntries(
    LIKERT_SECTIONS.map((s) => [s, mean(bySection[s] ?? [])]),
  ) as Record<SocioSection, number>;
  const answered = LIKERT_SECTIONS.map((s) => sub[s]).filter((v) => v > 0);
  return {
    exposure: sub.exposure,
    comparison: sub.comparison,
    editing: sub.editing,
    engagement: sub.engagement,
    total: mean(answered),
  };
}

/** Every Likert item answered (usage items are optional). */
export function socioComplete(responses: Record<string, SocioResponse>): boolean {
  return SOCIO_ITEMS.filter((i) => i.type === 'likert').every(
    (i) => typeof responses[i.id] === 'number',
  );
}
