# THE SPIRAL TRADING SYSTEM — CHANGELOG

---

## [Latest] — Functionality audit + small-account focus

### Full system audit — all 56 functions verified present and wired:
- Core trading loop: runCycle, arm/disarm, placeOrder, buildOrderBody, discoverOrderEndpoint
- Signal engine: calcQuantEdge (10 signals), calcRSI, calcMACD, calcMFI, callClaude, callClaudeDual, callClaudeChat
- Intelligence: fetchOrderbook, fetchFills, fetchRecentTrades, fetchLivePrices, fetchFearGreed
- Intelligence: analyzeMarketTiming, calcStrikeDistance, getCrossMarketSignal, detectVolumeSpike, analyzeFills
- Risk & sizing: halfKellyStake, getDynamicKelly, getKellyRampFactor, getPatternMultiplier, getDirectionEdgeMultiplier
- Settlement: pollMarketResult (dual-check), settlePosition, recordDirectionOutcome, recordPattern
- All auto-trading features confirmed: opportunity scanner, pattern memory, cross-market correlation, velocity tracking

### Small-account growth improvements
- **Kelly hard cap** — single trade can never exceed 25% of cash regardless of Kelly calculation
- **Compounding bonus** — when compound mode is ON and session is profitable, bonus 10% of profits added to sizing (rewards winning streaks, scales naturally with account growth)
- **EV math in Claude prompt** — explicitly instructs Claude to calculate expected value: "if YES resolves 60% at 45c cost, EV = +$0.15 per dollar. Only trade positive EV"
- **Account size context** — Claude now knows exact cash balance and is told "every dollar matters"

### Trading partner persona
- Reframed as "elite AI trading partner" with primary mission of growing small accounts
- Explicitly positioned as more knowledgeable than the user — gives direct advice, not hedged suggestions
- Teaching mode: explains what signals meant, what user could have done differently, specific price targets
- "Like an older brother who is very good at trading — confident, direct, educational, never condescending"

### Design philosophy confirmed
- Bot handles: parallel market scanning (12 markets), 10-signal quant engine, dual AI confirmation, Kelly sizing, risk management, settlement, pattern learning
- Human handles: closing at better prices, reading macro context, override decisions, manual trades
- Partnership: bot is the engine, human is the driver — in control but relying on bot's superior data processing

---

## [Latest — Previous] — Session May 24, 2026 (Evening)

### Technical indicator charts (Analytics tab)
- **RSI(14)** chart with overbought (70) and oversold (30) reference lines. Live readout with plain-English label: "OVERBOUGHT — market may pull back" etc.
- **MACD histogram** — green bars = bullish momentum, red = bearish. Shows crossover history.
- **MFI(14)** — Money Flow Index using price AND volume. More reliable than RSI alone. Ref lines at 80/20.
- **Price history** chart with asset selector (BTC/ETH/SOL/DOGE).
- All charts update automatically when switching to Analytics tab and on every price fetch.
- Indicators now passed to Claude on every trade call: `RSI: 64.2 | MACD: bullish crossover | MFI: 71.3`

### Trading partner (Analytics tab)
- Free-text chat with the bot — ask anything about current market conditions, open positions, or strategy.
- Preset questions: "WHY DID YOU TRADE THAT?" / "SHOULD I CLOSE ANYTHING?" / "WHAT DO YOU SEE?" / "TEACH ME"
- Bot responds with full market context: live prices, indicators, F&G, session P&L, open positions, recent trade history.
- System prompt tuned for coaching mode — explains WHY not just WHAT, talks like an experienced trader, educational tone.
- Uses dedicated `callClaudeChat()` for free-text (600 token responses) separate from JSON signal calls.

### Vision: trading mech suit
- Bot handles background scanning, signal generation, and risk management autonomously.
- Human handles closing at better prices, reading market feel, and override decisions.
- Trading partner chat makes the bot's reasoning transparent so you learn from every trade.
- Teaching mode explains entry criteria, signal logic, and why it skipped or took a trade.

---

## [v0.9.5] — Session May 24, 2026 (Earlier)

### Accuracy degradation fix
- Added **time decay to pattern suppression** — patterns that haven't seen activity in 2 hours automatically expire. Prevents morning losses from blocking afternoon trades when conditions change.
- Added **direction stat decay** — after 90 minutes of no trades in a direction, win/loss counts are halved so suppression gradually lifts rather than staying permanent.
- Reduced **correlation cache TTL** from 5 minutes to 3 minutes — cross-market signals stay fresher.
- **Fear & Greed refreshes every 3 minutes** (was 5) — catches faster sentiment shifts.
- **Live prices refresh every 30 seconds** (was 60) — velocity calculations more accurate.
- **4-hour auto-reset** — session baseline, pattern cache, direction stats, and correlation cache all clear every 4 hours automatically. Prevents stale data from degrading signal quality over long sessions.

