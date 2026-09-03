/**
 * Standardized questionnaire battery administered after the BIDS tasks.
 *
 * Six instruments, each independently toggleable on the welcome screen:
 * MBSRQ-AS, BISS, FIIT, DMS (Drive for Muscularity), TREI, and BI-SCS.
 * Item wording, response anchors/values, and scoring follow the source
 * document (BIDS_Questionnaires.docx) exactly, including the specified
 * reverse-scored items and subscale memberships.
 */

export type QuestionnaireId = 'mbsrq_as' | 'biss' | 'fiit' | 'dms' | 'trei' | 'biscs';

export interface QOption {
  label: string;
  value: number;
}

export interface QItem {
  id: string;
  text: string;
  /** Per-item response options (BISS); otherwise the section scale is used. */
  options?: QOption[];
}

export interface QSection {
  /** Prompt shown above this section's items. */
  prompt?: string;
  /** Shared response scale for the section's items. */
  scale?: QOption[];
  items: QItem[];
}

export interface ScaleScore {
  key: string;
  label: string;
  value: number;
  kind: 'mean' | 'sum';
  min: number;
  max: number;
}

export interface QuestionnaireDef {
  id: QuestionnaireId;
  title: string;
  shortTitle: string;
  intro?: string;
  sections: QSection[];
  score: (responses: Record<string, number>) => ScaleScore[];
}

/** One administered questionnaire's stored result. */
export interface QuestionnaireResult {
  responses: Record<string, number>;
  scores: ScaleScore[];
  durationMs: number;
}

export type QuestionnaireResults = Partial<Record<QuestionnaireId, QuestionnaireResult>>;

// ── Shared scales ──────────────────────────────────────────────────────

const scale = (...labels: string[]): QOption[] =>
  labels.map((label, i) => ({ label, value: i + 1 }));

const AGREE5 = scale(
  'Definitely Disagree', 'Mostly Disagree', 'Neither Agree Nor Disagree',
  'Mostly Agree', 'Definitely Agree',
);
const FREQ5 = scale('Never', 'Rarely', 'Sometimes', 'Often', 'Very Often');
const WEIGHT5 = scale(
  'Very Underweight', 'Somewhat Underweight', 'Normal Weight',
  'Somewhat Overweight', 'Very Overweight',
);
const SAT5 = scale(
  'Very Dissatisfied', 'Mostly Dissatisfied', 'Neither Satisfied Nor Dissatisfied',
  'Mostly Satisfied', 'Very Satisfied',
);
const FIIT5 = scale(
  'Strongly disagree', 'Somewhat disagree', 'Neither agree nor disagree',
  'Somewhat agree', 'Strongly agree',
);
const DMS6 = scale('Always', 'Very often', 'Often', 'Sometimes', 'Rarely', 'Never');
const TREI6 = scale(
  'Not at all', 'Seldom', 'Sometimes', 'Moderately often', 'Often', 'All of the time',
);
const BISCS5 = scale('Almost never', 'Rarely', 'Sometimes', 'Often', 'Almost always');

// ── Scoring helpers ────────────────────────────────────────────────────

const r2 = (v: number) => Math.round(v * 100) / 100;
const rev5 = (v: number) => 6 - v; // reverse on a 1-5 scale

function collect(
  responses: Record<string, number>,
  ids: string[],
  revIds: string[] = [],
): number[] {
  const revSet = new Set(revIds);
  return [...ids, ...revIds]
    .map((id) => {
      const v = responses[id];
      if (typeof v !== 'number') return null;
      return revSet.has(id) ? rev5(v) : v;
    })
    .filter((v): v is number => v !== null);
}

const mean = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ── MBSRQ-AS ───────────────────────────────────────────────────────────

