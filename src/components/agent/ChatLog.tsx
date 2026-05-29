import { Suspense, lazy, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
import type { Anatomy3DConfig, ChatMessage } from '../../lib/types';
import type { ToolStatus } from '../../lib/agent';
import { useT } from '../../lib/i18n';
import type { TFn, TKey } from '../../lib/i18n';

const InlineAnatomy3D = lazy(() => import('./InlineAnatomy3D'));

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  status?: ToolStatus;
  /** The answer currently streaming in, if any. Rendered as a live assistant
   *  bubble; empty while the model is still thinking / running a tool. */
  streamingText?: string;
  /** Re-run the last user turn (shown under the last assistant message). */
  onRegenerate?: () => void;
}

// Text to put on the clipboard: drop the machine-only `anatomy-3d` fenced
// block (it's a render directive, not something a student wants pasted).
function toCopyText(md: string): string {
  return md
    .replace(/```anatomy-3d[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TOOL_LABEL_KEYS: Record<string, TKey> = {
  search_skripte: 'agent.toolSearchNotes',
  prikaz_3d: 'agent.toolRender3d',
};

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractText(props?.children);
  }
  return '';
}

function isAnatomy3DConfig(v: unknown): v is Anatomy3DConfig {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== 'string') return false;
  if (!o.focus || typeof o.focus !== 'object') return false;
  const f = o.focus as Record<string, unknown>;
  if (typeof f.id !== 'string' || typeof f.system !== 'string') return false;
  if (!Array.isArray(o.extras)) return false;
  return true;
}

function statusLabel(status: ToolStatus, t: TFn): { text: string; detail?: string } {
  if (!status) return { text: t('agent.thinking') };
  if (status.phase === 'thinking') return { text: t('agent.thinking') };
  if (status.phase === 'summarizing') return { text: t('agent.summarizing') };
  const labelKey = TOOL_LABEL_KEYS[status.name];
  const base = labelKey ? t(labelKey) : t('agent.runningTool', { name: status.name });
  const q = (status.input as { query?: unknown })?.query;
  return {
    text: base,
    detail: typeof q === 'string' && q.trim() ? `“${q.trim()}”` : undefined,
  };
}

// Markdown rendering is memoized per message so a streaming answer (which
// re-renders this component ~100×) doesn't force every completed message to
// re-parse its markdown on each token. `t` is referentially stable (memoized
// in useT), so completed bubbles skip re-render entirely while text streams.
const Markdown = memo(function Markdown({ text, t }: { text: string; t: TFn }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (props) => <p className="my-1.5 first:mt-0 last:mb-0">{props.children}</p>,
        h1: (props) => (
          <h2 className="mb-1.5 mt-4 text-base font-semibold text-text-strong first:mt-0">
            {props.children}
          </h2>
        ),
        h2: (props) => (
          <h2 className="mb-1.5 mt-4 text-base font-semibold text-text-strong first:mt-0">
            {props.children}
          </h2>
        ),
        h3: (props) => (
          <h3 className="mb-1 mt-3 text-sm font-semibold text-text-strong first:mt-0">
            {props.children}
          </h3>
        ),
        h4: (props) => (
          <h4 className="mb-1 mt-3 text-sm font-semibold text-text-strong first:mt-0">
            {props.children}
          </h4>
        ),
        ul: (props) => (
          <ul className="my-1.5 list-disc space-y-0.5 pl-5 marker:text-text-muted">
            {props.children}
          </ul>
        ),
        ol: (props) => (
          <ol className="my-1.5 list-decimal space-y-0.5 pl-5 marker:text-text-muted">
            {props.children}
          </ol>
        ),
        li: (props) => <li className="leading-relaxed">{props.children}</li>,
        hr: () => <hr className="my-3 border-border" />,
        blockquote: (props) => (
          <blockquote className="my-2 border-l-2 border-border pl-3 text-text-muted">
            {props.children}
          </blockquote>
        ),
        table: (props) => (
          <div className="my-2 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">{props.children}</table>
          </div>
        ),
        thead: (props) => (
          <thead className="border-b border-border bg-surface text-left text-text-strong">
            {props.children}
          </thead>
        ),
        tbody: (props) => <tbody>{props.children}</tbody>,
        tr: (props) => (
          <tr className="border-b border-border/50 last:border-b-0">{props.children}</tr>
        ),
        th: (props) => (
          <th className="px-2 py-1.5 font-semibold align-top">{props.children}</th>
        ),
        td: (props) => <td className="px-2 py-1.5 align-top">{props.children}</td>,
        strong: (props) => (
          <strong className="font-semibold text-text-strong">{props.children}</strong>
        ),
        em: (props) => <em className="text-text-muted">{props.children}</em>,
        code: (props) => {
          const className = (props as { className?: string }).className ?? '';
          if (/\blanguage-anatomy-3d\b/.test(className)) {
            const raw = extractText(props.children).trim();
            try {
              const parsed = JSON.parse(raw);
              if (isAnatomy3DConfig(parsed)) {
                return (
                  <Suspense
                    fallback={
                      <div className="my-3 flex h-72 items-center justify-center rounded-xl border border-border bg-surface text-xs text-text-muted">
                        <Loader2 size={14} className="mr-2 animate-spin" />
                        {t('agent.loading3d')}
                      </div>
                    }
                  >
                    <InlineAnatomy3D config={parsed} />
                  </Suspense>
                );
              }
            } catch {
              /* fall through to <code> — partial JSON while streaming */
            }
            // The anatomy-3d block hasn't fully arrived yet: show a quiet
            // placeholder instead of a wall of half-streamed JSON.
            return (
              <div className="my-3 flex h-72 items-center justify-center rounded-xl border border-border bg-surface text-xs text-text-muted">
                <Loader2 size={14} className="mr-2 animate-spin" />
                {t('agent.loading3d')}
              </div>
            );
          }
          return (
            <code className="rounded bg-surface px-1 py-0.5 text-xs text-accent">
              {props.children}
            </code>
          );
        },
        pre: (props) => {
          const child = props.children as ReactNode;
          const childClass =
            (child as { props?: { className?: string } } | null | undefined)?.props
              ?.className ?? '';
          if (/\blanguage-anatomy-3d\b/.test(String(childClass))) {
            return <>{props.children}</>;
          }
          return (
            <pre className="my-2 overflow-x-auto rounded-md bg-surface p-2 text-xs text-text-muted">
              {props.children}
            </pre>
          );
        },
        a: (props) => {
          const href = props.href ?? '';
          const isDocsLink = href.startsWith('/docs?');
          const isInternal = href.startsWith('/');
          if (isDocsLink) {
            return (
              <Link
                to={href}
                className="my-0.5 mr-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent no-underline transition-colors hover:border-accent/60 hover:bg-accent/20"
              >
                <BookOpen size={12} className="shrink-0" />
                <span className="truncate">{props.children}</span>
                <ChevronRight size={12} className="shrink-0 opacity-60" />
              </Link>
            );
          }
          if (isInternal) {
            return (
              <Link to={href} className="text-accent underline hover:text-accent-2">
                {props.children}
              </Link>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:text-accent-2"
            >
              {props.children}
            </a>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
});

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return (
    <div
      className={
        'mt-1 flex size-8 shrink-0 items-center justify-center rounded-full ' +
        (role === 'user'
          ? 'bg-surface-2 text-text-muted'
          : 'bg-gradient-to-br from-accent to-accent-2 text-white')
      }
    >
      {role === 'user' ? <User size={15} /> : <Bot size={15} />}
    </div>
  );
}

export default function ChatLog({
  messages,
  pending,
  status,
  streamingText,
  onRegenerate,
}: Props) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);
  const streaming = pending && !!streamingText;
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending]);

  // Keep the growing answer in view as it streams (instant, not smooth, so it
  // doesn't lag behind the text).
  useEffect(() => {
    if (streamingText) endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [streamingText]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      {messages.map((m) => (
        <div key={m.id} className="flex gap-3">
          <Avatar role={m.role} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-muted">
              {m.role === 'user' ? t('agent.you') : t('nav.agent')}
            </div>
            <div className="mt-1 max-w-prose text-sm leading-relaxed text-text break-words">
              <Markdown text={m.text} t={t} />
            </div>
            {m.role === 'assistant' && (
              <MessageActions
                text={m.text}
                t={t}
                canRegenerate={!pending && m.id === lastId && !!onRegenerate}
                onRegenerate={onRegenerate}
              />
            )}
          </div>
        </div>
      ))}

      {streaming && (
        <div className="flex gap-3">
          <Avatar role="assistant" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-muted">{t('nav.agent')}</div>
            <div className="mt-1 max-w-prose text-sm leading-relaxed text-text break-words">
              <Markdown text={streamingText!} t={t} />
              <span className="ml-0.5 inline-block h-3.5 w-[2px] -mb-0.5 animate-pulse bg-accent align-baseline" />
            </div>
          </div>
        </div>
      )}

      {pending && !streaming && (
        <div className="flex gap-3">
          <Avatar role="assistant" />
          <div className="flex flex-col gap-1.5 pt-1.5">
            <PendingIndicator status={status ?? null} />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function MessageActions({
  text,
  t,
  canRegenerate,
  onRegenerate,
}: {
  text: string;
  t: TFn;
  canRegenerate: boolean;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(toCopyText(text));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (insecure context / permissions) — no-op
    }
  }

  const btn =
    'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text';

  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button onClick={copy} className={btn} aria-label={t('agent.copy')}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span>{copied ? t('agent.copied') : t('agent.copy')}</span>
      </button>
      {canRegenerate && (
        <button onClick={onRegenerate} className={btn} aria-label={t('agent.regenerate')}>
          <RefreshCw size={13} />
          <span>{t('agent.regenerate')}</span>
        </button>
      )}
    </div>
  );
}

function PendingIndicator({ status }: { status: ToolStatus }) {
  const t = useT();
  const isTool = !!status && status.phase === 'tool';
  const { text, detail } = statusLabel(status ?? null, t);
  return (
    <div
      className={
        'inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs ' +
        (isTool
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border bg-surface text-text-muted')
      }
    >
      {isTool ? (
        <Search size={12} className="shrink-0" />
      ) : (
        <Loader2 size={12} className="shrink-0 animate-spin" />
      )}
      <span className="truncate">
        {text}
        {detail ? <span className="ml-1 text-text-muted">{detail}</span> : null}
      </span>
      <Dots />
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="size-1 animate-pulse rounded-full bg-current opacity-70"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
