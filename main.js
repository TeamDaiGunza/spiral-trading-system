const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path   = require('path');
const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');

const PORT      = 3456;
const CRED_FILE = path.join(app.getPath('userData'), '.credentials.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const MOB_FILE  = path.join(__dirname, 'mobile.html');

// Asset root: try multiple locations, use first that has index.html
function findAssetRoot() {
  const candidates = [
    __dirname,
    // Portable exe: unpacked next to exe
    path.join(path.dirname(process.execPath || app.getPath('exe')), 'resources', 'app'),
    path.join(path.dirname(process.execPath || app.getPath('exe')), 'resources', 'app.asar.unpacked'),
    // Installed version
    path.join(process.resourcesPath || '', 'app'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked'),
    path.join(path.dirname(app.getPath('exe')), 'resources', 'app'),
    // Fallback: same dir as exe
    path.dirname(process.execPath || app.getPath('exe')),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        console.log('Asset root found:', candidate);
        return candidate;
      }
    } catch(e) {}
  }
  console.log('Asset root fallback:', __dirname);
  return __dirname;
}
const ASSET_ROOT = findAssetRoot();

// ─── Credentials ─────────────────────────────────────────────────
function loadCreds() {
  try { return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')); } catch { return {}; }
}
function saveCreds(c) {
  fs.writeFileSync(CRED_FILE, JSON.stringify(c, null, 2));
}
let creds = loadCreds();

// ─── Kalshi RSA-PSS signing ───────────────────────────────────────
function signKalshi(method, urlPath, privateKeyPem, keyId) {
  const timestamp = Date.now().toString();
  const pathOnly  = urlPath.split('?')[0];
  const msg       = timestamp + method.toUpperCase() + pathOnly;
  const sig       = crypto.sign('SHA256', Buffer.from(msg), {
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return {
    'KALSHI-ACCESS-KEY':       keyId,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'KALSHI-ACCESS-SIGNATURE': sig.toString('base64'),
    'Content-Type': 'application/json',
  };
}

// ─── HTTPS helper ─────────────────────────────────────────────────
function httpsReq(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => resolve(d));
  });
}

function jsonResp(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
  res.end(JSON.stringify(obj));
}

