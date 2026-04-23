# Top Hat Audio Alert

A small chrome extension that makes a sound when there is a tophat question being asked.
Lost too many points on participation through my college, so I decided to just make this to help me stay on track.

Hopefully this helps your GPA as well :D


## Features

- Detects new Top Hat questions and participation prompts on `app.tophat.com/e/*`
- Avoids replaying the same alert on harmless rerenders of the same item
- Supports 3 built-in sounds: `Chime`, `Bell`, and `Pulse`
- Supports custom MP3 uploads
- Lets you choose 1 active sound at a time
- Global volume control
- Light mode and dark mode popup themes
- Toggle to pause automatic alerts without losing your sound library

## How It Works

The extension is split into 4 main pieces:

- `entrypoints/content.ts`
  Watches the Top Hat classroom page with a `MutationObserver`, looks for the `Questions & Attendance` section, and sends a message when a new visible item appears.
- `entrypoints/background.ts`
  Receives detection and preview messages, reads saved settings, and creates an offscreen document for playback when needed.
- `entrypoints/offscreen/main.ts`
  Plays built-in sounds with Web Audio and custom MP3 uploads with `Audio`.
- `entrypoints/popup/App.tsx`
  Provides the extension UI for choosing a sound, changing volume, uploading MP3s, toggling alerts, and switching themes.

## Stack

- [WXT](https://wxt.dev/) for extension tooling
- React + TypeScript
- Tailwind CSS
- shadcn/ui + Radix primitives
- Chrome Manifest V3

## Requirements

- Node.js `^20.19.0 || >=22.12.0`
- `pnpm`

## Getting Started

```bash
pnpm install
```

## Development

Run the dev server:

```bash
pnpm dev
```

Then load the unpacked extension from:

```text
.output/chrome-mv3-dev
```

Chrome steps:

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select `.output/chrome-mv3-dev`

## Production Build

Build the extension:

```bash
pnpm build
```

The production build output will be in:

```text
.output/chrome-mv3
```

Create a zip for the Chrome Web Store:

```bash
pnpm zip
```

## Available Scripts

- `pnpm dev` - start WXT dev mode for Chrome
- `pnpm dev:firefox` - start WXT dev mode for Firefox
- `pnpm build` - build the Chrome extension
- `pnpm build:firefox` - build the Firefox extension
- `pnpm zip` - generate a Chrome upload zip
- `pnpm zip:firefox` - generate a Firefox upload zip
- `pnpm compile` - run TypeScript type-checking only

## How To Test Locally

You do not need to publish the extension to test it on your own Top Hat account.

1. Build the extension with `pnpm build`, or run `pnpm dev`
2. Load the unpacked extension in Chrome
3. Open a Top Hat classroom page that matches `https://app.tophat.com/e/*`
4. Refresh the Top Hat tab after loading or reloading the extension
5. Open the extension popup and choose a sound / volume
6. Leave the Top Hat page open during class

Expected behavior:

- No sound should play while the page is in the empty state
- A sound should play once when a new question appears
- The same question should not replay just because Top Hat rerendered it
- A different question should trigger a new alert

## Sound Library Rules

- Maximum total saved sounds: `5`
- Maximum uploaded MP3 size: `1 MB`
- At least `1` sound must always remain in the library
- Uploaded MP3s are stored locally in extension storage

## Popup Features

The popup lets you:

- change the master volume
- choose the active alert sound
- upload a custom MP3
- preview the selected sound
- enable or disable automatic alerts
- restore removed built-in sounds
- switch between light and dark mode

The popup is only for configuration. The alert system still works when the popup is closed.

## Detection Notes

The content script does not blindly alert on every DOM change. It keeps track of the currently visible question key and only alerts when:

- the page goes from empty to showing a question, or
- the visible question changes to a different item

It intentionally does not alert just because a question was already visible when the page first loaded. That avoids false positives when you open or refresh the page in the middle of an already-active question.

## Permissions

This extension currently uses:

- `storage`
  Stores alert settings, selected theme, and optional uploaded MP3 data locally.
- `offscreen`
  Creates an offscreen document for audio playback.
- `https://app.tophat.com/e/*`
  Allows the content script to run on Top Hat classroom pages.

## Privacy

- Settings are stored locally in the extension
- Custom MP3 uploads are stored locally in Chrome extension storage
- The extension does not send your settings or audio files to an external server

## Project Structure

```text
entrypoints/
  background.ts        Background service worker
  content.ts           Top Hat page watcher
  offscreen/
    index.html         Offscreen document shell
    main.ts            Audio playback logic
  popup/
    App.tsx            Popup UI
    main.tsx           Popup entry
    style.css          Popup theme and Tailwind layer

lib/
  alert-settings.ts    Sound library + settings storage
  messages.ts          Runtime message types/guards
  popup-theme.ts       Light/dark theme storage
```

## Troubleshooting

If the extension does not alert:

- make sure the Top Hat tab URL starts with `https://app.tophat.com/e/`
- refresh the Top Hat tab after reloading the extension
- make sure alerts are enabled in the popup
- make sure Chrome and the tab are not muted
- try the `Preview` button first to confirm audio playback works

If the popup looks out of date:

- reload the unpacked extension in `chrome://extensions`
- rebuild with `pnpm build` or rerun `pnpm dev`

## Disclaimer

This project is not affiliated with Top Hat.
