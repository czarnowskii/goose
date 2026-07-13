export type FeedbackStatus = 'open' | 'resolved';

export type FeedbackRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FeedbackTarget = {
  selector: string;
  feedbackId?: string;
  tagName: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  attributes: Record<string, string>;
  computedStyle: {
    display: string;
    position: string;
    color: string;
    backgroundColor: string;
    fontSize: string;
  };
  rect: FeedbackRect;
  route: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

export type FeedbackComment = {
  id: string;
  number: number;
  comment: string;
  status: FeedbackStatus;
  target: FeedbackTarget;
  screenshotPath?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type FeedbackStore = {
  version: 1;
  nextNumber: number;
  comments: FeedbackComment[];
};

export type FeedbackDraft = {
  comment: string;
  target: FeedbackTarget;
};

export type FeedbackListResult = {
  comments: FeedbackComment[];
  storePath: string;
};