// ─── Local HTTP server ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed  = new URL(req.url, 'http://localhost');
  const reqPath = parsed.pathname;
  const method  = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }

  const body = await readBody(req);

  if (reqPath === '/creds-status') {
    creds = loadCreds();
    return jsonResp(res, 200, {
      ready: !!(creds.anthropicKey),
      hasRobinhood: !!(creds.rhApiKey && creds.rhPrivKey),
      hasWebull: !!(creds.webullAppKey && creds.webullAppSecret),
      webullAppKey: creds.webullAppKey || '',
      webullAccount: creds.webullAccount || '',
      rhApiKey: creds.rhApiKey || '',
      // don't send private key to frontend for security — just indicate it exists
      rhHasPrivKey: !!(creds.rhPrivKey)
    });
  }

  if (reqPath === '/save-creds' && method === 'POST') {
    try { const inc = JSON.parse(body); saveCreds(inc); creds = inc; return jsonResp(res, 200, { ok: true }); }
    catch (e) { return jsonResp(res, 400, { ok: false, error: e.message }); }
  }

  if (reqPath === '/' || reqPath === '/index.html') {
    try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(HTML_FILE, 'utf8')); }
    catch { res.writeHead(500); return res.end('index.html not found'); }
  }

  if (reqPath === '/mobile' || reqPath === '/mobile.html') {
    try { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(MOB_FILE, 'utf8')); }
    catch { res.writeHead(500); return res.end('mobile.html not found'); }
  }

  if (reqPath.startsWith('/kalshi/')) {
    const keyId  = creds.kalshiKeyId || '';
    const pemKey = creds.kalshiPrivateKey || '';
    if (!keyId || !pemKey) return jsonResp(res, 400, { error: 'Missing Kalshi credentials' });
    const kalshiPath = reqPath.slice('/kalshi'.length) + (parsed.search || '');
    let headers;
    try { headers = signKalshi(method, kalshiPath, pemKey, keyId); }
    catch (e) { return jsonResp(res, 500, { error: 'Signing failed: ' + e.message }); }
    try {
      const r = await httpsReq({ hostname: 'api.elections.kalshi.com', path: kalshiPath, method, headers }, body || undefined);
      jsonResp(res, r.status, r.body);
    } catch (e) { jsonResp(res, 500, { error: e.message }); }
    return;
  }

  // ── Robinhood credential save ──────────────────────────────────────
  if (reqPath === '/save-rh-creds' && method === 'POST') {
    try {
      const inc = JSON.parse(body);
      const existing = loadCreds();
      if (inc.rhApiKey) existing.rhApiKey = inc.rhApiKey;
      // '__use_saved__' means keep existing private key
      if (inc.rhPrivKey && inc.rhPrivKey !== '__use_saved__') existing.rhPrivKey = inc.rhPrivKey;
      saveCreds(existing); creds = existing;
      return jsonResp(res, 200, { ok: true });
    } catch (e) { return jsonResp(res, 400, { ok: false, error: e.message }); }
  }

  // ── Robinhood API proxy with Ed25519 signing ───────────────────────
  if (reqPath.startsWith('/robinhood/')) {
    const rhKey  = creds.rhApiKey  || '';
    const rhPriv = creds.rhPrivKey || '';
    if (!rhKey || !rhPriv) return jsonResp(res, 400, { error: 'Missing Robinhood credentials' });
    const rhPath    = reqPath.slice('/robinhood'.length);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const msgParts  = [rhKey, timestamp, method.toUpperCase(), rhPath];
    if (body && body.length) msgParts.push(body);
    const message = msgParts.join('');
    let sig;
    try {
      const privKeyBytes = Buffer.from(rhPriv.replace(/\s/g, ''), 'base64');
      const keyObj = crypto.createPrivateKey({ key: privKeyBytes, format: 'der', type: 'pkcs8' });
      sig = crypto.sign(null, Buffer.from(message), keyObj).toString('base64');
    } catch (e) { return jsonResp(res, 500, { error: 'RH signing failed: ' + e.message }); }
    try {
      const r = await httpsReq({
        hostname: 'trading.robinhood.com',
        path: rhPath + (parsed.search || ''),
        method,
        headers: { 'x-api-key': rhKey, 'x-timestamp': timestamp, 'x-signature': sig, 'Content-Type': 'application/json' },
      }, body || undefined);
      return jsonResp(res, r.status, r.body);
    } catch (e) { return jsonResp(res, 500, { error: e.message }); }
  }



  // ── Webull API proxy (HMAC-SHA1 signing) ────────────────────────────
  if (reqPath.startsWith('/webull/') && (method === 'GET' || method === 'POST' || method === 'DELETE')) {
    const wbCreds = loadCreds();
    const appKey    = wbCreds.webullAppKey    || '';
    const appSecret = wbCreds.webullAppSecret || '';
    const account   = wbCreds.webullAccount   || '';
    if (!appKey || !appSecret) return jsonResp(res, 401, { error: 'Webull credentials not configured' });

    const wbPath = reqPath.slice('/webull'.length);
    const timestamp = Date.now().toString();
    const nonce = crypto.randomBytes(8).toString('hex');

    // HMAC-SHA1 signature: appKey + timestamp + nonce + body
    const bodyStr = body || '';
    const sigBase = appKey + timestamp + nonce + bodyStr;
    const sig = crypto.createHmac('sha1', appSecret).update(sigBase).digest('base64');

    try {
      const r = await httpsReq({
        hostname: 'openapi.webull.com',
        path: wbPath + (parsed.search || ''),
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'App-Key': appKey,
          'Timestamp': timestamp,
          'Nonce': nonce,
          'Signature': sig,
          'Account-Id': account,
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      }, bodyStr);
      return jsonResp(res, r.status, r.body);
    } catch(e) { return jsonResp(res, 500, { error: e.message }); }
  }

  // ── Webull credential save ────────────────────────────────────────
  if (reqPath === '/save-webull-creds' && method === 'POST') {
    try {
      const inc = JSON.parse(body);
      const existing = loadCreds();
      if (inc.webullAppKey)    existing.webullAppKey    = inc.webullAppKey;
      if (inc.webullAppSecret) existing.webullAppSecret = inc.webullAppSecret;
      if (inc.webullAccount)   existing.webullAccount   = inc.webullAccount;
      saveCreds(existing); creds = existing;
      return jsonResp(res, 200, { ok: true });
    } catch(e) { return jsonResp(res, 400, { ok: false, error: e.message }); }
  }

  // ── Static file serving (images) ───────────────────────────────────
  // Debug route — shows what paths the server can see
  if (reqPath === '/debug-paths') {
    const info = {
      ASSET_ROOT,
      __dirname,
      resourcesPath: process.resourcesPath,
      execPath: process.execPath,
      files: (() => { try { return fs.readdirSync(ASSET_ROOT); } catch(e) { return e.message; } })()
    };
    return jsonResp(res, 200, info);
  }

  // Serve any static asset from __dirname
  const staticExts = { '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp',
                        '.mp4':'video/mp4', '.webm':'video/webm', '.ico':'image/x-icon',
                        '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav' };
  const extMatch = reqPath.match(/\.(png|jpg|jpeg|webp|mp4|webm|ico|mp3|ogg|wav)$/i);
  if (extMatch) {
    const ext = '.' + extMatch[1].toLowerCase();
    const filePath = path.join(ASSET_ROOT, reqPath.slice(1)); // strip leading /
    try {
      const stat = fs.statSync(filePath);
      const mime = staticExts[ext] || 'application/octet-stream';
      // Support range requests for video
      const rangeHeader = req.headers['range'];
      if (rangeHeader && mime.startsWith('video/')) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end   = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunk = end - start + 1;
        const stream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
          'Accept-Ranges': 'bytes', 'Content-Length': chunk,
          'Content-Type': mime, 'Access-Control-Allow-Origin': '*'
        });
        stream.pipe(res);
      } else {
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length, 'Access-Control-Allow-Origin': '*' });
        res.end(data);
      }
    } catch(e) { res.writeHead(404); res.end('Not found'); }
    return;
  }

  if (reqPath === '/claude' && method === 'POST') {
    const apiKey = creds.anthropicKey || '';
    if (!apiKey) return jsonResp(res, 400, { error: 'Missing Anthropic API key' });
    try {
      const r = await httpsReq({
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, body);
      jsonResp(res, r.status, r.body);
    } catch (e) { jsonResp(res, 500, { error: e.message }); }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ─── Electron window ──────────────────────────────────────────────
let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'The Spiral Trading System',
    backgroundColor: '#060608',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(ASSET_ROOT, 'preload.js'),
      backgroundThrottling: false, // keep timers/animations running when minimized
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false, // don't flash white before load
  });

  // load the app
  mainWindow.loadURL('http://localhost:' + PORT);

  // show when ready
  // open devtools with F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('context-menu', (e, props) => {
    const { Menu, MenuItem } = require('electron');
    const menu = new Menu();
    menu.append(new MenuItem({
      label: 'Inspect Element',
      click: () => { mainWindow.webContents.inspectElement(props.x, props.y); }
    }));
    menu.popup();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // open external links in browser not in app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Only quit when user explicitly closes — never on crash/error
  mainWindow.on('close', (e) => {
    app.isQuitting = true;
    app.quit();
  });

  // Prevent crash-induced closes
  mainWindow.webContents.on('crashed', (e, killed) => {
    console.log('Renderer crashed — reloading', killed);
    mainWindow.reload();
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.log('Window unresponsive — waiting');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('Window responsive again');
  });

  mainWindow.on('unresponsive', () => {
    console.log('App unresponsive');
  });
}

