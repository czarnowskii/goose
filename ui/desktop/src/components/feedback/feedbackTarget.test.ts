import { beforeEach, describe, expect, it } from 'vitest';
import { buildFeedbackSelector, captureFeedbackTarget, getFeedbackElement } from './feedbackTarget';

describe('feedback target capture', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers stable feedback identifiers', () => {
    const element = document.createElement('div');
    element.dataset.feedbackId = 'model-provider-list';
    document.body.append(element);

    expect(buildFeedbackSelector(element)).toBe('[data-feedback-id="model-provider-list"]');
  });

  it('does not capture values or text from form controls', () => {
    const input = document.createElement('input');
    input.name = 'token';
    input.value = 'secret-value';
    document.body.append(input);

    const target = captureFeedbackTarget(input);

    expect(target.text).toBeUndefined();
    expect(JSON.stringify(target)).not.toContain('secret-value');
  });

  it('ignores the feedback interface itself', () => {
    const panel = document.createElement('aside');
    panel.dataset.feedbackUi = 'true';
    const button = document.createElement('button');
    panel.append(button);
    document.body.append(panel);

    expect(getFeedbackElement(button)).toBeNull();
  });
});