const MBSRQ_ITEMS: string[] = [
  'Before going out in public, I always notice how I look',
  'I am careful to buy clothes that make me look my best',
  'My body is sexually appealing',
  'I constantly worry about being or becoming fat',
  'I like my looks just the way they are',
  'I check my appearance in a mirror whenever I can',
  'Before going out, I usually spend a lot of time getting ready',
  'I am very conscious of even small changes in my weight',
  'Most people would consider me good-looking',
  'It is important that I always look good',
  'I use very few grooming products',
  'I like the way I look without my clothes on',
  "I am self-conscious if my grooming isn't right",
  'I usually wear whatever is handy without caring how it looks',
  'I like the way clothes fit me',
  "I don't care what people think about my appearance",
  'I take special care with my hair grooming',
  'I dislike my physique',
  'I am physically unattractive',
  'I never think about my appearance',
  'I am always trying to improve my physical appearance',
  'I am on a weight-loss diet',
];

const q = (n: number) => `q${n}`;

const MBSRQ: QuestionnaireDef = {
  id: 'mbsrq_as',
  title: 'MBSRQ-AS',
  shortTitle: 'MBSRQ-AS',
  intro: 'Please indicate how much you personally agree or disagree with each statement.',
  sections: [
    {
      scale: AGREE5,
      items: MBSRQ_ITEMS.map((text, i) => ({ id: q(i + 1), text })),
    },
    {
      scale: FREQ5,
      items: [
        { id: 'crash_diet', text: 'I have tried to lose weight by fasting or going on crash diets' },
      ],
    },
    {
      scale: WEIGHT5,
      items: [
        { id: 'wp_self', text: 'I think I am:' },
        { id: 'wp_other', text: 'From looking at me, most other people would think I am:' },
      ],
    },
    {
      prompt: 'Please identify your personal satisfaction with your appearance in each category listed below.',
      scale: SAT5,
      items: [
        { id: 'pr_face', text: 'Face (facial features, complexion)' },
        { id: 'pr_hair', text: 'Hair (colour, thickness, texture)' },
        { id: 'pr_lower', text: 'Lower torso (buttocks, hips, thighs, legs)' },
        { id: 'pr_mid', text: 'Mid torso (waist, stomach)' },
        { id: 'pr_upper', text: 'Upper torso (chest or breasts, shoulders, arms)' },
        { id: 'po_muscle', text: 'Muscle tone' },
        { id: 'po_weight', text: 'Weight' },
        { id: 'po_height', text: 'Height' },
        { id: 'po_overall', text: 'Overall Appearance' },
      ],
    },
  ],
  score: (r) => [
    // Subscales are averages; reverse-scored items per the source document.
    { key: 'appearance_evaluation', label: 'Appearance Evaluation',
      value: mean(collect(r, [q(3), q(5), q(9), q(12), q(15)], [q(18), q(19)])),
      kind: 'mean', min: 1, max: 5 },
    { key: 'appearance_orientation', label: 'Appearance Orientation',
      value: mean(collect(r, [q(1), q(2), q(6), q(7), q(10), q(13), q(17), q(21)], [q(11), q(14), q(16), q(20)])),
      kind: 'mean', min: 1, max: 5 },
    { key: 'body_area_satisfaction', label: 'Body Area Satisfaction',
      value: mean(collect(r, ['pr_face', 'pr_hair', 'pr_lower', 'pr_mid', 'pr_upper', 'po_muscle', 'po_weight', 'po_height', 'po_overall'])),
      kind: 'mean', min: 1, max: 5 },
    { key: 'overweight_preoccupation', label: 'Overweight Preoccupation',
      value: mean(collect(r, [q(4), q(8), q(22), 'crash_diet'])),
      kind: 'mean', min: 1, max: 5 },
    { key: 'self_classified_weight', label: 'Self-Classified Weight',
      value: mean(collect(r, ['wp_self', 'wp_other'])),
      kind: 'mean', min: 1, max: 5 },
  ],
};

// ── BISS ───────────────────────────────────────────────────────────────
// Nine-point items; anchor order and recorded values exactly as printed
// in the source document. Scored as the average of the item values.

const biss9 = (...labels: string[]): QOption[] =>
  labels.map((label, i) => ({ label, value: i + 1 }));