function createTray() {
  // simple orange square as tray icon fallback
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('The Spiral Trading System');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ─── Boot sequence ────────────────────────────────────────────────
app.whenReady().then(() => {
  // Wait for server to be ready before opening window
  // Show window immediately so app doesn't appear to close
  createWindow();
  createTray();

  server.listen(PORT, '127.0.0.1', () => {
    console.log('Backend server running on port ' + PORT);
  });


  // Handle system notifications from renderer
  const { ipcMain, Notification } = require('electron');
  ipcMain.on('notify', (event, opts) => {
    if (Notification.isSupported()) {
      new Notification({
        title: opts.title || 'The Spiral',
        body:  opts.body  || '',
        icon:  path.join(ASSET_ROOT, 'icon.png'),
        urgency: opts.urgency || 'normal',
        timeoutType: 'default'
      }).show();
    }
  });

  // ── Auto-updater ─────────────────────────────────────────────────
  // Silent download, graceful trading shutdown before install

  autoUpdater.autoDownload    = true;   // download silently in background
  autoUpdater.autoInstallOnAppQuit = false; // we control when it installs

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...');
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] Up to date.');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    // Notify the renderer — shows a banner but does NOT disrupt trading yet
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-progress', Math.round(progress.percent));
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded:', info.version);
    // Tell the renderer the update is ready — renderer will:
    // 1. Disarm the bot (stop new trades)
    // 2. Wait for open positions to settle (up to 5 min)
    // 3. Send 'ready-to-install' back to main
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    console.log('[updater] Error:', err.message);
  });

  // Renderer sends this when bot is fully disarmed and positions settled
  ipcMain.on('ready-to-install', () => {
    console.log('[updater] Bot confirmed safe — installing update now');
    autoUpdater.quitAndInstall(true, true); // silent=true, forceRunAfter=true
  });

  // Manual install trigger (from renderer dismiss/now button)
  ipcMain.on('install-update-now', () => {
    console.log('[updater] Manual install triggered');
    autoUpdater.quitAndInstall(true, true);
  });

  // Check on launch after 15s (let app settle first), then every hour
  setTimeout(() => {
    try { autoUpdater.checkForUpdates(); } catch(e) { console.log('[updater]', e.message); }
  }, 15000);
  setInterval(() => {
    try { autoUpdater.checkForUpdates(); } catch(e) {}
  }, 60 * 60 * 1000);

  server.on('error', e => {
    console.log('Server error:', e.code);
    if (e.code === 'EADDRINUSE') {
      console.log('Port ' + PORT + ' already in use — another instance running');
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Don't quit when all windows closed unless user explicitly quit
  if (process.platform !== 'darwin' && app.isQuitting) app.quit();
});

// Catch any unhandled errors so app doesn't close
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
