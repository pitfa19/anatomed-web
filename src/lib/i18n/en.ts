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
