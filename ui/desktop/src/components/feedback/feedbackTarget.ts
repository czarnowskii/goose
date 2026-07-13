import type { FeedbackTarget } from '../../types/feedback';

const safeAttributeNames = [
  'data-feedback-id',
  'role',
  'aria-label',
  'name',
  'type',
  'placeholder',
  'title',
];

function cssEscape(value: string): string {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

export function getFeedbackElement(target: globalThis.EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement) || target.closest('[data-feedback-ui="true"]')) {
    return null;
  }

  return target.closest<HTMLElement>('[data-feedback-id]') ?? target;
}

export function buildFeedbackSelector(element: HTMLElement): string {
  const feedbackId = element.dataset.feedbackId;
  if (feedbackId) {
    return `[data-feedback-id="${cssEscape(feedbackId)}"]`;
  }

  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body && parts.length < 5) {
    let part = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (parent) {
      const currentTagName = current.tagName;
      const siblings: globalThis.Element[] = Array.from(parent.children).filter(
        (child) => child.tagName === currentTagName
      );
      if (siblings.length > 1) {
        part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(part);
    current = parent;
  }

  return parts.join(' > ');
}

export function captureFeedbackTarget(element: HTMLElement): FeedbackTarget {
  const bounds = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const attributes = Object.fromEntries(
    safeAttributeNames.flatMap((name) => {
      const value = element.getAttribute(name);
      return value ? [[name, value]] : [];
    })
  );
  const containsSensitiveText =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable;
  const text = containsSensitiveText
    ? undefined
    : element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || undefined;

  return {
    selector: buildFeedbackSelector(element),
    feedbackId: element.dataset.feedbackId,
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute('role') || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    text,
    attributes,
    computedStyle: {
      display: style.display,
      position: style.position,
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
    },
    rect: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    route: `${window.location.pathname}${window.location.hash}`,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
  };
}
