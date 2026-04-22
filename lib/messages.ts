import type { AlertSound } from '@/lib/alert-settings';

export type QuestionDetectedMessage = {
  type: 'question-detected';
  questionKey: string;
  title: string;
};

export type PreviewSoundMessage = {
  type: 'preview-sound';
  soundId: string;
  volume: number;
};

export type PlaySoundMessage = {
  target: 'offscreen';
  type: 'play-sound';
  sound: AlertSound;
  volume: number;
  mode: 'alert' | 'preview';
};

type UnknownMessage = Record<string, unknown>;

export function isQuestionDetectedMessage(
  value: unknown,
): value is QuestionDetectedMessage {
  return (
    isObject(value) &&
    value.type === 'question-detected' &&
    typeof value.questionKey === 'string' &&
    typeof value.title === 'string'
  );
}

export function isPreviewSoundMessage(value: unknown): value is PreviewSoundMessage {
  return (
    isObject(value) &&
    value.type === 'preview-sound' &&
    typeof value.soundId === 'string' &&
    typeof value.volume === 'number'
  );
}

export function isPlaySoundMessage(value: unknown): value is PlaySoundMessage {
  return (
    isObject(value) &&
    value.target === 'offscreen' &&
    value.type === 'play-sound' &&
    typeof value.volume === 'number' &&
    (value.mode === 'alert' || value.mode === 'preview') &&
    isPlayableSound(value.sound)
  );
}

function isPlayableSound(value: unknown): value is AlertSound {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    (value.kind !== 'builtin' && value.kind !== 'custom') ||
    typeof value.createdAt !== 'number'
  ) {
    return false;
  }

  if (value.kind === 'builtin') {
    return value.preset === 'chime' || value.preset === 'bell' || value.preset === 'pulse';
  }

  return typeof value.dataUrl === 'string';
}

function isObject(value: unknown): value is UnknownMessage {
  return typeof value === 'object' && value !== null;
}
