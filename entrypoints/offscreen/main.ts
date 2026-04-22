import type { BuiltinSoundPreset } from '@/lib/alert-settings';
import { isPlaySoundMessage } from '@/lib/messages';

let audioContext: AudioContext | null = null;
const activeAudioElements = new Set<HTMLAudioElement>();

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isPlaySoundMessage(message)) {
    return undefined;
  }

  void playIncomingSound(message)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown playback error',
      });
    });

  return true;
});

window.addEventListener('pagehide', () => {
  for (const audioElement of activeAudioElements) {
    audioElement.pause();
  }

  activeAudioElements.clear();
});

async function playIncomingSound(message: {
  target: 'offscreen';
  type: 'play-sound';
  sound: {
    id: string;
    name: string;
    kind: 'builtin' | 'custom';
    preset?: BuiltinSoundPreset;
    dataUrl?: string;
    mimeType?: string;
    createdAt: number;
  };
  volume: number;
  mode: 'alert' | 'preview';
}) {
  const volume = clampVolume(message.volume);

  if (message.sound.kind === 'custom') {
    if (!message.sound.dataUrl) {
      throw new Error('Custom sound is missing audio data.');
    }

    await playCustomAudio(message.sound.dataUrl, volume);
    return;
  }

  if (!message.sound.preset) {
    throw new Error('Built-in sound is missing a preset definition.');
  }

  await playBuiltinPreset(message.sound.preset, volume);
}

async function playCustomAudio(dataUrl: string, volume: number) {
  const audioElement = new Audio(dataUrl);
  audioElement.volume = volume;
  audioElement.preload = 'auto';
  activeAudioElements.add(audioElement);

  const cleanup = () => {
    activeAudioElements.delete(audioElement);
    audioElement.src = '';
  };

  audioElement.addEventListener('ended', cleanup, { once: true });
  audioElement.addEventListener('error', cleanup, { once: true });

  try {
    await audioElement.play();
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function playBuiltinPreset(preset: BuiltinSoundPreset, volume: number) {
  const context = await ensureAudioContext();
  const startTime = context.currentTime + 0.02;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(Math.max(0.001, volume), startTime);
  masterGain.connect(context.destination);

  let endTime = startTime + 0.8;

  switch (preset) {
    case 'chime':
      endTime = scheduleChime(context, masterGain, startTime);
      break;
    case 'bell':
      endTime = scheduleBell(context, masterGain, startTime);
      break;
    case 'pulse':
      endTime = schedulePulse(context, masterGain, startTime);
      break;
  }

  window.setTimeout(() => {
    masterGain.disconnect();
  }, Math.max(200, (endTime - context.currentTime) * 1000 + 120));

  await wait(Math.max(0, endTime - context.currentTime) * 1000 + 60);
}

async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext;
}

function scheduleChime(
  context: AudioContext,
  destination: GainNode,
  startTime: number,
): number {
  const endA = scheduleTone(context, destination, {
    frequency: 880,
    startTime,
    duration: 0.5,
    volume: 0.26,
    type: 'sine',
  });
  const endB = scheduleTone(context, destination, {
    frequency: 1320,
    startTime: startTime + 0.06,
    duration: 0.42,
    volume: 0.18,
    type: 'triangle',
  });

  return Math.max(endA, endB);
}

function scheduleBell(
  context: AudioContext,
  destination: GainNode,
  startTime: number,
): number {
  const base = scheduleTone(context, destination, {
    frequency: 740,
    startTime,
    duration: 0.95,
    volume: 0.24,
    type: 'triangle',
  });
  const overtoneA = scheduleTone(context, destination, {
    frequency: 1110,
    startTime: startTime + 0.03,
    duration: 0.8,
    volume: 0.16,
    type: 'sine',
  });
  const overtoneB = scheduleTone(context, destination, {
    frequency: 1480,
    startTime: startTime + 0.05,
    duration: 0.7,
    volume: 0.12,
    type: 'sine',
  });

  return Math.max(base, overtoneA, overtoneB);
}

function schedulePulse(
  context: AudioContext,
  destination: GainNode,
  startTime: number,
): number {
  let lastEndTime = startTime;

  for (let index = 0; index < 3; index += 1) {
    const pulseStart = startTime + index * 0.18;
    lastEndTime = scheduleTone(context, destination, {
      frequency: 540 + index * 55,
      startTime: pulseStart,
      duration: 0.12,
      volume: 0.22,
      type: 'square',
    });
  }

  return lastEndTime;
}

function scheduleTone(
  context: AudioContext,
  destination: GainNode,
  options: {
    frequency: number;
    startTime: number;
    duration: number;
    volume: number;
    type: OscillatorType;
  },
): number {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const endTime = options.startTime + options.duration;

  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, options.startTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    options.frequency * 0.995,
    endTime,
  );

  gainNode.gain.setValueAtTime(0.0001, options.startTime);
  gainNode.gain.exponentialRampToValueAtTime(
    Math.max(0.001, options.volume),
    options.startTime + 0.015,
  );
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gainNode);
  gainNode.connect(destination);
  oscillator.start(options.startTime);
  oscillator.stop(endTime);
  oscillator.addEventListener(
    'ended',
    () => {
      oscillator.disconnect();
      gainNode.disconnect();
    },
    { once: true },
  );

  return endTime;
}

function clampVolume(value: number): number {
  if (Number.isNaN(value)) {
    return 0.8;
  }

  return Math.max(0, Math.min(1, value));
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, durationMs));
  });
}
