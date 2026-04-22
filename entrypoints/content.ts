import type { QuestionDetectedMessage } from '@/lib/messages';

const TOPHAT_MATCHES = ['https://app.tophat.com/e/*'];
const QUESTION_SECTION_LABEL = 'questions & attendance';
const EMPTY_STATE_COPY = 'no questions or attendance sessions are being presented';
const EVALUATION_DELAY_MS = 150;

type VisibleQuestion = {
  questionKey: string;
  title: string;
};

export default defineContentScript({
  matches: TOPHAT_MATCHES,
  main(ctx) {
    let baselineCaptured = false;
    let currentVisibleKey: string | null = null;
    let lastAlertedKey: string | null = null;
    let evaluationTimer: number | null = null;

    const observer = new MutationObserver(() => {
      scheduleEvaluation();
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-click-id'],
      });
    }

    ctx.onInvalidated(() => {
      observer.disconnect();

      if (evaluationTimer !== null) {
        window.clearTimeout(evaluationTimer);
      }
    });

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      baselineCaptured = false;
      currentVisibleKey = null;
      lastAlertedKey = null;
      scheduleEvaluation(250);
    });

    scheduleEvaluation(350);

    function scheduleEvaluation(delay = EVALUATION_DELAY_MS) {
      if (evaluationTimer !== null) {
        window.clearTimeout(evaluationTimer);
      }

      evaluationTimer = window.setTimeout(() => {
        evaluationTimer = null;
        evaluateVisibleQuestion();
      }, delay);
    }

    function evaluateVisibleQuestion() {
      const visibleQuestion = findVisibleQuestion();

      if (!baselineCaptured) {
        baselineCaptured = true;
        currentVisibleKey = visibleQuestion?.questionKey ?? null;
        return;
      }

      if (!visibleQuestion) {
        currentVisibleKey = null;
        lastAlertedKey = null;
        return;
      }

      const nextQuestionKey = visibleQuestion.questionKey;

      if (currentVisibleKey === nextQuestionKey) {
        return;
      }

      currentVisibleKey = nextQuestionKey;

      if (lastAlertedKey === nextQuestionKey) {
        return;
      }

      lastAlertedKey = nextQuestionKey;

      const message: QuestionDetectedMessage = {
        type: 'question-detected',
        questionKey: nextQuestionKey,
        title: visibleQuestion.title,
      };

      void browser.runtime.sendMessage(message).catch(() => undefined);
    }
  },
});

function findVisibleQuestion(): VisibleQuestion | null {
  const classroomContentNav = document.querySelector<HTMLElement>(
    'nav[aria-label="Classroom Content"]',
  );

  if (!classroomContentNav) {
    return null;
  }

  const sectionHeading = findQuestionSectionHeading(classroomContentNav);

  if (!sectionHeading) {
    return null;
  }

  const sectionContainer = findQuestionSectionContainer(
    classroomContentNav,
    sectionHeading,
  );
  const titleElement = Array.from(
    sectionContainer.querySelectorAll<HTMLElement>('[data-click-id*="details title"]'),
  ).find(isVisible);

  if (!titleElement) {
    if (hasVisibleEmptyState()) {
      return null;
    }

    return null;
  }

  const title = normalizeText(titleElement.textContent);

  if (!title) {
    return null;
  }

  const questionKey = extractQuestionKey(titleElement, title);

  return {
    questionKey,
    title,
  };
}

function findQuestionSectionHeading(root: HTMLElement): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]'),
  );

  return (
    candidates.find((element) =>
      normalizeText(element.textContent).toLowerCase().startsWith(QUESTION_SECTION_LABEL),
    ) ?? null
  );
}

function findQuestionSectionContainer(
  root: HTMLElement,
  sectionHeading: HTMLElement,
): HTMLElement {
  let candidate: HTMLElement | null = sectionHeading.parentElement;

  while (candidate && candidate !== root) {
    if (
      candidate.querySelector('[data-click-id*="details title"]') ||
      candidate.querySelector('[data-click-id="blank state content"]') ||
      candidate.querySelector('ul, [role="list"]')
    ) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return sectionHeading.parentElement ?? root;
}

function extractQuestionKey(titleElement: HTMLElement, title: string): string {
  const clickableElement =
    titleElement.closest<HTMLElement>('[data-click-id]') ?? titleElement;
  const clickId = clickableElement.getAttribute('data-click-id') ?? '';
  const clickIdMatch = clickId.match(/tree item\s+(\d+)/i);

  if (clickIdMatch) {
    return `tree-item-${clickIdMatch[1]}`;
  }

  return `title-${normalizeKey(title)}`;
}

function hasVisibleEmptyState(): boolean {
  const blankStateElement = document.querySelector<HTMLElement>(
    '[data-click-id="blank state content"]',
  );

  if (
    blankStateElement &&
    isVisible(blankStateElement) &&
    normalizeText(blankStateElement.textContent).toLowerCase().includes(EMPTY_STATE_COPY)
  ) {
    return true;
  }

  return Array.from(document.querySelectorAll<HTMLElement>('div, p, span')).some(
    (element) =>
      isVisible(element) &&
      normalizeText(element.textContent).toLowerCase() === EMPTY_STATE_COPY,
  );
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeText(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true'
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
