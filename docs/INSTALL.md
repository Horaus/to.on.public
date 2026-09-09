# Installation

## Download

Open the matching GitHub Release and download:

- the macOS DMG or macOS ZIP;
- the matching browser-extension ZIP;
- `SHA256SUMS` and `release-manifest.json`.

Do not mix the app from one version with the extension from another version.

## Verify downloads

From the downloaded release directory:

```bash
shasum -a 256 -c SHA256SUMS
```

Every artifact must report `OK` before installation.

## Install the macOS app

1. Install the DMG or extract the macOS ZIP.
2. The current preview builds are unsigned. macOS may require an explicit
   confirmation in Privacy & Security before first launch.
3. Keep v0.1.1 and v0.2.1 application data separate.

## Install the Chrome extension

1. Extract the extension ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Disable the other Browser-Native Studio Executor release, if present.
5. Select **Load unpacked** and choose the extracted directory containing
   `manifest.json`.
6. Confirm that the displayed extension version matches the app version.

For local v0.2.1 preview testing from this repository, load:

```text
runtime/v0.2.1/extension
```

Never delete a Chrome profile, cookies, cache, extension storage, or Electron
data directory as part of an upgrade or recovery.

## Roll back

1. Quit only the currently running app version.
2. Disable its matching extension.
3. Start the previous app and enable/load its matching extension.
4. Continue using that release's original data directory.

Do not point an older app version at a newer version's data directory.
