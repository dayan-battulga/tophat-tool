import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  MAX_CUSTOM_SOUND_BYTES,
  MAX_SOUND_LIBRARY_SIZE,
  addBuiltinSound,
  addCustomSound,
  alertSettingsItem,
  getAvailableBuiltinSounds,
  isMp3File,
  normalizeAlertSettings,
  readAlertSettings,
  removeSound,
  setActiveSound,
  setAlertVolume,
  type AlertSettings,
  type AlertSound,
} from '@/lib/alert-settings';
import './App.css';

function App() {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void readAlertSettings()
      .then((loadedSettings) => {
        if (isMounted) {
          setSettings(loadedSettings);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setErrorMessage(getErrorMessage(error));
        }
      });

    const unwatch = alertSettingsItem.watch((nextSettings) => {
      if (isMounted) {
        setSettings(normalizeAlertSettings(nextSettings));
      }
    });

    return () => {
      isMounted = false;
      unwatch();
    };
  }, []);

  if (!settings) {
    return (
      <main className="popup-shell">
        <section className="panel loading-panel">
          <p className="eyebrow">Top Hat Audio Alert</p>
          <h1>Loading your sound library…</h1>
        </section>
      </main>
    );
  }

  const availableBuiltins = getAvailableBuiltinSounds(settings);
  const volumePercent = Math.round(settings.volume * 100);
  const soundLimitReached = settings.sounds.length >= MAX_SOUND_LIBRARY_SIZE;

  return (
    <main className="popup-shell">
      <section className="panel hero-panel">
        <p className="eyebrow">Top Hat Audio Alert</p>
        <div className="hero-row">
          <div>
            <h1>Question alerts</h1>
            <p className="muted-copy">
              Plays once when a new Top Hat question or participation prompt
              appears.
            </p>
          </div>
          <div className="library-counter">
            <span>{settings.sounds.length}</span>
            <small>/ {MAX_SOUND_LIBRARY_SIZE}</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Volume</p>
            <h2>{volumePercent}% output</h2>
          </div>
        </div>

        <label className="slider-wrap" htmlFor="volume-slider">
          <span>Quiet</span>
          <input
            id="volume-slider"
            type="range"
            min="0"
            max="100"
            value={volumePercent}
            onChange={(event) => {
              const nextVolume = Number(event.target.value) / 100;

              setSettings((currentSettings) =>
                currentSettings
                  ? { ...currentSettings, volume: nextVolume }
                  : currentSettings,
              );
              clearMessages();

              void setAlertVolume(nextVolume).catch((error: unknown) => {
                setErrorMessage(getErrorMessage(error));
              });
            }}
          />
          <span>Loud</span>
        </label>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Saved sounds</p>
            <h2>Choose one active alert</h2>
          </div>
        </div>

        <div className="sound-list">
          {settings.sounds.map((sound) => {
            const isActive = sound.id === settings.activeSoundId;
            const canRemove = settings.sounds.length > 1;

            return (
              <article
                className={`sound-card ${isActive ? 'sound-card--active' : ''}`}
                key={sound.id}
              >
                <label className="sound-main">
                  <input
                    checked={isActive}
                    name="active-sound"
                    type="radio"
                    onChange={() => {
                      clearMessages();

                      void setActiveSound(sound.id).catch((error: unknown) => {
                        setErrorMessage(getErrorMessage(error));
                      });
                    }}
                  />
                  <div className="sound-copy">
                    <div className="sound-copy__row">
                      <strong>{sound.name}</strong>
                      <span className="sound-badge">
                        {sound.kind === 'builtin' ? sound.preset : 'custom mp3'}
                      </span>
                    </div>
                    <p>
                      {isActive
                        ? 'Active for new question alerts'
                        : 'Available in your sound library'}
                    </p>
                  </div>
                </label>

                <div className="sound-actions">
                  <button
                    className="secondary-button"
                    disabled={previewingSoundId === sound.id}
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setPreviewingSoundId(sound.id);

                      void previewSound(sound, settings.volume)
                        .then(() => {
                          setStatusMessage(`Previewed ${sound.name}.`);
                        })
                        .catch((error: unknown) => {
                          setErrorMessage(getErrorMessage(error));
                        })
                        .finally(() => {
                          setPreviewingSoundId(null);
                        });
                    }}
                  >
                    {previewingSoundId === sound.id ? 'Playing…' : 'Preview'}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!canRemove}
                    type="button"
                    onClick={() => {
                      clearMessages();

                      void removeSound(sound.id)
                        .then(() => {
                          setStatusMessage(`${sound.name} was removed.`);
                        })
                        .catch((error: unknown) => {
                          setErrorMessage(getErrorMessage(error));
                        });
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="section-label">Add sounds</p>
            <h2>Built-ins and MP3 uploads</h2>
          </div>
        </div>

        <div className="add-sound-grid">
          <div className="add-card">
            <h3>Built-in presets</h3>
            <p>
              Re-add the original alert tones you want in your library.
            </p>
            <div className="pill-row">
              {availableBuiltins.length > 0 ? (
                availableBuiltins.map((sound) => (
                  <button
                    className="pill-button"
                    disabled={soundLimitReached}
                    key={sound.id}
                    type="button"
                    onClick={() => {
                      clearMessages();

                      void addBuiltinSound(sound.id)
                        .then(() => {
                          setStatusMessage(`${sound.name} was added.`);
                        })
                        .catch((error: unknown) => {
                          setErrorMessage(getErrorMessage(error));
                        });
                    }}
                  >
                    Add {sound.name}
                  </button>
                ))
              ) : (
                <p className="hint-copy">All built-in presets are already saved.</p>
              )}
            </div>
          </div>

          <div className="add-card">
            <h3>Custom MP3</h3>
            <p>
              Upload a short MP3 under 1 MB. It becomes selectable like any
              other sound.
            </p>
            <label
              className={`upload-button ${soundLimitReached ? 'is-disabled' : ''}`}
            >
              <input
                accept=".mp3,audio/mpeg"
                disabled={soundLimitReached || isUploading}
                type="file"
                onChange={(event) => {
                  void handleFileUpload(event, settings);
                }}
              />
              {isUploading ? 'Uploading…' : 'Upload MP3'}
            </label>
            <p className="hint-copy">
              {soundLimitReached
                ? `Your library is full (${MAX_SOUND_LIBRARY_SIZE}/${MAX_SOUND_LIBRARY_SIZE}). Remove a sound to add another.`
                : `Limit: ${Math.round(MAX_CUSTOM_SOUND_BYTES / 1024)} KB per MP3.`}
            </p>
          </div>
        </div>
      </section>

      {(statusMessage || errorMessage) && (
        <section className="panel message-panel">
          {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
          {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
        </section>
      )}
    </main>
  );

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>,
    currentSettings: AlertSettings,
  ) {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    clearMessages();

    if (currentSettings.sounds.length >= MAX_SOUND_LIBRARY_SIZE) {
      setErrorMessage(`You can save up to ${MAX_SOUND_LIBRARY_SIZE} sounds.`);
      return;
    }

    if (!isMp3File(selectedFile)) {
      setErrorMessage('Only MP3 files are supported.');
      return;
    }

    if (selectedFile.size > MAX_CUSTOM_SOUND_BYTES) {
      setErrorMessage('This MP3 is too large. Please keep it under 1 MB.');
      return;
    }

    setIsUploading(true);

    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);
      await addCustomSound({
        name: selectedFile.name,
        dataUrl,
        mimeType: selectedFile.type || 'audio/mpeg',
      });
      setStatusMessage(`${selectedFile.name} was added to your library.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  function clearMessages() {
    setErrorMessage(null);
    setStatusMessage(null);
  }
}

export default App;

async function previewSound(sound: AlertSound, volume: number) {
  const response = await browser.runtime.sendMessage({
    type: 'preview-sound',
    soundId: sound.id,
    volume,
  });

  if (response?.ok === false) {
    throw new Error(
      typeof response.error === 'string' ? response.error : 'Preview failed.',
    );
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to read the selected MP3.'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Unable to read the selected MP3.'));
    };

    reader.readAsDataURL(file);
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}
