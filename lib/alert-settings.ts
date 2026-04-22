export type BuiltinSoundPreset = 'chime' | 'bell' | 'pulse';

export type AlertSound = {
  id: string;
  name: string;
  kind: 'builtin' | 'custom';
  preset?: BuiltinSoundPreset;
  dataUrl?: string;
  mimeType?: string;
  createdAt: number;
};

export type AlertSettings = {
  volume: number;
  activeSoundId: string;
  sounds: AlertSound[];
};

type BuiltinSoundDefinition = {
  id: string;
  name: string;
  preset: BuiltinSoundPreset;
  createdAt: number;
};

type CustomSoundInput = {
  name: string;
  dataUrl: string;
  mimeType?: string;
};

export const MAX_SOUND_LIBRARY_SIZE = 5;
export const MAX_CUSTOM_SOUND_BYTES = 1024 * 1024;
export const DEFAULT_VOLUME = 0.8;
export const ALERT_SETTINGS_STORAGE_KEY = 'local:alert-settings';

const BUILTIN_SOUND_DEFINITIONS: BuiltinSoundDefinition[] = [
  {
    id: 'builtin-chime',
    name: 'Chime',
    preset: 'chime',
    createdAt: 1,
  },
  {
    id: 'builtin-bell',
    name: 'Bell',
    preset: 'bell',
    createdAt: 2,
  },
  {
    id: 'builtin-pulse',
    name: 'Pulse',
    preset: 'pulse',
    createdAt: 3,
  },
];

const builtinDefinitionsById = new Map(
  BUILTIN_SOUND_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const builtinDefinitionsByPreset = new Map(
  BUILTIN_SOUND_DEFINITIONS.map((definition) => [definition.preset, definition]),
);

export const alertSettingsItem = storage.defineItem<AlertSettings>(
  ALERT_SETTINGS_STORAGE_KEY,
  {
    init: createDefaultAlertSettings,
  },
);

export function getBuiltinSoundCatalog(): AlertSound[] {
  return BUILTIN_SOUND_DEFINITIONS.map(toBuiltinSound);
}

export function getAvailableBuiltinSounds(settings: AlertSettings): AlertSound[] {
  const existingIds = new Set(settings.sounds.map((sound) => sound.id));

  return getBuiltinSoundCatalog().filter((sound) => !existingIds.has(sound.id));
}

export function createDefaultAlertSettings(): AlertSettings {
  const sounds = getBuiltinSoundCatalog();

  return {
    volume: DEFAULT_VOLUME,
    activeSoundId: sounds[0].id,
    sounds,
  };
}

export function normalizeAlertSettings(
  value: AlertSettings | null | undefined,
): AlertSettings {
  if (!value || !Array.isArray(value.sounds)) {
    return createDefaultAlertSettings();
  }

  const normalizedSounds: AlertSound[] = [];
  const seenIds = new Set<string>();

  for (const sound of value.sounds) {
    const normalizedSound = normalizeSound(sound);

    if (!normalizedSound || seenIds.has(normalizedSound.id)) {
      continue;
    }

    seenIds.add(normalizedSound.id);
    normalizedSounds.push(normalizedSound);

    if (normalizedSounds.length === MAX_SOUND_LIBRARY_SIZE) {
      break;
    }
  }

  if (normalizedSounds.length === 0) {
    return createDefaultAlertSettings();
  }

  const activeSoundId = normalizedSounds.some(
    (sound) => sound.id === value.activeSoundId,
  )
    ? value.activeSoundId
    : normalizedSounds[0].id;

  return {
    volume: clampVolume(value.volume),
    activeSoundId,
    sounds: normalizedSounds,
  };
}

export async function readAlertSettings(): Promise<AlertSettings> {
  const storedValue = await alertSettingsItem.getValue();
  const normalizedValue = normalizeAlertSettings(storedValue);

  if (serializeAlertSettings(storedValue) !== serializeAlertSettings(normalizedValue)) {
    await alertSettingsItem.setValue(normalizedValue);
  }

  return normalizedValue;
}

export async function replaceAlertSettings(
  nextSettings: AlertSettings,
): Promise<AlertSettings> {
  const normalizedSettings = normalizeAlertSettings(nextSettings);
  await alertSettingsItem.setValue(normalizedSettings);
  return normalizedSettings;
}

export async function updateAlertSettings(
  updater: (settings: AlertSettings) => AlertSettings | void,
): Promise<AlertSettings> {
  const currentSettings = await readAlertSettings();
  const nextSettings = cloneAlertSettings(currentSettings);
  const updatedSettings = updater(nextSettings);

  return replaceAlertSettings(updatedSettings ?? nextSettings);
}

export async function setAlertVolume(volume: number): Promise<AlertSettings> {
  return updateAlertSettings((settings) => {
    settings.volume = clampVolume(volume);
  });
}

export async function setActiveSound(soundId: string): Promise<AlertSettings> {
  return updateAlertSettings((settings) => {
    const matchingSound = settings.sounds.find((sound) => sound.id === soundId);

    if (!matchingSound) {
      throw new Error('Selected sound was not found.');
    }

    settings.activeSoundId = matchingSound.id;
  });
}

export async function addBuiltinSound(soundId: string): Promise<AlertSettings> {
  return updateAlertSettings((settings) => {
    assertCanAddMoreSounds(settings);

    const builtinDefinition = builtinDefinitionsById.get(soundId);

    if (!builtinDefinition) {
      throw new Error('Built-in sound was not found.');
    }

    if (settings.sounds.some((sound) => sound.id === soundId)) {
      throw new Error('Built-in sound has already been added.');
    }

    settings.sounds.push(toBuiltinSound(builtinDefinition));
  });
}

export async function addCustomSound(
  input: CustomSoundInput,
): Promise<AlertSettings> {
  return updateAlertSettings((settings) => {
    assertCanAddMoreSounds(settings);

    const sound: AlertSound = {
      id: `custom-${crypto.randomUUID()}`,
      name: normalizeCustomSoundName(input.name),
      kind: 'custom',
      dataUrl: input.dataUrl,
      mimeType: input.mimeType ?? 'audio/mpeg',
      createdAt: Date.now(),
    };

    settings.sounds.push(sound);
    settings.activeSoundId = sound.id;
  });
}

export async function removeSound(soundId: string): Promise<AlertSettings> {
  return updateAlertSettings((settings) => {
    if (settings.sounds.length <= 1) {
      throw new Error('At least one sound must remain in the library.');
    }

    const nextSounds = settings.sounds.filter((sound) => sound.id !== soundId);

    if (nextSounds.length === settings.sounds.length) {
      throw new Error('Sound was not found.');
    }

    settings.sounds = nextSounds;

    if (settings.activeSoundId === soundId) {
      settings.activeSoundId = nextSounds[0].id;
    }
  });
}

export function findSoundById(
  settings: AlertSettings,
  soundId: string,
): AlertSound | undefined {
  return settings.sounds.find((sound) => sound.id === soundId);
}

export function normalizeCustomSoundName(name: string): string {
  const trimmedName = name.trim().replace(/\.mp3$/i, '');
  return trimmedName.length > 0 ? trimmedName : 'Custom MP3';
}

export function isMp3File(file: File): boolean {
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') {
    return true;
  }

  return file.name.toLowerCase().endsWith('.mp3');
}