const BISS: QuestionnaireDef = {
  id: 'biss',
  title: 'Body Image State Scale (BISS)',
  shortTitle: 'BISS',
  sections: [
    {
      items: [
        {
          id: 'b1',
          text: 'Right now I feel ________________ with my physical appearance',
          options: biss9('Extremely dissatisfied', 'Mostly dissatisfied', 'Moderately dissatisfied', 'Slightly dissatisfied', 'Neither dissatisfied nor satisfied', 'Slightly satisfied', 'Moderately satisfied', 'Mostly satisfied', 'Extremely satisfied'),
        },
        {
          id: 'b2',
          text: 'Right now I feel ________________ with my body size and shape',
          options: biss9('Extremely satisfied', 'Mostly satisfied', 'Moderately satisfied', 'Slightly satisfied', 'Neither dissatisfied nor satisfied', 'Slightly dissatisfied', 'Moderately dissatisfied', 'Mostly dissatisfied', 'Extremely dissatisfied'),
        },
        {
          id: 'b3',
          text: 'Right now I feel ________________ with my weight',
          options: biss9('Extremely satisfied', 'Mostly satisfied', 'Moderately satisfied', 'Slightly satisfied', 'Neither dissatisfied nor satisfied', 'Slightly dissatisfied', 'Moderately dissatisfied', 'Mostly dissatisfied', 'Extremely dissatisfied'),
        },
        {
          id: 'b4',
          text: 'Right now I feel ________________',
          options: biss9('Extremely physically attractive', 'Very physically attractive', 'Moderately physically attractive', 'Slightly physically attractive', 'Neither attractive nor unattractive', 'Slightly physically unattractive', 'Moderately physically unattractive', 'Mostly physically unattractive', 'Extremely physically unattractive'),
        },
        {
          id: 'b5',
          text: 'Right now I feel _________________ about my looks than I usually feel',
          options: biss9('A great deal worse', 'Much worse', 'Somewhat worse', 'Just slightly worse', 'About the same', 'Just slightly better', 'Somewhat better', 'Much better', 'A great deal better'),
        },
        {
          id: 'b6',
          text: 'Right now I feel that I look _________________ than the average person looks',
          options: biss9('A great deal better', 'Much better', 'Somewhat better', 'Just slightly better', 'About the same', 'Just slightly worse', 'Somewhat worse', 'Much worse', 'A great deal worse'),
        },
      ],
    },
  ],
  score: (r) => [
    { key: 'biss_mean', label: 'BISS (item average)',
      value: mean(collect(r, ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])),
      kind: 'mean', min: 1, max: 9 },
  ],
};

// ── FIIT ───────────────────────────────────────────────────────────────

const FIIT_ITEMS = [
  'I often feel concerned about the progress I am making towards achieving a perfectly lean and toned body.',
  'I actively compare my body to people with bodies that are both lean and toned.',
  'I spend time fixating on parts of my body that are not very lean and toned.',
  'I spend time daydreaming about how I would look with a very lean and very toned body.',
  'I feel guilty when I am not doing things (e.g., dieting, exercising) that help me achieve a body that is both lean and toned.',
  'I think a lot about what I could be doing to make my body look both lean and toned.',
  'I am preoccupied with the idea of having a body that looks both lean and toned.',
  'To achieve the body I want it is important to combine a strict diet with a strict exercise regime.',
  'Having a body that is both very lean and very toned, is a good way to show people you are in control of your life.',
  'Having a body that is both lean and toned is a good way to gain respect from other people.',
  'The more I do things (e.g., exercise, diet) to keep my body looking both lean and toned, the more highly other people regard me.',
  'Having a lean and toned looking physique says something important about who you are as a person.',
  'Maintaining a body that is both lean and toned, is a good way to show people how hard working I am.',
  'Having a body that is both lean and toned, makes you feel successful in life.',
  'It says something good about me as a person, if I can have a body that is both lean and toned.',
  'If I had a body that was very lean and very toned, I would be more popular with my same aged peers.',
  'I spend time doing things (e.g., exercising, dieting, taking supplements) to develop visible muscle tone.',
  'I spend time doing things (e.g., exercising, dieting, taking supplements) to ensure my body looks both lean and toned.',
  'I spend time doing things (e.g., exercising, dieting, taking supplements) to ensure my body looks very lean.',
  'I spend time doing things (e.g., exercising, dieting, taking supplements) to burn fat.',
];

