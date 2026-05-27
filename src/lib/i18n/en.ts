import type { Dict } from './hr';

// English dictionary. Typed as `Dict`, so it must mirror hr.ts key-for-key.
const en: Dict = {
  common: {
    loading: 'Loading…',
    cancel: 'Cancel',
    close: 'Close',
    save: 'Save',
    retry: 'Try again',
    search: 'Search',
    aiTokens: 'AI tokens',
  },
  nav: {
    home: 'Home',
    docs: 'Notes',
    agent: 'Agent',
    revise: 'Revision',
    viewer: '3D',
    login: 'Sign in',
    openNav: 'Open navigation',
  },
  home: {
    eyebrow: 'Anatom3d · for medical students',
    subhead:
      'Five sets of notes, an AI agent and a 3D viewer share one index — everything runs in the browser, no install.',
    openNotes: 'Open notes',
    askAgent: 'Ask the agent',
    statPages: 'Pages',
    statSources: 'Sources',
    statTerms: 'Terms',
    statTopics: 'Topics',
    bentoEyebrow: 'What you get',
    bentoTitle: 'Four tools over the same data',
    searchChip: 'Search that remembers',
    searchTitle: 'Click a result and land right on the notes page',
    searchBody:
      'Instead of a list of results, the whole page opens with the term highlighted in yellow, in context. Arrow keys jump to the next occurrence without losing your place on the page.',
    pdfChip: 'Your PDFs',
    pdfTitle: 'Upload your own notes — they stay in the browser',
    pdfBody:
      'Indexing happens locally; nothing from your notes ever reaches a server. Search, agent and deep links work the same for uploaded PDFs as for the bundled notes.',
    dropPdf: 'Drop a PDF here',
    indexingSpeed: 'Indexing ~150ms / page',
    local100: '100% local',
    notesBadge: '5 sources',
    notesTitle: 'Notes search',
    notesBody:
      'Five sets of notes and over a hundred terms per page — search takes you straight to where a term appears, with the context highlighted in yellow.',
    agentTitle: 'Ask a question, get the source',
    agentBody: 'Anatomy only, with links to the exact page of the notes.',
    reviseTitle: 'Questions that catch you out',
    reviseBody: 'Small sets of questions by topic, with progress remembered locally.',
    viewerTitle: 'Isolate and rotate the part you need',
    viewerBody:
      'Load a whole system and pull out just the part you care about — like in Unity, but in the browser.',
    ctaTitle: 'Ready for your first notes?',
    ctaBody:
      'No sign-up, no questionnaire — everything you need is already here, just open the notes.',
    shortcutFocusSearch: 'Focus search',
    shortcutNextHit: 'Next occurrence',
    shortcutCloseViewer: 'Close viewer',
    shortcutZoom: 'Zoom (PC)',
    welcomeTitle: 'Welcome',
    welcomeBody:
      'A prototype with four tools — notes search, agent, revision and a 3D viewer — before the UI moves into Unity. Feel free to click around.',
    welcomeOk: 'Got it',
  },
  settings: {
    language: 'Language',
    languageHr: 'Croatian',
    languageEn: 'English',
    switchToHr: 'Prebaci na hrvatski',
    switchToEn: 'Switch to English',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
  },
};

export default en;
