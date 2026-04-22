import {
  findSoundById,
  readAlertSettings,
} from '@/lib/alert-settings';
import {
  isPreviewSoundMessage,
  isQuestionDetectedMessage,
  type PlaySoundMessage,
  type PreviewSoundMessage,
  type QuestionDetectedMessage,
} from '@/lib/messages';

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const TOPHAT_URL_PREFIX = 'https://app.tophat.com/e/';

let creatingOffscreenDocument: Promise<void> | null = null;

export default defineBackground(() => {
  registerMessageHandlers();
  void restrictStorageAccess();
});

function registerMessageHandlers() {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isQuestionDetectedMessage(message)) {
      void handleQuestionDetectedMessage(message, sender)
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: getErrorMessage(error) });
        });

      return true;
    }

    if (isPreviewSoundMessage(message)) {
      void handlePreviewSoundMessage(message)
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: getErrorMessage(error) });
        });

      return true;
    }

    return undefined;
  });
}

async function handleQuestionDetectedMessage(
  message: QuestionDetectedMessage,
  sender: Parameters<
    Parameters<typeof browser.runtime.onMessage.addListener>[0]
  >[1],
) {
  if (!sender.url?.startsWith(TOPHAT_URL_PREFIX)) {
    return;
  }

  const settings = await readAlertSettings();
  const activeSound =
    findSoundById(settings, settings.activeSoundId) ?? settings.sounds[0];

  if (!activeSound) {
    return;
  }

  await playSoundInOffscreenDocument({
    target: 'offscreen',
    type: 'play-sound',
    sound: activeSound,
    volume: settings.volume,
    mode: 'alert',
  });
}

async function handlePreviewSoundMessage(
  message: PreviewSoundMessage,
) {
  const settings = await readAlertSettings();
  const sound = findSoundById(settings, message.soundId);

  if (!sound) {
    throw new Error('Unable to preview a sound that does not exist.');
  }

  await playSoundInOffscreenDocument({
    target: 'offscreen',
    type: 'play-sound',
    sound,
    volume: clampPreviewVolume(message.volume),
    mode: 'preview',
  });
}

async function playSoundInOffscreenDocument(message: PlaySoundMessage) {
  await ensureOffscreenDocument();
  const response = await browser.runtime.sendMessage(message);

  if (response?.ok === false) {
    throw new Error(
      typeof response.error === 'string'
        ? response.error
        : 'Sound playback failed.',
    );
  }
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = browser.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play alert and preview sounds for Top Hat question notifications.',
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function hasOffscreenDocument(): Promise<boolean> {
  const offscreenUrl = browser.runtime.getURL('/offscreen.html' as never);
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  return contexts.length > 0;
}

async function restrictStorageAccess() {
  if (!browser.storage.local.setAccessLevel) {
    return;
  }

  try {
    await browser.storage.local.setAccessLevel({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  } catch (error) {
    console.warn('Unable to restrict local storage access.', error);
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function clampPreviewVolume(volume: number): number {
  if (Number.isNaN(volume)) {
    return 0.8;
  }

  return Math.max(0, Math.min(1, volume));
}
