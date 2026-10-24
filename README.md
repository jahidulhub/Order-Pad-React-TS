# Order Pad

A mobile-first ordering MVP built with React, TypeScript, and Vite. A warm white canvas, charcoal text, muted green accents, and a borderless editor keep the focus on writing orders.

## Run locally

Install Node.js 22.18 or newer, then run these commands in this folder:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. You can also use pnpm with the included lockfile: `pnpm install --frozen-lockfile` and `pnpm dev`.

## Check and build

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

The production build is generated in `dist/`. Upload that folder to a static web host. No backend or API keys are required. Serve the app over HTTP; opening `index.html` directly is not supported.

## Features

- Name and company onboarding; returning users go straight to their draft.
- Delivery date popover: today through the next seven days, tomorrow by default, Sundays highlighted.
- Full-height growing editor with whole-page scrolling and a Send button that follows the visible viewport above the mobile keyboard.
- Keyboard and touch autocomplete; selecting an item formats its name and amount, then moves the cursor to the next line.
- Settings and Suggestions pages with back navigation.
- Ten sample suggestions with quantities and units; delete individual items or clear the entire suggestion list, with Undo for the most recent removal.
- Export suggestions as a JSON backup, and import a backup to merge items by name and update matching quantities and units. The latest import can also be undone.
- WhatsApp sharing addressed to +601127201336, with the company, actual delivery date, items, and ordering name.

## Local data and suggestion learning

Profiles, drafts, dates, and suggestions stay in the browser's local storage. The original storage keys are preserved, so existing data remains available when this version replaces the app at the same web address. Existing browser data is not included in this project download.

**Suggestions are saved or updated only after a valid click on Share.** Typing, editing, clearing the draft, choosing a suggestion, leaving the editor, using Back, and refreshing do not learn items. Draft autosave works independently. The eraser button appears when the editor contains text and clears the saved draft without changing suggestions. Share saves the final items and verifies the browser write before opening a WhatsApp message addressed to +601127201336; the user confirms sending in WhatsApp. If saving fails, the app keeps the draft open and shows an error instead of silently opening WhatsApp without saved suggestions. The destination number is configured in `src/lib/share.ts`.

Saved items have a name, numeric quantity (or null), unit, and last-used timestamp. Names are matched without case or repeated spaces, so a sent order updates an existing item rather than creating another suggestion for a different quantity or unit. Legacy item history is read compatibly, and is migrated only when an explicit Share or suggestion-management action saves a change.

Deleting an item also hides its sample fallback. Clear all removes both saved and sample suggestions from the catalog and autocomplete, and stays cleared after refresh. These changes do not affect the order draft or profile. Sharing an item again relearns that item. Undo restores the last removal while the app stays open; a new Share resets Undo so it cannot overwrite newly learned items.

Export includes the current visible suggestion list (saved items and samples), with only name, quantity, and unit fields. Import accepts the exported JSON format or an array of these objects, up to 200 items and 1 MB per file. Items are matched without case or repeated spaces; the last duplicate in the file wins. Import is an explicit save action independent of Share, preserves other suggestions, and reports malformed files before applying changes.

## Source layout

- `src/components/`: React screens, date picker, and order composer.
- `src/hooks/`: visual viewport/editor geometry and autocomplete interaction.
- `src/lib/`: typed storage, parsing, dates, suggestions, and validated sharing.
- `src/types.ts`: shared domain types.
- `src/styles.css`: theme tokens, responsive spacing, typography, date chips, and shared component styles.
- `tests/`: regression checks for learning, persistence, parsing, completion, and delivery dates.

Browser keyboard behavior varies by device. The editor uses `visualViewport` resize/scroll events, dynamic viewport units, safe-area insets, and `interactive-widget=resizes-content` to follow the available screen area.
