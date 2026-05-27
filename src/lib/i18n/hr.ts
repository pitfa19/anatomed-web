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
  home: {
    eyebrow: 'Anatom3d · za studente medicine',
    subhead:
      'Pet skripti, hrvatski agent i 3D viewer dijele isti indeks - sve radi u browseru, bez instalacije.',
    openNotes: 'Otvori skripte',
    askAgent: 'Pitaj agenta',
    statPages: 'Stranica',
    statSources: 'Izvora',
    statTerms: 'Pojmova',
    statTopics: 'Tema',
    bentoEyebrow: 'Što imaš',
    bentoTitle: 'Četiri alata nad istim podacima',
    searchChip: 'Pretraga koja pamti',
    searchTitle: 'Klik na rezultat te vodi ravno na stranicu skripte',
    searchBody:
      'Umjesto liste rezultata, otvara se cijela stranica sa žuto označenim pojmom u kontekstu. Strelicama prelaziš na sljedeću pojavu bez gubljenja mjesta na stranici.',
    pdfChip: 'Tvoji PDF-ovi',
    pdfTitle: 'Učitaj vlastitu skriptu - ostaje u browseru',
    pdfBody:
      'Indeksiranje se odvija lokalno; ništa od tvoje skripte ne završava na serveru. Pretraga, agent i deep linkovi rade jednako za učitane PDF-ove kao i za priložene skripte.',
    dropPdf: 'Povuci PDF ovdje',
    indexingSpeed: 'Indeksiranje ~150ms / stranica',
    local100: '100% lokalno',
    notesBadge: '5 izvora',
    notesTitle: 'Pretraga skripti',
    notesBody:
      'Pet skripti i više od stotinu termina po stranici - pretraga te odvodi ravno na mjesto gdje se pojam pojavljuje, sa žuto označenim kontekstom.',
    agentTitle: 'Postavi pitanje, dobiješ izvor',
    agentBody: 'Hrvatski jezik, samo anatomija, s linkovima na točnu stranicu skripte.',
    reviseTitle: 'Pitanja koja te love',
    reviseBody: 'Mali setovi pitanja po temama, s napredovanjem koje se pamti lokalno.',
    viewerTitle: 'Izoliraj i rotiraj traženi dio',
    viewerBody:
      'Učitaj cijeli sustav i izdvoji samo dio koji te zanima - kao u Unityju, ali u browseru.',
    ctaTitle: 'Spremno za prvu skriptu?',
    ctaBody:
      'Bez registracije i upitnika - sve što ti treba već je tu, dovoljno je otvoriti skriptu.',
    shortcutFocusSearch: 'Fokus pretrage',
    shortcutNextHit: 'Sljedeća pojava',
    shortcutCloseViewer: 'Zatvori viewer',
    shortcutZoom: 'Zumiraj (PC)',
    welcomeTitle: 'Dobro došao',
    welcomeBody:
      'Prototip s četiri alata - pretragom skripti, agentom, ponavljanjem i 3D viewerom - prije nego što UI prijeđe u Unity. Slobodno klikaj okolo.',
    welcomeOk: 'U redu',
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
