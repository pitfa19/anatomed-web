import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  BookOpen,
  Pencil,
  Trash2,
  ChevronRight,
  Layers,
} from 'lucide-react';
import {
  loadDecks,
  createDeck,
  deleteDeck,
  dueCardsForUserDeck,
  learnedCountForUserDeck,
  type UserDeck,
} from '../lib/userDecks';
import { cn } from '../lib/cn';
import { useT, plural } from '../lib/i18n';

export default function MyDecks() {
  const t = useT();
  const [decks, setDecks] = useState<UserDeck[]>(() => loadDecks());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createDeck(name, newDesc);
    setDecks(loadDecks());
    setNewName('');
    setNewDesc('');
    setCreating(false);
  }

  function handleDelete(deckId: string) {
    if (deleteConfirm !== deckId) {
      setDeleteConfirm(deckId);
      return;
    }
    deleteDeck(deckId);
    setDecks(loadDecks());
    setDeleteConfirm(null);
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-6">
        <Link
          to="/revise/teorija"
          className="mb-3 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
        >
          <ArrowLeft size={12} /> {t('decks.back')}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-strong">{t('decks.myDecks')}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {t('decks.myDecksDesc')}
            </p>
          </div>
          <button
            onClick={() => { setCreating(true); setDeleteConfirm(null); }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent hover:bg-accent/20"
          >
            <Plus size={15} /> {t('decks.newDeck')}
          </button>
        </div>
      </header>

      {creating && (
        <div className="mb-5 rounded-xl border border-accent/40 bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-strong">{t('decks.newDeck')}</h2>
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              placeholder={t('decks.newDeckNamePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              maxLength={80}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
            />
            <input
              type="text"
              placeholder={t('decks.descPlaceholder')}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              maxLength={120}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40"
              >
                {t('decks.create')}
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2"
              >
                {t('decks.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {decks.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-10 text-center">
          <Layers size={32} className="text-text-muted/40" />
          <div>
            <p className="font-medium text-text-strong">{t('decks.emptyTitle')}</p>
            <p className="mt-1 text-sm text-text-muted">
              {t('decks.emptyDesc')}
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Plus size={14} /> {t('decks.createFirst')}
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {decks.map((deck) => {
          const now = Date.now();
          const due = dueCardsForUserDeck(deck, now).length;
          const learned = learnedCountForUserDeck(deck);
          const total = deck.cards.length;
          const isConfirming = deleteConfirm === deck.id;

          return (
            <li
              key={deck.id}
              className="rounded-xl border border-border bg-surface"
            >
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <BookOpen size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-text-strong">
                        {deck.name}
                      </h3>
                      {deck.description && (
                        <p className="mt-0.5 truncate text-xs text-text-muted">
                          {deck.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        to={`/revise/deck/${deck.id}/edit`}
                        title={t('decks.editDeck')}
                        className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-strong"
                      >
                        <Pencil size={13} />
                      </Link>
                      <button
                        onClick={() => handleDelete(deck.id)}
                        title={isConfirming ? t('decks.deleteConfirmTitle') : t('decks.deleteDeck')}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-md transition-colors',
                          isConfirming
                            ? 'bg-warn/15 text-warn'
                            : 'text-text-muted hover:bg-surface-2 hover:text-warn',
                        )}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span>{plural(t.lang, total, { one: t('decks.cardCountOne', { n: total }), few: t('decks.cardCountMany', { n: total }), many: t('decks.cardCountMany', { n: total }) })}</span>
                    <span className="text-border">·</span>
                    <span className="text-accent-2">{t('decks.learnedCount', { n: learned })}</span>
                    {due > 0 && (
                      <>
                        <span className="text-border">·</span>
                        <span className="font-medium text-accent">{t('decks.dueCount', { n: due })}</span>
                      </>
                    )}
                  </div>
                  {isConfirming && (
                    <p className="mt-2 text-xs text-warn">
                      {t('decks.deleteConfirmHint')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                {total === 0 ? (
                  <Link
                    to={`/revise/deck/${deck.id}/edit`}
                    className="text-xs text-accent hover:underline"
                  >
                    {t('decks.addCardsToStart')}
                  </Link>
                ) : (
                  <Link
                    to={`/revise/deck/${deck.id}`}
                    className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
                  >
                    {t('decks.practice')}
                    <ChevronRight size={12} />
                  </Link>
                )}
                <Link
                  to={`/revise/deck/${deck.id}/edit`}
                  className="ml-auto text-xs text-text-muted hover:text-text-strong"
                >
                  {t('decks.editCards')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
