# Delta Activity Timer

A small browser app for tracking good and bad activities with:

- one-tap start and stop timers
- manual time logging
- editable activity names and types
- total good time, total bad time, and delta
- offline-ready PWA behavior once installed

## Local use on desktop

Open `index.html` in a browser.

## Best way to use it on your phone

Host these files as a static website, then open the URL on your phone and add it to your home screen.

Files that must stay together:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`

## Easiest hosting option: GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder to the repository root.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select the `main` branch and `/ (root)`, then save.
6. Wait for GitHub to publish the site.
7. Open the published URL on your phone.

## Install on Android

1. Open the hosted URL in Chrome.
2. Tap the browser menu.
3. Tap `Install app` or `Add to Home screen`.
4. Confirm.

You can also use the in-app install button if Chrome offers it.

## Install on iPhone

1. Open the hosted URL in Safari.
2. Tap the Share button.
3. Tap `Add to Home Screen`.
4. Confirm the name and tap `Add`.

## Important note about your data

Your activities and logs are stored locally in that browser on that device.

That means:

- desktop data and phone data are separate
- switching browsers also gives you a separate copy
- uninstalling site data from the browser can remove your saved logs

If you want, the next step can be adding export/import so you can move your data between desktop and phone.
