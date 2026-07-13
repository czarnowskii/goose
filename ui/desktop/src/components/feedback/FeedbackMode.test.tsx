import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackListResult } from '../../types/feedback';
import { FeedbackMode } from './FeedbackMode';

const feedbackResult: FeedbackListResult = {
  storePath: '/tmp/feedback/feedback.json',
  comments: [
    {
      id: 'feedback-1',
      number: 1,
      comment: 'Only show our configured providers.',
      status: 'open',
      createdAt: '2026-07-13T12:00:00.000Z',
      target: {
        selector: '[data-feedback-id="model-provider-list"]',
        feedbackId: 'model-provider-list',
        tagName: 'div',
        attributes: { 'data-feedback-id': 'model-provider-list' },
        computedStyle: {
          display: 'block',
          position: 'static',
          color: 'rgb(0, 0, 0)',
          backgroundColor: 'rgba(0, 0, 0, 0)',
          fontSize: '14px',
        },
        rect: { x: 20, y: 20, width: 200, height: 40 },
        route: '/#/settings',
        viewport: { width: 1200, height: 800, devicePixelRatio: 2 },
      },
    },
  ],
};

describe('FeedbackMode', () => {
  beforeEach(() => {
    Object.assign(window.electron, {
      listFeedback: vi.fn(() => Promise.resolve(feedbackResult)),
      createFeedback: vi.fn(),
      resolveFeedback: vi.fn(),
    });
  });

  it('opens an unresolved-feedback panel from the keyboard shortcut', async () => {
    render(<FeedbackMode />);

    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true });

    expect(await screen.findByRole('complementary', { name: 'Unresolved feedback' })).toBeVisible();
    expect(screen.getByText('1 unresolved comment')).toBeVisible();
    expect(screen.getByText('Only show our configured providers.')).toBeVisible();
    await waitFor(() => expect(window.electron.listFeedback).toHaveBeenCalledOnce());
  });
});
