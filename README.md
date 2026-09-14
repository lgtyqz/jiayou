# JIAYOU!

A minimal Kanban board built with vanilla JavaScript, HTML, and CSS from the supplied Figma frames. No build step, package installation, runtime libraries, or backend is required. Figma SVG assets and Urbanist are served locally.

## Code layout

Application code lives in `scripts/` and is loaded in dependency order by `index.html`: `state.js` owns the board model and persistence, `board.js` renders and filters cards, `drag.js` handles movement, and `board-actions.js` covers local board controls. Drive integration is split between `drive-api.js`, `drive-boards.js`, and `oauth.js`; `main.js` performs final startup.

## Run locally

```sh
python3 -m http.server 8000
```

Visit http://localhost:8000. Use HTTP locally rather than opening the file directly so storage and OAuth have a consistent origin.

## Use the board

- Use the icon buttons beside **Save to Drive** to import a JIAYOU board from JSON or download the current board as a portable JSON file. Importing validates the file and asks before replacing the current board.
- After connecting Drive, use the **Board** selector to switch boards. **New** creates another tutorial board; **Manage** lets you rename, duplicate, permanently delete, or disconnect. Board names must be unique and contain 1–80 characters. The final Drive board cannot be deleted.
- Drag **Create** to a column or Priority bin to create a card. Clicking Create adds a task to the first expanded column.
- Drag cards to reorder, move between columns, or place in Priority. In wrapped lists, move across a row to choose the exact insertion slot shown by the vertical marker. The drag preview tilts with its movement speed. Drop a card on **Destroy** to delete it, or hold **Destroy** for three seconds to clear the entire board; releasing early cancels. Escape cancels a drag.
- Click category, title, description, or column title to edit. Click elsewhere to finish. Expand a card to edit its description. Click its star to open the seven-color star palette; choosing a star changes and autosaves the card's color.
- Right-click a card to prioritize it, or drag it into Priority on touch screens. Drag it below Priority to remove priority.
- Use the circle controls to shrink or expand columns, Priority bins, and cards.
- Search matches category or title, ignoring case and accents, and supports ordered partial characters. All query words must match. Click the search star to filter by one color as well; **All colors** removes that filter without clearing the text query. Matching priority tasks are revealed while filtering; collapsed columns retain their state. Creating a card clears both filters to reveal the new task.
- Color palettes support Tab, arrow keys, Home/End, and Enter/Space. Escape closes the palette and returns focus to its star; clicking outside dismisses it.
- Keyboard: Tab to a card, press **P** to prioritize, or **Alt + arrow keys** to move it between columns or reorder it. Tab to individual fields and controls to edit or expand them.

Every edit saves immediately to localStorage. While connected, Drive saves are debounced and serialized to the active board; local storage remains a fallback. Switching boards flushes the current board before loading the selection, and a failed save prevents the switch.

On startup, the app reconnects automatically when this browser previously connected and its Google session is still available. It opens this browser's last active Drive board, falling back to the most recently modified Drive board. Drive is the normal source of truth. If the matching local fallback has a newer `updatedAt`, the app asks whether to use Drive or upload this device's copy. Simultaneous edits from different devices are not merged, so keep one active editing tab/device to avoid conflicting writes.

## GitHub Pages

1. Add these files to the `lgtyqz/jiayou` repository.
2. In **Settings → Pages**, choose **Deploy from a branch**, the desired branch, and **/(root)**.
3. Enable **Enforce HTTPS**. The expected public URL is **https://lgtyqz.github.io/jiayou/**.

All app references are relative, so the repository subpath works. `.nojekyll` keeps the static files unprocessed. This workspace has not been published.

## Enable Google Drive

The app works locally without Google configuration. To activate **Save to Drive**:

1. Create a Google Cloud project and enable **Google Drive API**.
2. Configure Google Auth Platform branding, audience, and consent. Use `https://lgtyqz.github.io/jiayou/` as the application home page, `https://lgtyqz.github.io/jiayou/privacy.html` as the privacy-policy URL, and `https://lgtyqz.github.io/jiayou/terms.html` as the terms-of-service URL. While the app is in Testing, add your Google account as a test user.
3. Add the scope `https://www.googleapis.com/auth/drive.appdata`.
4. Create an OAuth client with application type **Web application**.
5. Add authorized JavaScript origin `https://lgtyqz.github.io` and authorized redirect URI **`https://lgtyqz.github.io/jiayou/`**. For local development, add origin `http://localhost:8000` and redirect URI `http://localhost:8000/`.
6. Paste the public client ID into `googleClientId` in `config.js`. Leave `redirectUri` blank to use the current origin and path, or set it explicitly to the exact registered redirect URI. Open the site using that exact path, including the trailing slash.

The integration uses Google's OAuth redirect token flow with a one-time state check and the Drive REST API through native `fetch`; it does not load an external SDK or expose a client secret. Each named board is a separate JSON file in Drive's hidden application-data folder, accessible only to this app. The previous single `jiayou-board.json` file is recognized and migrated to **My Board**. **Saving…** and **Autosaved** disable the button during normal connected operation. Errors offer reconnection or a retry and preserve local edits.

OAuth tokens are stored only in sessionStorage and restored on reload while valid. localStorage remembers that Drive was connected, allowing one `prompt=none` reconnection attempt in a future browser session. If the Google browser session has ended or Drive rejects the saved authorization, the app returns to local-only mode and shows a disconnection dialog. **Disconnect Drive** clears this remembered state without revoking the Google OAuth grant. A static GitHub Pages app cannot securely keep a client secret or provide server-managed refresh tokens, so indefinite unattended sign-in is not implemented.

Drive's app-data folder does not support trash. Deleting a board through **Manage** is therefore permanent and always requires confirmation.

Official integration references: [Google browser OAuth](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow), [Drive application data](https://developers.google.com/workspace/drive/api/guides/appdata), and [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

## Design references

Figma file `2Nq7Yk6ZSPB91VQtPA3gsI`: main frame `1:2`, text `1:88`, colors `1:94`, components `1:31`, collapsed columns `5:224`, star palette `7:393`, search color filter `7:422`. `styles.css` defines all seven background, border, and icon color sets, plus the six text styles. The expanded Priority color is controlled by `--priority-bg`.

Urbanist is distributed under the SIL Open Font License included in `assets/OFL.txt`.

## Browser verification

`tests/browser.mjs` runs dependency-free Chrome DevTools checks for assets, inline editing, search, pointer dragging, collapse, local persistence, mobile overflow, and a stateful mocked Drive covering autosave failures, conflicts, multiple boards, lifecycle operations, and disconnect. Start the local server on port 8000 and a separate Chrome profile with `--headless --remote-debugging-port=9222 --user-data-dir=/tmp/jiayou-chrome-test about:blank`, then run `node --experimental-websocket tests/browser.mjs` (Node 21+, or omit the flag on versions with stable WebSocket). The test clears this test profile's localhost board storage and writes screenshots to `/tmp/jiayou-*.png`. It never signs into Google or sends real Drive requests. Real OAuth still needs validation after configuring a client ID.