### Order direction bug fix
- Fixed **placeOrder direction mapping** — Kalshi's API always expects `yes_price` to be the YES side price regardless of which side you're buying. When buying NO, the bot was passing the NO price directly causing wrong orders. Now correctly converts: buying NO at 35¢ → sends `yes_price: 65`.
- Combat log now shows `Firing NO (betting DOWN)` vs `Firing YES (betting UP)` for clarity.
- Position badges now have tooltip showing "Betting price goes UP" or "Betting price goes DOWN".

### Tooltip system rebuild
- Removed CSS pseudo-element tooltips (were showing twice — once from CSS, once from JS).
- Single static panel fixed in top-left corner (14px, 14px) — never moves, never obscures controls.
- Orange border with subtle glow, dark background.

### Defensive guards added
- `settlePosition` — double-settle guard via `pos._settled` flag prevents phantom P&L from race conditions between momentum watcher and market poller.
- `renderPositions` — null guard if DOM element missing on startup.
- `fetchFills` — null ticker guard returns empty array instead of malformed API call.
- `analyzeMarketTiming` — NaN guard on malformed dates from Kalshi.
- P&L display — NaN guard shows $0.00 instead of crashing.
- Momentum watcher — checks `pos._settled` before attempting exit.

### Settlement accuracy
- `pollMarketResult` now requires BOTH `result === 'yes'/'no'` AND `status === 'finalized'` before settling. Kalshi sets result before paying out — bot was reporting wins on positions still open.

### 6 new intelligence signals
- **Fill history analysis** — fetches last 50 actual fills per market. Analyzes YES/NO volume imbalance, price trend in fills, and volume spikes (2x+ normal = informed buying).
- **Market timing** — expired/near-expiry (<3 min) markets auto-skipped. Fresh markets (<5 min old) get 30% score boost.
- **Strike distance** — for "BTC above $X" markets, detects when price clearly above/below strike but market pricing is wrong.
- **Cross-market correlation** — tracks signals across BTC/ETH/SOL/DOGE 15m simultaneously. 2+ correlated markets agreeing = stronger signal.
- **Volume spike detection** — 2x+ 24h vs prior day volume = informed money.
- **5-minute price velocity** — rate of price change over last 5 minutes. Blocks YES bets when price falling >0.3% in 5 min, and vice versa.

### Pattern tracker
- Tracks win rate per market+direction combination (e.g. "KXBTC15M:yes").
- After 4 trades: <30% WR = block entirely, <40% = require 50% more edge, >65% = slight loosening.
- Patterns expire after 2 hours of inactivity.

### Win/Loss result panel
- Replaced bottom-right popup with top-left side panel at 110px from top.
- Slides in from left, glows orange on WIN, red on LOSS.
- Victory clip (Kamina) plays on wins, defeat clip plays on losses.
- Auto-dismisses after 8 seconds.

---

## [v0.9] — Parallel scanning + Signal quality

### Signal engine
- Rebuilt `calcQuantEdge()` with strict 2-signal consensus requirement.
- 7 signals: orderbook imbalance, trade flow, momentum vs price, Fear & Greed, price velocity, spread quality, extreme price detection.
- Trend alignment block: no YES bets when 24h change < -3%, no NO bets when > +3%.
- Direction performance tracker: suppresses losing directions after 5 trades.
- Dual-confirmation: two independent Claude calls must agree before firing.
- Claude prompt rebuilt with explicit calibration rules and probability guidance.

### Market scanning
- Parallel scan: all 12 markets scored simultaneously, best consensus picked.
- Added BNB/15m, additional SOL, BTC series.
- Opportunity scanner runs every 90 seconds for extreme/high-volume markets.
- Event-driven: extra scan when asset moves >0.5% between checks.

### Kelly & sizing
- Fractional Kelly ramp: Q1 Kelly first 10 trades, 37.5% trades 10-20, full after 20.
- Dynamic Kelly adjusts with rolling win rate.
- Fee-adjusted minimum edge by stake size.
- Minimum viable trade: $1 floor.
- Principal protection compounding.

---

## [v0.8] — Platform integrations + UI rebuild

### Robinhood integration
- Ed25519 signing via backend proxy.
- Mirror trading: Kalshi YES on 15m crypto → auto-buy same crypto on Robinhood.
- Setup screen tab + Settings section.
- Auto-loads saved credentials on launch.

### Webull integration
- HMAC-SHA1 signing via backend proxy.
- Same mirror trading logic as Robinhood.
- Setup screen tab + Settings section.

### Platform selector
- Topbar: NONE / RH / WB / BOTH buttons.
- Unified `mirrorTrade()` routes to correct platform.

### UI
- 5-tab layout: Dashboard / Signals / Positions / Analytics / Settings.
- Two-row compact topbar (fits all controls without squishing).
- MIRROR selector + PIERCE THE HEAVENS in row 2.
- Live crypto price ticker (BTC/ETH/SOL/XRP/DOGE with 24h change).
- Session P&L curve chart.
- Performance summary (Best Hour, Best Market, Kelly Calibration).
- Tooltips on all controls.
- RESET SESSION button.
- PAPER: OFF toggle.

