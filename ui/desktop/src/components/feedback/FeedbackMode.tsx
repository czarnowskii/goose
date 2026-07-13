import { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquarePlus, MousePointer2, X } from 'lucide-react';
import type { FeedbackComment, FeedbackTarget } from '../../types/feedback';
import { captureFeedbackTarget, getFeedbackElement } from './feedbackTarget';

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

function targetLabel(target: FeedbackTarget): string {
  return target.feedbackId || target.ariaLabel || target.selector;
}

export function FeedbackMode() {
  const [active, setActive] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState<FeedbackTarget | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<FeedbackTarget | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [storePath, setStorePath] = useState('');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const refreshComments = useCallback(async () => {
    try {
      const result = await window.electron.listFeedback();
      setComments(result.comments);
      setStorePath(result.storePath);
      setError('');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    }
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setActive((current) => !current);
        setSelectedTarget(null);
        setHoveredTarget(null);
        setComment('');
      } else if (event.key === 'Escape' && active) {
        event.preventDefault();
        if (selectedTarget) {
          setSelectedTarget(null);
          setComment('');
        } else {
          setActive(false);
          setHoveredTarget(null);
        }
      }
    };

    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, [active, selectedTarget]);

  useEffect(() => {
    if (active) {
      void refreshComments();
    }
  }, [active, refreshComments]);

  useEffect(() => {
    if (!active || selectedTarget) {
      return;
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const element = getFeedbackElement(event.target);
      setHoveredTarget(element ? captureFeedbackTarget(element) : null);
    };
    const handleClick = (event: MouseEvent) => {
      const element = getFeedbackElement(event.target);
      if (!element) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setSelectedTarget(captureFeedbackTarget(element));
      setHoveredTarget(null);
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('click', handleClick, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('click', handleClick, true);
    };
  }, [active, selectedTarget]);

  const saveFeedback = async () => {
    if (!selectedTarget || !comment.trim()) {
      return;
    }

    setSaving(true);
    setError('');
    setCapturing(true);
    try {
      await nextFrame();
      await window.electron.createFeedback({ comment: comment.trim(), target: selectedTarget });
      setComment('');
      setSelectedTarget(null);
      await refreshComments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setCapturing(false);
      setSaving(false);
    }
  };

  const resolveFeedback = async (id: string) => {
    try {
      await window.electron.resolveFeedback(id);
      await refreshComments();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
    }
  };

  if (!active) {
    return null;
  }

  const highlight = selectedTarget || hoveredTarget;

  return (
    <>
      {!capturing && highlight && (
        <div
          data-feedback-ui="true"
          className="fixed pointer-events-none z-[9997] rounded-sm border-2 border-purple-500 bg-purple-500/10 shadow-[0_0_0_1px_rgba(255,255,255,0.8)]"
          style={{
            left: highlight.rect.x,
            top: highlight.rect.y,
            width: highlight.rect.width,
            height: highlight.rect.height,
          }}
        />
      )}

      {!capturing && !selectedTarget && (
        <div
          data-feedback-ui="true"
          className="fixed left-1/2 top-10 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-xl"
        >
          <MousePointer2 className="h-4 w-4" />
          Select an interface element to comment on
        </div>
      )}

      {!capturing && (
        <aside
          data-feedback-ui="true"
          className="fixed bottom-0 right-0 top-0 z-[9998] flex w-[380px] flex-col border-l border-border-primary bg-background-primary shadow-2xl"
          aria-label="Unresolved feedback"
        >
          <div className="titlebar-drag-region h-7 shrink-0" />
          <header className="flex items-start justify-between border-b border-border-primary px-5 pb-4 pt-3">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5 text-purple-500" />
                <h2 className="text-base font-semibold text-text-primary">Feedback mode</h2>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {comments.length} unresolved {comments.length === 1 ? 'comment' : 'comments'}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-text-secondary hover:bg-background-secondary hover:text-text-primary"
              onClick={() => setActive(false)}
              aria-label="Exit feedback mode"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          {selectedTarget && (
            <section className="border-b border-border-primary bg-purple-500/5 p-4">
              <p className="mb-2 truncate text-xs font-medium text-purple-500">
                {targetLabel(selectedTarget)}
              </p>
              <textarea
                autoFocus
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="What should change?"
                className="min-h-24 w-full resize-y rounded-lg border border-border-primary bg-background-primary p-3 text-sm text-text-primary outline-none focus:border-purple-500"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-background-secondary"
                  onClick={() => {
                    setSelectedTarget(null);
                    setComment('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!comment.trim() || saving}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void saveFeedback()}
                >
                  {saving ? 'Saving…' : 'Save feedback'}
                </button>
              </div>
            </section>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">
                {error}
              </div>
            )}
            {comments.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center text-text-secondary">
                <Check className="mb-3 h-8 w-8 text-green-500" />
                <p className="text-sm font-medium text-text-primary">No unresolved feedback</p>
                <p className="mt-1 text-xs">
                  Select any element in Goose to add the first comment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-border-primary bg-background-secondary p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-xs font-semibold text-purple-500">
                        #{item.number}
                      </span>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-background-primary hover:text-green-500"
                        onClick={() => void resolveFeedback(item.id)}
                      >
                        <Check className="h-3.5 w-3.5" /> Resolve
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
                      {item.comment}
                    </p>
                    <p className="mt-2 truncate text-xs text-text-secondary">
                      {targetLabel(item.target)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>

          <footer className="border-t border-border-primary px-4 py-3 text-[11px] text-text-secondary">
            <div>⌘⇧F toggle · Esc cancel</div>
            {storePath && (
              <div className="mt-1 truncate" title={storePath}>
                {storePath}
              </div>
            )}
          </footer>
        </aside>
      )}
    </>
  );
}
