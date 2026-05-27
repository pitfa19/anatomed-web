import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import {
  addCardToDeck,
  deleteCardFromDeck,
  getDeck,
  saveDeck,
  updateCardInDeck,
  type UserCard,
  type UserDeck,
} from '../lib/userDecks';
import { generateCards } from '../lib/aiGenerate';
import type { GeneratedCard } from '../lib/aiGenerate';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/AuthContext';
import OutOfTokensModal from '../components/ai/OutOfTokensModal';
import { FEATURE_LABEL_KEY } from '../lib/packages';
import { useT, plural } from '../lib/i18n';

export default function DeckEditor() {
  const t = useT();
  const { deckId } = useParams<{ deckId: string }>();
  const navigate = useNavigate();

  const [deck, setDeck] = useState<UserDeck | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');

  // Add card form
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');

  // Edit card
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');

  // AI generation
  const [showAI, setShowAI] = useState(false);
  const [aiTopic, setAITopic] = useState('');
  const [aiCount, setAICount] = useState(8);
  const [aiLoading, setAILoading] = useState(false);
  const [aiError, setAIError] = useState<string | null>(null);
  const [aiCards, setAICards] = useState<GeneratedCard[]>([]);
  const [aiSelected, setAISelected] = useState<Set<number>>(new Set());
  const [showBuyModal, setShowBuyModal] = useState(false);
  const { user, consumeTokens } = useAuth();

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!deckId) return;
    const d = getDeck(deckId);
    if (!d) { navigate('/revise/my-decks', { replace: true }); return; }
    setDeck(d);
    setNameValue(d.name);
    setDescValue(d.description);
  }, [deckId, navigate]);

  function refresh() {
    if (!deckId) return;
    const d = getDeck(deckId);
    if (d) setDeck(d);
  }

  function saveName() {
    if (!deck || !nameValue.trim()) return;
    saveDeck({ ...deck, name: nameValue.trim(), description: descValue.trim() });
    refresh();
    setEditingName(false);
  }

  function handleAddCard() {
    if (!deck || !newQ.trim() || !newA.trim()) return;
    addCardToDeck(deck.id, newQ, newA);
    setNewQ('');
    setNewA('');
    refresh();
  }

  function startEditCard(card: UserCard) {
    setEditingCardId(card.id);
    setEditQ(card.q);
    setEditA(card.a);
  }

  function saveEditCard() {
    if (!deck || !editingCardId || !editQ.trim() || !editA.trim()) return;
    updateCardInDeck(deck.id, editingCardId, editQ, editA);
    setEditingCardId(null);
    refresh();
  }

  function handleDeleteCard(cardId: string) {
    if (!deck) return;
    deleteCardFromDeck(deck.id, cardId);
    refresh();
  }

  async function handleAIGenerate() {
    if (!aiTopic.trim()) return;
    if (user) {
      const result = await consumeTokens('deck_generate');
      if (!result.ok) {
        setShowBuyModal(true);
        return;
      }
    }
    setAILoading(true);
    setAIError(null);
    setAICards([]);
    setAISelected(new Set());
    try {
      const cards = await generateCards(aiTopic.trim(), aiCount);
      setAICards(cards);
      setAISelected(new Set(cards.map((_, i) => i)));
    } catch (e) {
      setAIError(e instanceof Error ? e.message : String(e));
    } finally {
      setAILoading(false);
    }
  }

  function toggleAICard(i: number) {
    setAISelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function addAICards() {
    if (!deck) return;
    for (const i of aiSelected) {
      const card = aiCards[i];
      if (card) addCardToDeck(deck.id, card.q, card.a);
    }
    refresh();
    setAICards([]);
    setAISelected(new Set());
    setShowAI(false);
    setAITopic('');
  }

  if (!deck) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('decks.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-6">
        <Link
          to="/revise/my-decks"
          className="mb-3 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
        >
          <ArrowLeft size={12} /> {t('decks.studyMyDecks')}
        </Link>

        {editingName ? (
          <div className="flex flex-col gap-2">
            <input
              ref={nameInputRef}
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              maxLength={80}
              className="rounded-lg border border-accent/40 bg-surface px-3 py-2 text-xl font-semibold text-text-strong focus:outline-none"
            />
            <input
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              placeholder={t('decks.descPlaceholder')}
              maxLength={120}
              onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={saveName} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90">
                <Check size={13} /> {t('decks.save')}
              </button>
              <button onClick={() => setEditingName(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2">
                {t('decks.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-2 text-left"
              >
                <h1 className="text-2xl font-semibold text-text-strong">{deck.name}</h1>
                <Pencil size={14} className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              {deck.description && (
                <p className="mt-0.5 text-sm text-text-muted">{deck.description}</p>
              )}
            </div>
            <Link
              to={`/revise/deck/${deck.id}`}
              className="shrink-0 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20"
            >
              {t('decks.practice')}
            </Link>
          </div>
        )}
      </header>

      {/* Add card form */}
      <section className="mb-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-text-strong">{t('decks.addCard')}</h2>
        <div className="flex flex-col gap-2">
          <textarea
            placeholder={t('decks.questionPlaceholder')}
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
          />
          <textarea
            placeholder={t('decks.answerPlaceholder')}
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
            rows={3}
            className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
          />
          <button
            onClick={handleAddCard}
            disabled={!newQ.trim() || !newA.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
          >
            <Plus size={14} /> {t('decks.addCard')}
          </button>
        </div>
      </section>

      {/* AI generation */}
      <section className="mb-6 rounded-xl border border-border bg-surface">
        <button
          onClick={() => setShowAI((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-text-strong">
            <Sparkles size={15} className="text-accent" />
            {t('decks.generateWithAI')}
          </div>
          <span className="text-xs text-text-muted">{showAI ? t('decks.closeSection') : t('decks.openSection')}</span>
        </button>

        {showAI && (
          <div className="border-t border-border px-4 pb-4 pt-3">
            <p className="mb-3 text-xs text-text-muted">
              {t('decks.aiHint')}
            </p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder={t('decks.aiTopicPlaceholder')}
                value={aiTopic}
                onChange={(e) => setAITopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <select
                  value={aiCount}
                  onChange={(e) => setAICount(Number(e.target.value))}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none"
                >
                  {[4, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>{t('decks.aiCardCount', { n })}</option>
                  ))}
                </select>
                <button
                  onClick={handleAIGenerate}
                  disabled={aiLoading || !aiTopic.trim()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
                >
                  {aiLoading ? (
                    <><Loader2 size={14} className="animate-spin" /> {t('decks.generating')}</>
                  ) : (
                    <><Sparkles size={14} /> {t('decks.generate')}</>
                  )}
                </button>
              </div>
              {aiError && (
                <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  {aiError}
                </p>
              )}
            </div>

            {aiCards.length > 0 && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{t('decks.generatedPick')}</span>
                  <button
                    onClick={() =>
                      setAISelected(
                        aiSelected.size === aiCards.length
                          ? new Set()
                          : new Set(aiCards.map((_, i) => i)),
                      )
                    }
                    className="text-accent hover:underline"
                  >
                    {aiSelected.size === aiCards.length ? t('decks.deselectAll') : t('decks.selectAll')}
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {aiCards.map((card, i) => (
                    <li
                      key={i}
                      onClick={() => toggleAICard(i)}
                      className={cn(
                        'cursor-pointer rounded-lg border p-3 text-sm transition-colors',
                        aiSelected.has(i)
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-border bg-surface-2/60 opacity-60',
                      )}
                    >
                      <p className="font-medium text-text-strong">{card.q}</p>
                      <p className="mt-1 text-text-muted">{card.a}</p>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={addAICards}
                  disabled={aiSelected.size === 0}
                  className="rounded-lg bg-accent-2/10 px-4 py-2 text-sm font-medium text-accent-2 hover:bg-accent-2/20 disabled:opacity-40"
                >
                  {plural(t.lang, aiSelected.size, {
                    one: t('decks.addSelectedOne', { n: aiSelected.size }),
                    few: t('decks.addSelectedMany', { n: aiSelected.size }),
                    many: t('decks.addSelectedMany', { n: aiSelected.size }),
                  })}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Card list */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-strong">
          {t('decks.cardsHeading', { n: deck.cards.length })}
        </h2>
        {deck.cards.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-muted">
            {t('decks.noCardsYet')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {deck.cards.map((card) => {
              const isEditing = editingCardId === card.id;
              return (
                <li
                  key={card.id}
                  className={cn(
                    'rounded-xl border bg-surface',
                    isEditing ? 'border-accent/40' : 'border-border',
                  )}
                >
                  {isEditing ? (
                    <div className="flex flex-col gap-2 p-3">
                      <textarea
                        autoFocus
                        value={editQ}
                        onChange={(e) => setEditQ(e.target.value)}
                        rows={2}
                        className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong focus:border-accent/60 focus:outline-none"
                      />
                      <textarea
                        value={editA}
                        onChange={(e) => setEditA(e.target.value)}
                        rows={3}
                        className="resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong focus:border-accent/60 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveEditCard}
                          disabled={!editQ.trim() || !editA.trim()}
                          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
                        >
                          <Check size={13} /> {t('decks.save')}
                        </button>
                        <button
                          onClick={() => setEditingCardId(null)}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2"
                        >
                          {t('decks.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-strong">{card.q}</p>
                        <p className="mt-1 text-sm text-text-muted">{card.a}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => startEditCard(card)}
                          className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-strong"
                          title={t('decks.editCard')}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-warn"
                          title={t('decks.deleteCard')}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <OutOfTokensModal
        open={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        featureLabel={t(FEATURE_LABEL_KEY.deck_generate)}
      />
    </div>
  );
}