### Position management
- Status: ⏳ PENDING → ✓ FILLED → ✓ SETTLED.
- CANCEL button (resting orders) and CLOSE button (filled positions).
- `cancelPosition()` handles all Kalshi cancel scenarios gracefully.

---

## [v0.7] — Visual overhaul + Media

### Loading screen
- Tengen Toppa battle clip plays fullscreen on launch.
- Kamina's theme fades in over 2 seconds to 82% volume.
- Progress bar fills with cycling status messages.
- Music fades out on connect (or after 30 seconds).
- 15-second hard failsafe dismissal.

### Win/Loss media
- Kamina clip pops up on wins.
- Anime death clip on losses.
- Side panel in top-left, slides in/out.

### Background imagery
- Tengen Toppa space battle → header banner.
- Kamina/Simon stargazing → card panel backgrounds.
- Spiral drill → spinning accent on section headers.
- Anti-Spiral cosmic figure → app background.
- Kamina fists → loading screen image.

### App icon
- Kamina circular portrait with orange glow ring.
- Proper multi-size ICO (16/32/48/64/128/256px) for Windows.

---

## [v0.6] — Settlement + P&L accuracy

### Settlement system
- Real Kalshi market polling — checks `result` field every 30s.
- Requires both `result` AND `status === 'finalized'` before settling.
- Falls back to `expiration_value` field if result is empty.
- Post-settlement balance reconciliation (3s delay, pulls real Kalshi balance).

### P&L math
- Correct Kalshi payout: `contracts × $1.00 × (1-fee) - stake`.
- Stores `entryPriceCents` on each position for accurate cost basis.
- Sanity cap: P&L can't exceed `contracts × $0.99`.
- `S.pnl` always derived from `real_balance - startPortfolio`, never accumulated.

### Balance tracking
- `fetchBalance` parses `balance`, `balance_dollars`, and `portfolio_value` fields.
- True portfolio = cash balance + open position value.
- `S.startPortfolio` always reset on ARM, never carries over from previous sessions.

---

## [v0.5] — AI exit manager

### Momentum watcher
- Every 60 seconds, Claude reviews each open position.
- Context: current price vs entry, rolling price trend, live spot, orderbook, time remaining, session P&L.
- Returns exit/hold with confidence and suggested exit price.
- Guards: won't exit if value < 4¢, won't exit already-settled positions.

### Close position
- Sells at current market bid via Kalshi order.
- CLOSE button in positions table for manual exit.

---

## [v0.4] — Risk management

### Circuit breakers
- Stop-loss: halts if drawdown ≥ configured % (requires 3+ trades + 5+ balance readings).
- Consecutive loss circuit breaker.
- Profit lock: halves sizing once up 5% in session.
- Recovery mode: reduced sizing during drawdown.
- Max positions cap.

### Stop-loss fix history
- v1: fired immediately on ARM — fixed by requiring `balanceReadings >= 5`.
- v2: fired between sessions — fixed by resetting `startPortfolio` on every ARM.
- v3: fired with no trades — fixed by requiring `wins + losses >= 3`.

---

## [v0.3] — Order system

### Self-discovering endpoint
- Probes Kalshi API on each ARM to detect active endpoint.
- Falls back automatically between legacy and events endpoints.
- Handles endpoint changes mid-session.

### Order improvements
- Aggressive limit pricing (+2¢ over ask) for better fill rates.
- `pollPosition` → `pollMarketResult` flow (skips broken order lookup).
- Paper trading: marks filled immediately, polls real market for result.

### Kalshi API notes
- Legacy endpoint: `POST /trade-api/v2/portfolio/orders` with `action`, `side`, `yes_price`.
- `yes_price` always = YES side price regardless of which side you're buying.
- `time_in_force: 'good_til_cancelled'`, `self_trade_prevention_type: 'cancel_resting_maker'` required on events endpoint.

---

## [v0.2] — Electron packaging

- Electron app with embedded Node.js server (port 3456).
- Window opens in parallel with server, retries up to 20 times with backoff.
- 15-second hard failsafe dismissal of loading screen.
- Credentials stored in `%APPDATA%\Spiral\` — per-user, survives reinstalls.
- Crash guards: renderer crash → reload, uncaught exceptions caught.
- Closes fully on X (no hide-to-tray).
- `asar: false` so assets are accessible as regular files after install.
- ASSET_ROOT searches multiple paths to find assets in any install context.
- Static file server handles PNG, JPG, MP4, MP3, ICO with range request support for video.

---

## [v0.1] — Initial release

- Claude AI signal generation (claude-sonnet-4-5).
- Kalshi RSA-PSS authentication.
- BTC/15m and BTC hourly markets.
- Half Kelly position sizing.
- Basic win/loss tracking and combat log.
- Node.js server + browser UI.
- Tutorial setup screen.

---

*"Don't believe in yourself. Believe in me, who believes in you." — Kamina*
