import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { Bot, BookOpen, ChevronRight, Loader2, Search, User } from 'lucide-react';
import type { Anatomy3DConfig, ChatMessage } from '../../lib/types';
import type { ToolStatus } from '../../lib/agent';
import { useT } from '../../lib/i18n';
import type { TFn, TKey } from '../../lib/i18n';

const InlineAnatomy3D = lazy(() => import('./InlineAnatomy3D'));

interface Props {
  messages: ChatMessage[];
  pending: boolean;
  status?: ToolStatus;
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

export default function ChatLog({ messages, pending, status }: Props) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      {messages.map((m) => (
        <div key={m.id} className="flex gap-3">
          <div
            className={
              'mt-1 flex size-8 shrink-0 items-center justify-center rounded-full ' +
              (m.role === 'user'
                ? 'bg-surface-2 text-text-muted'
                : 'bg-gradient-to-br from-accent to-accent-2 text-white')
            }
          >
            {m.role === 'user' ? <User size={15} /> : <Bot size={15} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-text-muted">
              {m.role === 'user' ? t('agent.you') : t('nav.agent')}
            </div>
            <div className="mt-1 max-w-prose text-sm leading-relaxed text-text break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: (props) => (
                    <p className="my-1.5 first:mt-0 last:mb-0">{props.children}</p>
                  ),
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
                      <table className="min-w-full border-collapse text-xs">
                        {props.children}
                      </table>
                    </div>
                  ),
                  thead: (props) => (
                    <thead className="border-b border-border bg-surface text-left text-text-strong">
                      {props.children}
                    </thead>
                  ),
                  tbody: (props) => <tbody>{props.children}</tbody>,
                  tr: (props) => (
                    <tr className="border-b border-border/50 last:border-b-0">
                      {props.children}
                    </tr>
                  ),
                  th: (props) => (
                    <th className="px-2 py-1.5 font-semibold align-top">{props.children}</th>
                  ),
                  td: (props) => (
                    <td className="px-2 py-1.5 align-top">{props.children}</td>
                  ),
                  strong: (props) => (
                    <strong className="font-semibold text-text-strong">
                      {props.children}
                    </strong>
                  ),
                  em: (props) => <em className="text-text-muted">{props.children}</em>,
                  code: (props) => {
                    const className =
                      (props as { className?: string }).className ?? '';
                    if (/\blanguage-anatomy-3d\b/.test(className)) {
                      const raw = extractText(props.children).trim();
                      try {
                        const parsed = JSON.parse(raw);
                        if (isAnatomy3DConfig(parsed)) {
                          return (
                            <Suspense
                              fallback={
                                <div className="my-3 flex h-72 items-center justify-center rounded-xl border border-border bg-surface text-xs text-text-muted">
                                  <Loader2
                                    size={14}
                                    className="mr-2 animate-spin"
                                  />
                                  {t('agent.loading3d')}
                                </div>
                              }
                            >
                              <InlineAnatomy3D config={parsed} />
                            </Suspense>
                          );
                        }
                      } catch {
                        /* fall through to <code> */
                      }
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
                      (
                        child as
                          | { props?: { className?: string } }
                          | null
                          | undefined
                      )?.props?.className ?? '';
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
                {m.text}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ))}
      {pending && (
        <div className="flex gap-3">
          <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white">
            <Bot size={15} />
          </div>
          <div className="flex flex-col gap-1.5 pt-1.5">
            <PendingIndicator status={status ?? null} />
          </div>
        </div>
      )}
      <div ref={endRef} />
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
