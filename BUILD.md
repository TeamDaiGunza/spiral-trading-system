# GURREN-KALSHI // Build Instructions

This folder builds the bot into a proper Windows installer and a portable exe.

---

## Quick build (Windows)

1. Open command prompt in this folder
2. Run: `npm install`
3. Run: `npm run build:win`
4. Find your files in the `dist/` folder

---

## Output files

After building you get two files in `dist/`:

| File | What it is |
|------|-----------|
| `Gurren-Kalshi Setup 1.0.0.exe` | Full installer — installs to Program Files, creates Start Menu + Desktop shortcuts, shows in Add/Remove Programs |
| `Gurren-Kalshi-Portable.exe` | Single file — just run it, no install needed, good for USB drives |

---

## Troubleshooting

**"Access is denied" error:**
The app from a previous build is still running. Close it, delete the `dist/` folder manually, then run `npm run build:win` again.

**Build hangs or fails with antivirus errors:**
Add the `node_modules` and `dist` folders to your antivirus exclusions, then retry.

**Just want to test without building:**
```
npm install
npm start
```

---

## Sending to someone else

Send them ONE of these files from `dist/`:
- `Gurren-Kalshi Setup 1.0.0.exe` — proper installer, recommended
- `Gurren-Kalshi-Portable.exe` — single file, no install

They do NOT need Node.js. They WILL need their own API keys.
The app walks them through setup on first launch.

---

## What the installer does

- Installs to Program Files (user can change the path)
- Creates Desktop + Start Menu shortcuts
- Adds optional auto-start on Windows login
- Stores credentials securely in %APPDATA%\gurren-kalshi\
- Full uninstaller in Add/Remove Programs

---

"Don't believe in yourself. Believe in me, who believes in you." -- Kamina
