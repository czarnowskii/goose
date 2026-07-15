import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackListResult } from '../../types/feedback';
import { FeedbackMode, getFeedbackComposerPosition } from './FeedbackMode';

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
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.assign(window.electron, {
      listFeedback: vi.fn(() => Promise.resolve(feedbackResult)),
      createFeedback: vi.fn(),
      resolveFeedback: vi.fn(),
    });
  });

  it('opens an unresolved-feedback panel from the keyboard shortcut', async () => {
    const onActiveChange = vi.fn();
    render(<FeedbackMode onActiveChange={onActiveChange} />);

    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true });

    expect(await screen.findByRole('complementary', { name: 'Unresolved feedback' })).toBeVisible();
    expect(screen.getByText('1 unresolved comment')).toBeVisible();
    expect(screen.getByText('Only show our configured providers.')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Unresolved feedback' })).toHaveStyle({
      width: '285px',
    });
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    await waitFor(() => expect(window.electron.listFeedback).toHaveBeenCalledOnce());
  });

  it('opens a floating composer beside the selected component', async () => {
    const { getByTestId } = render(
      <>
        <button data-testid="target" data-feedback-id="model-list">
          Model list
        </button>
        <FeedbackMode />
      </>
    );
    const target = getByTestId('target');
    target.getBoundingClientRect = vi.fn(
      () =>
        ({
          x: 100,
          y: 180,
          left: 100,
          top: 180,
          right: 300,
          bottom: 220,
          width: 200,
          height: 40,
          toJSON: () => ({}),
        }) as globalThis.DOMRect
    );

    fireEvent.keyDown(window, { key: 'f', metaKey: true, shiftKey: true });
    fireEvent.click(target);

    const composer = await screen.findByRole('dialog', { name: 'Add feedback' });
    expect(composer).toBeVisible();
    expect(composer).toHaveStyle({ left: '312px', top: '180px' });
    expect(screen.getByPlaceholderText('What should change?')).toHaveFocus();
  });
});

describe('getFeedbackComposerPosition', () => {
  it('moves the composer to the left when the side panel blocks the right', () => {
    const target = feedbackResult.comments[0].target;
    target.rect = { x: 700, y: 760, width: 100, height: 40 };

    expect(getFeedbackComposerPosition(target, 1200, 800)).toEqual({ left: 348, top: 558 });
  });
});