const FIIT: QuestionnaireDef = {
  id: 'fiit',
  title: 'FIIT Internalization',
  shortTitle: 'FIIT',
  intro:
    'Listed below are a series of statements regarding body ideals. Many of the statements describe a “fit” body, or a body that is both lean (low body fat) and toned (with muscle definition). Please read each statement carefully and indicate your level of agreement. Please answer as honestly as possible, and do not spend too much time on any statement.',
  sections: [{ scale: FIIT5, items: FIIT_ITEMS.map((text, i) => ({ id: `f${i + 1}`, text })) }],
  score: (r) => [
    { key: 'fiit_total', label: 'FIIT Total (sum)',
      value: sum(collect(r, FIIT_ITEMS.map((_, i) => `f${i + 1}`))),
      kind: 'sum', min: 20, max: 100 },
  ],
};

// ── DMS ────────────────────────────────────────────────────────────────

const DMS_ITEMS = [
  'I wish that I were more muscular.',
  'I lift weights to build up muscle.',
  'I use protein or energy supplements.',
  'I drink weight gain or protein shakes.',
  'I try to consume as many calories as I can in a day.',
  'I feel guilty if I miss a weight training session.',
  'I think I would feel more confident if I had more muscle mass.',
  'Other people think I work out with weights too often.',
  'I think that I would look better if I gained 10 pounds in bulk.',
  'I think about taking anabolic steroids.',
  'I think that I would feel stronger if I gained a little more muscle mass.',
  'I think that my weight training schedule interferes with other aspects of my life.',
  'I think that my arms are not muscular enough.',
  'I think that my chest is not muscular enough.',
  'I think that my legs are not muscular enough.',
];

const DMS: QuestionnaireDef = {
  id: 'dms',
  title: 'Drive for Muscularity (DMS)',
  shortTitle: 'DMS',
  intro: 'Please indicate how much you personally agree or disagree with each statement.',
  sections: [{ scale: DMS6, items: DMS_ITEMS.map((text, i) => ({ id: `d${i + 1}`, text })) }],
  score: (r) => [
    { key: 'dms_total', label: 'DMS Total (sum)',
      value: sum(collect(r, DMS_ITEMS.map((_, i) => `d${i + 1}`))),
      kind: 'sum', min: 15, max: 90 },
  ],
};

// ── TREI ───────────────────────────────────────────────────────────────

const TREI_ITEMS = [
  'When I am feeling nervous or tense, eating helps me relax.',
  'Eating helps me get over it, when I feel bad.',
  'Eating helps me avoid uncomfortable social situations.',
  'When I am angry at my parents or friends, eating helps me get back at them.',
  'Eating helps me forget bad feelings, like being sad, lonely, or scared.',
  'Eating helps me feel better when I am stressed or nervous.',
  "Eating can help me get rid of my feelings when I don't want to feel them.",
  'Eating helps me deal with sadness or bad feelings.',
  'I would feel like I could conquer things more easily if I were thin.',
  'I would be more good looking if I were thin.',
  'When I limit what I eat, others respect me.',
  'I would be more good looking to the opposite sex if I were thin.',
  'I would feel stronger if I were thin.',
  'I would handle myself better with other people if I were thin.',
  'If I were thin, I would feel like I had control over myself.',
  'I would feel like I could do whatever I wanted to if I were thin.',
];

const TREI: QuestionnaireDef = {
  id: 'trei',
  title: 'TREI',
  shortTitle: 'TREI',
  intro:
    "Listed below are a number of common ways of thinking about positive and negative consequences of eating that sometimes come into people's minds. Please read each thought carefully and indicate how frequently, if at all, it has occurred to you over the past month.",
  sections: [{ scale: TREI6, items: TREI_ITEMS.map((text, i) => ({ id: `t${i + 1}`, text })) }],
  score: (r) => [
    { key: 'trei_total', label: 'TREI Total (sum)',
      value: sum(collect(r, TREI_ITEMS.map((_, i) => `t${i + 1}`))),
      kind: 'sum', min: 16, max: 96 },
  ],
};

