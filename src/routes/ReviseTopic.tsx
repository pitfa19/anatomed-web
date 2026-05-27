import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { loadReviseTopic } from '../lib/data';
import type { ReviseTopic as Topic } from '../lib/types';
import QuestionsTab from '../components/revise/QuestionsTab';
import NotesTab from '../components/revise/NotesTab';
import DueBadge from '../components/revise/DueBadge';
import { dueCountForTopic } from '../lib/srs';
import { cn } from '../lib/cn';
import { useT, plural } from '../lib/i18n';
import type { TKey } from '../lib/i18n';

type Tab = 'questions' | 'notes';

const TABS: { id: Tab; labelKey: TKey }[] = [
  { id: 'questions', labelKey: 'revise.tabQuestions' },
  { id: 'notes', labelKey: 'revise.tabNotes' },
];

export default function ReviseTopic() {
  const t = useT();
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
        {t('revise.error', { error })}{' '}
        <Link to="/revise/teorija" className="underline">
          {t('revise.back').toLowerCase()}
        </Link>
      </div>
    );
  }
  if (!topic) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('decks.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <Link
          to="/revise/teorija"
          className="mb-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
        >
          <ArrowLeft size={12} /> {t('revise.allTopics')}
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
            {plural(t.lang, dueCount, {
              one: t('revise.practiceOnlyDueOne', { n: dueCount }),
              few: t('revise.practiceOnlyDueMany', { n: dueCount }),
              many: t('revise.practiceOnlyDueMany', { n: dueCount }),
            })}
          </Link>
        )}
        <div className="mt-3 flex gap-1 rounded-lg border border-border bg-surface p-1">
          {TABS.map((tab2) => (
            <button
              key={tab2.id}
              onClick={() => setTab(tab2.id)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm transition-colors',
                tab === tab2.id
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:bg-surface-2 hover:text-text-strong',
              )}
            >
              {t(tab2.labelKey)}
            </button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {tab === 'questions' && (
          <QuestionsTab topicId={topic.id} questions={topic.questions} />
        )}
        {tab === 'notes' && <NotesTab notes={topic.notes} />}
      </div>
    </div>
  );
}
