import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ChatLog from '../components/agent/ChatLog';
import Composer from '../components/agent/Composer';
import OutOfTokensModal from '../components/ai/OutOfTokensModal';
import LowBalanceBanner from '../components/ai/LowBalanceBanner';
import {
  chat,
  MissingApiKeyError,
  summarizeMessages,
  type ToolStatus,
} from '../lib/agent';
import type { ChatMessage } from '../lib/types';
import { useAuth } from '../lib/AuthContext';
import { LOW_BALANCE_THRESHOLD, FEATURE_LABEL_KEY } from '../lib/packages';
import { useT } from '../lib/i18n';
import type { TKey, TFn } from '../lib/i18n';
import { Sparkles } from 'lucide-react';

const SUGGESTED: TKey[] = [
  'agent.suggested1',
  'agent.suggested2',
  'agent.suggested3',
  'agent.suggested4',
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
  const t = useT();
  const initial = loadChat();
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [summary, setSummary] = useState<string>(initial.summary);
  const [summarizedThrough, setSummarizedThrough] = useState<number>(
    initial.summarizedThrough,
  );
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ToolStatus>(null);
  const [streamingText, setStreamingText] = useState('');
  const [seed, setSeed] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, consumeTokens } = useAuth();
  const [showBuyModal, setShowBuyModal] = useState(false);
  // Abort controller for the in-flight turn (Stop button). `latestStream` keeps
  // the partial answer so Stop can commit what streamed in so far.
  const abortRef = useRef<AbortController | null>(null);
  const latestStream = useRef('');

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

  // Run one assistant turn against `history` (which already ends with the
  // user message to answer). Shared by send() and regenerate().
  async function runTurn(history: ChatMessage[]) {
    // Token gate. Signed-out users keep the existing free-prototype path
    // (no balance attached) so the agent stays usable without an account.
    if (user) {
      let result;
      try {
        result = await consumeTokens('agent_chat');
      } catch (err) {
        const errText = t('agent.creditCheckError', {
          error: err instanceof Error ? err.message : String(err),
        });
        setMessages((m) => [
          ...m,
          { id: uid(), role: 'assistant', text: errText, ts: Date.now() },
        ]);
        return;
      }
      if (!result.ok) {
        setShowBuyModal(true);
        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: 'assistant',
            text: t('agent.noCredits'),
            ts: Date.now(),
          },
        ]);
        return;
      }
    }

    setPending(true);
    setStreamingText('');
    latestStream.current = '';
    const controller = new AbortController();
    abortRef.current = controller;

    let activeSummary = summary;
    let activeSummarizedThrough = summarizedThrough;

    try {
      // Roll the window: anything older than the last WINDOW_SIZE messages
      // gets folded into the summary before the API call.
      const targetSummarizedThrough = Math.max(0, history.length - WINDOW_SIZE);
      if (targetSummarizedThrough > activeSummarizedThrough) {
        const toSummarize = history.slice(activeSummarizedThrough, targetSummarizedThrough);
        setStatus({ phase: 'summarizing' });
        activeSummary = await summarizeMessages(toSummarize, activeSummary, t.lang);
        activeSummarizedThrough = targetSummarizedThrough;
        setSummary(activeSummary);
        setSummarizedThrough(activeSummarizedThrough);
      }

      const windowed = history.slice(activeSummarizedThrough);
      const replyText = await chat(windowed, {
        onStatus: setStatus,
        onDelta: (s) => {
          latestStream.current = s;
          setStreamingText(s);
        },
        summary: activeSummary || undefined,
        lang: t.lang,
        signal: controller.signal,
      });
      const replyMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        text: replyText,
        ts: Date.now(),
      };
      setMessages((m) => [...m, replyMsg]);
    } catch (err) {
      // Stop button: keep whatever streamed in so far, no error bubble.
      if (controller.signal.aborted) {
        const partial = latestStream.current.trim();
        if (partial) {
          setMessages((m) => [
            ...m,
            { id: uid(), role: 'assistant', text: latestStream.current, ts: Date.now() },
          ]);
        }
        return;
      }
      const errText =
        err instanceof MissingApiKeyError
          ? t('agent.missingApiKey')
          : t('agent.genericError', {
              error: err instanceof Error ? err.message : String(err),
            });
      setMessages((m) => [
        ...m,
        { id: uid(), role: 'assistant', text: errText, ts: Date.now() },
      ]);
    } finally {
      setPending(false);
      setStatus(null);
      setStreamingText('');
      abortRef.current = null;
    }
  }

  async function send(text: string) {
    // Add the user message first so it's always visible — without this,
    // an early return inside runTurn (out-of-tokens, RPC error) makes the
    // typed message look like it silently vanished.
    const userMsg: ChatMessage = { id: uid(), role: 'user', text, ts: Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setSeed(undefined);
    await runTurn(nextHistory);
  }

  function regenerate() {
    if (pending) return;
    // Drop the trailing assistant message(s) and re-run from the last user turn.
    let end = messages.length;
    while (end > 0 && messages[end - 1]?.role === 'assistant') end--;
    if (end === 0) return;
    const history = messages.slice(0, end);
    setMessages(history);
    void runTurn(history);
  }

  function stop() {
    abortRef.current?.abort();
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
        <span>{t('agent.conversation')}</span>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="rounded px-2 py-1 hover:bg-surface-2 hover:text-text-strong"
          >
            {t('agent.newConversation')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onSend={send} t={t} />
        ) : (
          <ChatLog
            messages={messages}
            pending={pending}
            status={status}
            streamingText={streamingText}
            onRegenerate={regenerate}
          />
        )}
      </div>
      {user && user.credits > 0 && user.credits <= LOW_BALANCE_THRESHOLD && (
        <LowBalanceBanner credits={user.credits} onBuy={() => setShowBuyModal(true)} />
      )}
      <Composer onSend={send} pending={pending} initial={seed} onStop={stop} />
      <OutOfTokensModal
        open={showBuyModal}
        onClose={() => setShowBuyModal(false)}
        featureLabel={t(FEATURE_LABEL_KEY.agent_chat)}
      />
    </div>
  );
}

function EmptyState({ onSend, t }: { onSend: (text: string) => void; t: TFn }) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white">
        <Sparkles size={26} />
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-text-strong">{t('agent.emptyTitle')}</h2>
        <p className="mt-2 text-sm text-text-muted">
          {t('agent.emptyDesc')}
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED.map((key) => {
          const text = t(key);
          return (
            <button
              key={key}
              onClick={() => onSend(text)}
              className="rounded-xl border border-border bg-surface p-3 text-left text-sm text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
