// Croatian dictionary — the source of truth for the app's string shape.
// `en.ts` is typed as `Dict` (= typeof this object), so any key added here
// MUST be added there too or the build fails.
//
// Conventions:
// - Group keys by feature area (nav, common, ...).
// - Use `{var}` placeholders for interpolation; pass values via t(key, { var }).
// - Keep Croatian text verbatim from the original components.

const hr = {
  common: {
    loading: 'Učitavanje…',
    cancel: 'Odustani',
    close: 'Zatvori',
    save: 'Spremi',
    retry: 'Pokušaj ponovno',
    search: 'Pretraži',
    aiTokens: 'AI tokena',
  },
  nav: {
    home: 'Početna',
    docs: 'Skripte',
    agent: 'Agent',
    revise: 'Ponavljanje',
    viewer: '3D',
    login: 'Prijava',
    openNav: 'Otvori navigaciju',
  },
  settings: {
    language: 'Jezik',
    languageHr: 'Hrvatski',
    languageEn: 'Engleski',
    switchToHr: 'Prebaci na hrvatski',
    switchToEn: 'Switch to English',
    lightMode: 'Svijetla tema',
    darkMode: 'Tamna tema',
  },
};

export type Dict = typeof hr;
export default hr;
