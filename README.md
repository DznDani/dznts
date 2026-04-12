<img src="./screens/icon.png" width="144" height="144" />

# NTS Desktop

[![CI/CD](https://github.com/romeovs/nts-desktop/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/romeovs/nts-desktop/actions/workflows/ci-cd.yml)

An unofficial desktop app for NTS built in Electron.

## Usage

- Click the NTS tray icon to open the player.
- Use the left and right buttons on the player to navigate between channels. You
  can also use the arrow keys.
- Click the play/stop button on the live streams to play them. Spacebar works
  too.
- On the live streams click the tracklist button in to top right corner to open
  the live tracklist in the browser. (This will only work if you are an [NTS
  Supporter](https://www.nts.live/supporters)).
- Use "Load Archive Show URL..." from the tray menu, or click "Open Archive Show
  URL" in the app, then paste an archive URL like
  `https://www.nts.live/shows/...`.
- On the archive screen, you can scroll down to reveal the controls and
  tracklist.
- Click on a tracklist item to copy the information.
- Press `Alt+F4` to close the player window.
- Use the tray menu entries "Reload NTS Desktop" and "Quit NTS Desktop" for
  app-level actions.
- `ctrl + N` will open NTS Desktop
- Pressing `T` when the window is open will open the tracklist
- Pressing `C` when the window is open will open the chat window for that
  channel
- Pressing `1` or `2` when the window is open will start playing the
  corresponding channel
- Pressing `-` and `+` will control the volume of the player

<img src="./screens/rec1.gif" width="400" />
<img src="./screens/rec2.gif" width="400" />
<img src="./screens/rec3.gif" width="400" />

## Installation

Go to the [Releases Page](https://github.com/romeovs/nts-desktop/releases) and
download the latest Windows installer (`.exe`).

Run the installer and follow the setup wizard.

This build is currently unsigned, so Windows SmartScreen may warn on first run.
Choose "More info" and then "Run anyway" if needed.

This release line currently targets Windows x64.

## Local Development

The project is structured as follows:

```
./
  src/
    main.ts     # The electron main file
    preload.js  # A setup file for the browser context
    client/     # The electron renderer files
      main.ts
      ...
```

To start the app in developement mode, run:

```
make dev
```

You can now start editing the renderer files, changes will automatically
take effect on save.

Note that changes to the main process (`src/main.ts` and `src/preload.js`)
require a restart to take effect.

To build the application run:

```
make build app
```

The app will now be in `bundle/mac-universal/NTS Desktop.app`.

## Acknowledgement

The main idea for the app came from the excellent
[nts-desktop-app](https://github.com/tedigc/nts-desktop-app), the implementation
of which is way simpler and more elegant, but lacks some of the features I
wanted.
