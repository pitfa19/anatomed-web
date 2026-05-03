import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ChatLog from '../components/agent/ChatLog';
import Composer from '../components/agent/Composer';
import {
  chat,
  MissingApiKeyError,
  summarizeMessages,
  type ToolStatus,
} from '../lib/agent';
import type { ChatMessage } from '../lib/types';
import { Sparkles } from 'lucide-react';

const SUGGESTED = [
  'Što prolazi kroz fissura orbitalis superior?',
  'Razlika između neurocraniuma i viscerocraniuma?',
  'Generiraj 5 pitanja iz Skripte A1.',
  'Otvori stranicu o vaskularizaciji leđa.',
];

const STORAGE_KEY = 'anatomed.agent.chat.v1';
const WINDOW_SIZE = 6;

interface PersistedChat {
  messages: ChatMessage[];
  summary: string;
  summarizedThrough: number;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function loadChat(): PersistedChat {
  const empty: PersistedChat = { messages: [], summary: '', summarizedThrough: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // backwards-compat: v1 stored just an array of messages.
    if (Array.isArray(parsed)) {
      return { messages: parsed as ChatMessage[], summary: '', summarizedThrough: 0 };
    }
    if (parsed && Array.isArray(parsed.messages)) {
      return {
        messages: parsed.messages as ChatMessage[],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        summarizedThrough:
          typeof parsed.summarizedThrough === 'number' ? parsed.summarizedThrough : 0,
      };
    }
    return empty;
  } catch {
    return empty;
  }
}

export default function Agent() {
  const initial = loadChat();
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [summary, setSummary] = useState<string>(initial.summary);
  const [summarizedThrough, setSummarizedThrough] = useState<number>(
    initial.summarizedThrough,
  );
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ToolStatus>(null);
  const [seed, setSeed] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Pre-fill the composer when navigated to with `?prompt=...` (e.g. from
  // the home page agent bento tile). Strip the param after consuming so a
  // refresh doesn't re-seed.
  useEffect(() => {
    const prompt = searchParams.get('prompt');
    if (prompt) {
      setSeed(prompt);
      const next = new URLSearchParams(searchParams);
      next.delete('prompt');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    try {
      if (messages.length === 0 && !summary) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload: PersistedChat = { messages, summary, summarizedThrough };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage unavailable (private mode, quota) - fail silently
    }
  }, [messages, summary, summarizedThrough]);

  async function send(text: string) {
    const userMsg: ChatMessage = { id: uid(), role: 'user', text, ts: Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setPending(true);
    setSeed(undefined);

    let activeSummary = summary;
    let activeSummarizedThrough = summarizedThrough;

    try {
      // Roll the window: anything older than the last WINDOW_SIZE messages
      // gets folded into the summary before the API call.
      const targetSummarizedThrough = Math.max(0, nextHistory.length - WINDOW_SIZE);
      if (targetSummarizedThrough > activeSummarizedThrough) {
        const toSummarize = nextHistory.slice(
          activeSummarizedThrough,
          targetSummarizedThrough,
        );
        setStatus({ phase: 'summarizing' });
        activeSummary = await summarizeMessages(toSummarize, activeSummary);
        activeSummarizedThrough = targetSummarizedThrough;
        setSummary(activeSummary);
        setSummarizedThrough(activeSummarizedThrough);
      }

      const windowed = nextHistory.slice(activeSummarizedThrough);
      const replyText = await chat(windowed, {
        onStatus: setStatus,
        summary: activeSummary || undefined,
      });
      const replyMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: replyText,
        ts: Date.now(),
      };
      setMessages((m) => [...m, replyMsg]);
    } catch (err) {
      const errText =
        err instanceof MissingApiKeyError
          ? 'API ključ nije postavljen na poslužitelju. Dodaj `ANTHROPIC_API_KEY` u Vercel env vars (ili u `.env.local` za `vercel dev`).'
          : `Greška: ${err instanceof Error ? err.message : String(err)}`;
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', text: errText, ts: Date.now() },
      ]);
    } finally {
      setPending(false);
      setStatus(null);
    }
  }

  function reset() {
    setMessages([]);
    setSummary('');
    setSummarizedThrough(0);
    setSeed(undefined);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface/60 px-4 py-2 text-xs text-text-muted">
        <span>Razgovor s agentom</span>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="rounded px-2 py-1 hover:bg-surface-2 hover:text-text-strong"
          >
            Novi razgovor
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onPick={(t) => setSeed(t)} />
        ) : (
          <ChatLog messages={messages} pending={pending} status={status} />
        )}
      </div>
      <Composer onSend={send} pending={pending} initial={seed} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white">
        <Sparkles size={26} />
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-text-strong">Pitaj asistenta</h2>
        <p className="mt-2 text-sm text-text-muted">
          Postavi pitanje o anatomiji ili predloži zadatak.
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-xl border border-border bg-surface p-3 text-left text-sm text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
