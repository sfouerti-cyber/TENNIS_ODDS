# BTA Tennis • Live-Lines Fan Sportsbook

**Free-to-play, virtual-credit BTA Tennis League website** with a premium sportsbook-inspired interface, 10 authentic player portraits, the electric-blue BTA logo, weekly matchups, a moneyline/parlay builder, a community-driven odds engine, private accounts, ticket history, standings, and an admin dashboard. Responsive on desktop and mobile.

**This is not a real-money sportsbook.** There are no deposits, withdrawals, prizes, payment features, cash value, or real-money gambling. The UI is original, and the project is not connected to or endorsed by FanDuel, DraftKings, Kalshi, or Polymarket. This project is a ready-to-run *source-code app*, not a pre-hosted public website.

## Quick start

1. Install **Node.js 20+** if you do not already have it: https://nodejs.org
2. Unzip the project, open a terminal in the `bta-sportsbook` directory.
3. Set a strong private commissioner password and start the server:

   **Windows PowerShell:**

   ```powershell
   $env:BTA_ADMIN_PASSWORD = "choose-a-strong-private-password"
   npm start
   ```

   **macOS / Linux:**

   ```bash
   BTA_ADMIN_PASSWORD="choose-a-strong-private-password" npm start
   ```

4. Open **http://localhost:3000** in a browser.

There are **zero external npm dependencies**. Use `npm test` to run the integration tests.

## Fan features

- Browse the nine-week season, including set scores for completed matches and live prices for active markets.
- Select one match winner for a straight pick, or combine 2–5 selections into a parlay. Stakes are always **virtual credits (CR)**.
- Register a username and password. Each fan begins with **1,000 CR**.
- Review all pending/won/lost tickets in **My Bets**.
- Follow league standings, the public credit leaderboard, and filterable betting activity. The public views include player usernames and virtual-credit activity.
- The website checks for price updates every ~8 seconds. If another fan moves the line before your ticket is accepted, the server **rejects the stale price** so you can review the new payout. Tickets that are accepted **lock their exact odds** for settlement.
- Both sides of a matchup cannot appear on the same ticket.

## Commissioner features

Sign in with username `admin` and the password from `BTA_ADMIN_PASSWORD`. The commissioner can:

1. Edit weekly matchups, players, **reference moneylines**, venue labels, featured match, and market open/closed status.
2. Set **house vig / quoted overround** (4–30%); default **20%**.
3. Set **price movement** in implied-probability points per 100 net credits of market-wide action (0–4, default 1.25).
4. Set **maximum shift** from fair reference probability (0–12 points, default 8).
5. Publish adjusted odds to everybody on the hosted server.
6. Enter independently confirmed match winners or void an event, which settles affected tickets automatically.
7. Advance to the next scheduled week and publish its markets when ready. Advancing closes both the previous and new weeks.
8. Review all tickets by player, credit activity, aggregate pending exposure, standings, and championship futures.
9. Review backfilled results attached to existing pending bets. A confirmation settles those tickets at their accepted prices.

## How the dynamic odds work

This is a transparent **league-wide** simulated pricing model, not individualized or discriminatory dynamic pricing.

- The commissioner enters **reference** moneylines. To remove any vig in those reference quotes, the app normalizes the implied probabilities so the two outcomes total 100%.
- The configured overround is split between outcomes, increasing both quoted implied probabilities, and therefore generally offering less favorable payouts than the reference line. **20% overround is exceptionally high compared with typical major regulated sportsbooks.** It is not a promise of house profitability.
- Each pending accepted virtual ticket counts its **stake** toward each selected matchup. The net difference between credits backing each side shifts the worldwide/league-wide line toward the more popular player, up to the configured cap.
- All users receive the **same live line** regardless of their personal behavior. No account-specific price discrimination or private bettor profiling.
- Quoted prices are rounded to integer American moneylines, so the realized quoted overround may vary slightly from the configured setting.
- Prices for already accepted tickets never change. An append-only, per-match line history (last 32 price changes) is kept in the server database.
- This simplified virtual exposure system is for league entertainment. It does not model the complete liability, correlations, hedging, or profitability calculations of a licensed sportsbook.

