export interface Hit {
  doc: string;
  page: number;
  exact: boolean;
  pre: string;
  match: string;
  post: string;
}

export interface PdfDoc {
  doc_name: string;
  doc_label: string;
  total_pages: number;
  terms: string[];
  index: Record<string, Hit[]>;
  pages: Record<string, string>;
}

export interface SourceMeta {
  doc: string;
  label: string;
  badge: string;
  color: string;
}

export interface UnifiedIndex {
  index: Record<string, Hit[]>;
  allTerms: string[];
  pages: Record<string, string[]>;
  sources: SourceMeta[];
}

export interface ReviseTopicSummary {
  id: string;
  name: string;
  subtitle: string;
  badge: 'A1' | 'A1-Auto' | string;
}

export interface ReviseGroup {
  group: string;
  topics: ReviseTopicSummary[];
}

export interface QuestionSource {
  doc: string;
  page: number;
  snippet: string;
}

export interface Question {
  q: string;
  a: string;
  source?: QuestionSource;
}

export type Grade = 'wrong' | 'hard' | 'good';

export interface CardHistoryEntry {
  at: number;
  grade: Grade;
}

export interface CardState {
  box: 1 | 2 | 3 | 4 | 5;
  lastReviewedAt: number;
  dueAt: number;
  history: CardHistoryEntry[];
}

export interface NotesBullet {
  text: string;
  indent: number;
}

export interface NotesEntry {
  heading: string;
  bullets: NotesBullet[];
}

export interface ReviseTopic {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  questions: Question[];
  notes: NotesEntry[];
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  ts: number;
}

export interface Anatomy3DPartRef {
  id: string;
  name_en: string;
  name_lat: string;
  system: import('./viewer/types').SystemId;
}

export interface Anatomy3DConfig {
  title: string;
  focus: Anatomy3DPartRef;
  extras: Anatomy3DPartRef[];
  unmatched: string[];
}