function clampVolume(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_VOLUME;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeSound(sound: AlertSound | null | undefined): AlertSound | null {
  if (!sound || typeof sound.id !== 'string' || typeof sound.name !== 'string') {
    return null;
  }

  if (sound.kind === 'builtin') {
    const definition =
      builtinDefinitionsById.get(sound.id) ??
      (sound.preset ? builtinDefinitionsByPreset.get(sound.preset) : undefined);

    return definition ? toBuiltinSound(definition) : null;
  }

  if (sound.kind === 'custom' && typeof sound.dataUrl === 'string') {
    return {
      id: sound.id,
      name: normalizeCustomSoundName(sound.name),
      kind: 'custom',
      dataUrl: sound.dataUrl,
      mimeType:
        typeof sound.mimeType === 'string' && sound.mimeType.length > 0
          ? sound.mimeType
          : 'audio/mpeg',
      createdAt:
        typeof sound.createdAt === 'number' && Number.isFinite(sound.createdAt)
          ? sound.createdAt
          : Date.now(),
    };
  }

  return null;
}

function assertCanAddMoreSounds(settings: AlertSettings): void {
  if (settings.sounds.length >= MAX_SOUND_LIBRARY_SIZE) {
    throw new Error(`You can save up to ${MAX_SOUND_LIBRARY_SIZE} sounds.`);
  }
}

function toBuiltinSound(definition: BuiltinSoundDefinition): AlertSound {
  return {
    id: definition.id,
    name: definition.name,
    kind: 'builtin',
    preset: definition.preset,
    createdAt: definition.createdAt,
  };
}

function cloneAlertSettings(settings: AlertSettings): AlertSettings {
  return {
    volume: settings.volume,
    activeSoundId: settings.activeSoundId,
    sounds: settings.sounds.map((sound) => ({ ...sound })),
  };
}

function serializeAlertSettings(
  settings: AlertSettings | null | undefined,
): string {
  return JSON.stringify(settings ?? null);
}