// ── BI-SCS ─────────────────────────────────────────────────────────────

const BISCS_ITEMS = [
  'I am disapproving and judgmental about my own flaws and inadequacies.',
  'I obsess and fixate on everything that was wrong.',
  'I see the difficulties as part of life that everyone goes through.',
  'I feel more separate and cut off from the rest of the world.',
  'I try to be loving towards myself.',
  'I become consumed by feelings of inadequacy.',
  'I remind myself that there are lots of other people in the world feeling like I do.',
  'I am tough on myself.',
  'I try to keep my emotions in balance.',
  'I try to remind myself that feelings of inadequacy are shared by most people.',
  "I am intolerant and impatient towards those aspects I don't like about myself.",
  'I give myself the caring and tenderness I need.',
  'I feel like most other people are probably happier than I am.',
  'I try to take a balanced view of the situation.',
  'I try to see my failings as part of the human condition.',
  'I get down on myself.',
  'I try to keep things in perspective.',
  'I feel like other people must be having an easier time of it.',
  'I am kind to myself.',
  'I get carried away with my feelings.',
  'I am a bit cold-hearted towards myself.',
  'I try to approach my feelings with curiosity and openness.',
  'I am tolerant of my own flaws and inadequacies.',
  'I blow the incident out of proportion.',
  'I feel alone.',
  "I try to be understanding and patient towards those aspects of myself that I don't like.",
];

const s = (n: number) => `s${n}`;

const BISCS: QuestionnaireDef = {
  id: 'biscs',
  title: 'Body Image Self-Compassion Scale (BI-SCS)',
  shortTitle: 'BI-SCS',
  intro:
    'Please rate the extent that you agree with each statement below about how you typically respond when you are having a bad body image experience or are just feeling bad about your body.',
  sections: [{ scale: BISCS5, items: BISCS_ITEMS.map((text, i) => ({ id: s(i + 1), text })) }],
  score: (r) => [
    // Averages per the source document; Self-Judgement, Isolation, and
    // Over-Identification are reverse scored.
    { key: 'self_kindness', label: 'Self-Kindness',
      value: mean(collect(r, [s(5), s(12), s(19), s(23), s(26)])), kind: 'mean', min: 1, max: 5 },
    { key: 'self_judgement', label: 'Self-Judgement (reversed)',
      value: mean(collect(r, [], [s(1), s(8), s(11), s(16), s(21)])), kind: 'mean', min: 1, max: 5 },
    { key: 'common_humanity', label: 'Common Humanity',
      value: mean(collect(r, [s(3), s(7), s(10), s(15)])), kind: 'mean', min: 1, max: 5 },
    { key: 'isolation', label: 'Isolation (reversed)',
      value: mean(collect(r, [], [s(4), s(13), s(18), s(25)])), kind: 'mean', min: 1, max: 5 },
    { key: 'mindfulness', label: 'Mindfulness',
      value: mean(collect(r, [s(9), s(14), s(17), s(22)])), kind: 'mean', min: 1, max: 5 },
    { key: 'over_identification', label: 'Over-Identification (reversed)',
      value: mean(collect(r, [], [s(2), s(6), s(20), s(24)])), kind: 'mean', min: 1, max: 5 },
  ],
};

// ── Registry ───────────────────────────────────────────────────────────

export const QUESTIONNAIRES: readonly QuestionnaireDef[] = [
  MBSRQ, BISS, FIIT, DMS, TREI, BISCS,
];

const BY_ID = new Map(QUESTIONNAIRES.map((d) => [d.id, d]));

export function getQuestionnaire(id: QuestionnaireId): QuestionnaireDef {
  return BY_ID.get(id)!;
}

export function questionnaireItems(def: QuestionnaireDef): QItem[] {
  return def.sections.flatMap((sec) => sec.items);
}

/** Every item in the questionnaire answered? */
export function questionnaireComplete(
  def: QuestionnaireDef,
  responses: Record<string, number>,
): boolean {
  return questionnaireItems(def).every((it) => typeof responses[it.id] === 'number');
}
