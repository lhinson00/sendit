# Volume Board

Phone-first filter for NFL volume rungs:

- WR/TE 20+ receiving yards
- WR/TE 2+ receptions
- RB 20+ rushing yards
- QB 150+ passing yards (public stand-in for 125+)

Shows **17/18**, not a percent. No live FanDuel odds.

## Run it on your phone via GitHub Pages

1. Create a new **private** repo (example name: `volume-board`).
2. Upload these four files to the repo root:
   - `index.html`
   - `styles.css`
   - `data.js`
   - `app.js`
3. Repo **Settings → Pages**
4. Source: **Deploy from a branch**
5. Branch: `main` / folder: `/ (root)`
6. Save. GitHub gives you a URL like:
   `https://YOURUSER.github.io/volume-board/`
7. Add that URL to your iPhone home screen (Safari → Share → Add to Home Screen).

Private repo + Pages: GitHub only serves the site if Pages is on. The URL is unlisted, not secret. Do not put FanDuel passwords or API keys in this repo.

## Local preview

Open `index.html` in a browser. Safari on the phone works after Pages is live.

## Weekly update

Edit `data.js` (Hits / Games) and push. The phone site updates in a minute.