### Week 2 initial reference odds

| Matchup | Reference odds |
|---|---|
| Jack vs. Jacob Ebani | -350 / +280 |
| Joe D vs. Joey | +300 / -375 |
| Fish vs. Vic | -155 / +130 |
| Ryan vs. Soly | +180 / -215 |
| Morris vs. Eric | +155 / -180 |

**Important:** The website's *displayed* odds include the commissioner-configured vig and any market-wide line movement, so they will differ from the original reference odds above.

## Championship futures

The model combines each player's match record and remaining schedule. For each remaining matchup it averages two estimates: the normalized implied probability from the reference moneylines and the relative smoothed win rates, where a player's smoothed win rate is `(wins + 2) / (wins + losses + 4)`. It simulates 8,192 seasons with a fixed random seed and a one- or two-set victory margin. Standings and futures settlement rank by match wins, then set differential, then alphabetical full name.

The shares of simulated championships sum to one. Decimal payouts use reciprocal probabilities rounded down to cents. Outcomes with no feasible quoted payout appear unpriced. The simulation is an estimate, and a zero count means the simulated sample produced no wins for that outcome. Futures are straight bets and their accepted decimal prices are immutable. The market closes when the scheduled fixtures are complete, and settlement waits for missing scores and historical reviews.

## Player photographs

The included `public/assets/*.webp` files are optimized crops of the user-supplied portraits and use the latest photo supplied for **Eric**. The roster has Jack, Jacob Ebani, Joe D, Joey, Fish, Vic, Ryan, Soly, Morris, and Eric. The BTA electric-blue logo is included. Ensure your league has each person's permission before publishing their photo publicly.

## Data and deployment

The app saves accounts, hashed passwords, login sessions, balances, bet receipts, settlement, market prices, and odds history on the **server**, not in each visitor's browser.

- Default data store: `data/db.json` (generated on first run; intentionally not included in the download).
- For Railway production, set `BTA_DATA_FILE=/data/db.json` on the existing volume. Production startup requires an existing, recognized file and refuses to create an empty one.
- Required production environment variable: `BTA_ADMIN_PASSWORD`.
- Required hosting: Node 20+, **HTTPS**, **persistent writable storage**. Set host `PORT` if required.
- Use the command `npm start`. Run one server instance and preserve the data volume across deployments. The read-only `/health` route returns HTTP 200 after the server loads the store successfully.
- This JSON-file store is suitable for a small-league fan demo on one server. For larger use, migrate to a transactional database and add production-grade account recovery, monitoring, backups, abuse protection, and automated market-close schedules.

**Do not publish your password, `data/db.json`, or any user data to GitHub.** `.gitignore` excludes the live data file. A public deployment should have rate limits, reliable backups, HTTPS, and proper admin credential storage.

### Production migration

Before deployment, verify the live file and compare accounts, balances, and tickets against the known private backup. Take a fresh private volume backup and confirm there is free space for the original file, migrated file, and an atomic-write temporary copy. Schema 1 is copied byte-for-byte to `db.json.pre-season.bak` with mode `0600` before migration. The schema-2 write uses a same-directory temporary file and an atomic rename. Startup leaves missing or invalid production stores untouched.

Migration keeps the current week, existing fixture IDs and results, account records, passwords, sessions, tickets, and balances. Canonical fixtures match existing player pairs within a week. Extra legacy fixtures remain available in history and are excluded from round-robin standings. A pending ticket tied to a newly backfilled outcome requires commissioner confirmation before that outcome is used to settle it. Conflicting legacy winners are retained and can be given their verified missing set score from the commissioner dashboard.

Keep backups private and outside Git. If rollback becomes necessary after new bets have been accepted, preserve the live file first and reconcile post-migration activity before any restore.

### User support and rule caveats

The commissioner must close markets before match start and independently verify results. Mark postponed/canceled events `void` when appropriate; all-void tickets return the stake, and void parlay legs count as 1.00×. No live money is involved. For real-money usage, seek legal counsel and partner with an appropriately licensed operator; this app intentionally lacks compliance, payments, age/location screening, fraud prevention, and formal market integrity safeguards.
