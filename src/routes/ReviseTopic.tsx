import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { loadReviseTopic } from '../lib/data';
import type { ReviseTopic as Topic } from '../lib/types';
import QuestionsTab from '../components/revise/QuestionsTab';
import NotesTab from '../components/revise/NotesTab';
import LinksTab from '../components/revise/LinksTab';
import DueBadge from '../components/revise/DueBadge';
import { dueCountForTopic } from '../lib/srs';
import { cn } from '../lib/cn';

type Tab = 'questions' | 'notes' | 'links';

const TABS: { id: Tab; label: string }[] = [
  { id: 'questions', label: 'Pitanja' },
  { id: 'notes', label: 'Skripta' },
  { id: 'links', label: 'Quizlet' },
];

export default function ReviseTopic() {
  const { topicId } = useParams<{ topicId: string }>();
  const [searchParams] = useSearchParams();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('questions');

  useEffect(() => {
    if (!topicId) return;
    setTopic(null);
    setError(null);
    setTab('questions');
    loadReviseTopic(topicId)
      .then(setTopic)
      .catch((e) => setError(e.message ?? String(e)));
  }, [topicId]);

  const dueCount = useMemo(
    () => (topic ? dueCountForTopic(topic.id, topic.questions.length) : 0),
    [topic],
  );

  if (error) {
    return (
      <div className="p-6 text-sm text-warn">
        Greška: {error}{' '}
        <Link to="/revise" className="underline">
          natrag
        </Link>
      </div>
    );
  }
  if (!topic) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Učitavam…
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <Link
          to="/revise"
          className="mb-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
        >
          <ArrowLeft size={12} /> Sve teme
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-text-strong">{topic.name}</h1>
          <DueBadge count={dueCount} />
        </div>
        {topic.subtitle && (
          <p className="mt-0.5 text-xs text-text-muted">{topic.subtitle}</p>
        )}
        {dueCount > 0 && tab === 'questions' && searchParams.get('due') !== '1' && (
          <Link
            to={`/revise/${topic.id}?due=1`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            Vježbaj samo {dueCount} {dueCount === 1 ? 'pitanje' : 'pitanja'} na redu →
          </Link>
        )}
        <div className="mt-3 flex gap-1 rounded-lg border border-border bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm transition-colors',
                tab === t.id
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text-strong',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {tab === 'questions' && (
          <QuestionsTab topicId={topic.id} questions={topic.questions} />
        )}
        {tab === 'notes' && <NotesTab notes={topic.notes} />}
        {tab === 'links' && <LinksTab links={topic.links} />}
      </div>
    </div>
  );
}
