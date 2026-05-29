import type { TKey } from './i18n';
import type { QuizRegion } from './quiz';

/** i18n keys for the region labels (lobby tiles + in-game context chip). */
export const REGION_LABEL_KEY: Record<QuizRegion, TKey> = {
  hand: 'quiz.regionHand',
  foot: 'quiz.regionFoot',
  spine: 'quiz.regionSpine',
  skull: 'quiz.regionSkull',
  mixed: 'quiz.regionMixed',
};
