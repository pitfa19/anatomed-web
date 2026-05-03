import type { CardState, Grade } from './types';
import { gradeCard } from './srs';

const DECKS_KEY = 'anatom3d.decks.v1';
const SRS_PREFIX = 'pona.srs.udeck.v1';

export interface UserCard {
  id: string;
  q: string;
  a: string;
}

export interface UserDeck {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  cards: UserCard[];
}

export function loadDecks(): UserDeck[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (raw) return JSON.parse(raw) as UserDeck[];
  } catch { /* ignore */ }
  return [];
}

function saveDecks(decks: UserDeck[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}

export function createDeck(name: string, description = ''): UserDeck {
  const deck: UserDeck = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cards: [],
  };
  const decks = loadDecks();
  decks.push(deck);
  saveDecks(decks);
  return deck;
}

export function saveDeck(deck: UserDeck): void {
  const decks = loadDecks();
  const i = decks.findIndex((d) => d.id === deck.id);
  const updated = { ...deck, updatedAt: Date.now() };
  if (i >= 0) decks[i] = updated;
  else decks.push(updated);
  saveDecks(decks);
}

export function deleteDeck(deckId: string): void {
  saveDecks(loadDecks().filter((d) => d.id !== deckId));
  if (typeof localStorage === 'undefined') return;
  const prefix = `${SRS_PREFIX}.${deckId}.`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export function getDeck(deckId: string): UserDeck | null {
  return loadDecks().find((d) => d.id === deckId) ?? null;
}

export function addCardToDeck(deckId: string, q: string, a: string): UserDeck | null {
  const decks = loadDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return null;
  deck.cards.push({ id: crypto.randomUUID(), q: q.trim(), a: a.trim() });
  deck.updatedAt = Date.now();
  saveDecks(decks);
  return deck;
}

export function updateCardInDeck(deckId: string, cardId: string, q: string, a: string): void {
  const decks = loadDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;
  const card = deck.cards.find((c) => c.id === cardId);
  if (!card) return;
  card.q = q.trim();
  card.a = a.trim();
  deck.updatedAt = Date.now();
  saveDecks(decks);
}

export function deleteCardFromDeck(deckId: string, cardId: string): void {
  const decks = loadDecks();
  const deck = decks.find((d) => d.id === deckId);
  if (!deck) return;
  deck.cards = deck.cards.filter((c) => c.id !== cardId);
  deck.updatedAt = Date.now();
  saveDecks(decks);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${SRS_PREFIX}.${deckId}.${cardId}`);
  }
}

function cardSRSKey(deckId: string, cardId: string): string {
  return `${SRS_PREFIX}.${deckId}.${cardId}`;
}

export function loadUserCardState(deckId: string, cardId: string): CardState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cardSRSKey(deckId, cardId));
    if (raw) return JSON.parse(raw) as CardState;
  } catch { /* ignore */ }
  return null;
}

export function saveUserCardState(deckId: string, cardId: string, state: CardState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(cardSRSKey(deckId, cardId), JSON.stringify(state));
}

export function gradeUserCard(deckId: string, cardId: string, grade: Grade, now = Date.now()): CardState {
  const prev = loadUserCardState(deckId, cardId);
  const next = gradeCard(prev, grade, now);
  saveUserCardState(deckId, cardId, next);
  return next;
}

export function resetUserDeck(deck: UserDeck): void {
  if (typeof localStorage === 'undefined') return;
  for (const card of deck.cards) {
    localStorage.removeItem(cardSRSKey(deck.id, card.id));
  }
}

export interface UserDeckDueCard {
  card: UserCard;
  state: CardState | null;
}

export function dueCardsForUserDeck(deck: UserDeck, now = Date.now()): UserDeckDueCard[] {
  return deck.cards
    .filter((card) => {
      const state = loadUserCardState(deck.id, card.id);
      return !state || state.dueAt <= now;
    })
    .map((card) => ({ card, state: loadUserCardState(deck.id, card.id) }));
}

export function learnedCountForUserDeck(deck: UserDeck): number {
  return deck.cards.filter((card) => {
    const state = loadUserCardState(deck.id, card.id);
    return state && state.box >= 3;
  }).length;
}
