# PortAct Mobile

A read-only React Native portfolio management and financial tracking app built with Expo. Import your PortAct backup and get a live, beautifully visualised view of your entire financial life — stocks, mutual funds, crypto, real estate, deposits, expenses, and more.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Screens](#screens)
5. [Data Model](#data-model)
6. [Services](#services)
7. [State Management](#state-management)
8. [Theme System](#theme-system)
9. [Live Price Refresh](#live-price-refresh)
10. [Supported Asset Types](#supported-asset-types)
11. [Getting Started](#getting-started)
12. [Building an APK](#building-an-apk)
13. [Project Structure](#project-structure)
14. [Dependencies](#dependencies)

---

## Overview

PortAct Mobile is the companion mobile app for the [PortAct](https://portact.in) personal finance platform. It is strictly **read-only** — it never modifies your data. You import a PortAct backup file (from Google Drive or manually), and the app gives you a real-time, richly visualised view of your portfolio.

**Key principles:**
- Read-only by design — your data is never modified
- Works offline after the first import — no account required
- Live prices overlaid on backup data without altering it
- Supports 40+ asset types across Indian and global markets
- Built for the PortAct backup format (export versions 1.0–11.0)

---

## Features

### Portfolio
- Net worth at a glance with overall P&L
- Asset breakdown across 13 categories (Stocks, US Stocks, Equity MFs, Hybrid MFs, Debt MFs, Commodities, Crypto, Deposits, Retirement, Govt Schemes, Real Estate, Bonds, Physical)
- Live price overlay with day-change % for eligible assets
- XIRR per holding
- Swipe left/right to navigate between asset categories
- Pull-to-refresh for live prices
- Per-holding transaction history

### Dashboard (Overview)
- Net worth hero card with invested / cash / asset count breakdown
- Portfolio growth chart with period selector (1M / 3M / 6M / 1Y / ALL)
- Asset allocation donut chart with legend
- Pull-to-refresh

### Market Insights
- Sentiment gauges (India Market Mood Index, Bitcoin Fear & Greed, US Fear & Greed) with zone colouring and 60-day sparkline
- Live market indices: NIFTY 50, SENSEX, S&P 500, NASDAQ
- Commodity prices: Bitcoin, Brent Crude, Gold, Silver (INR + USD)
- Live USD/INR rate
- India macro data: CPI, Nifty P/E, India VIX, RBI Repo Rate
- Top financial news headlines (Yahoo RSS)

### Expenses
- Monthly expense trend bar chart — tap any bar to drill in
- Category breakdown donut chart + legend
- Current-year summary (total, average/month)
- Month detail: category pie, sortable transaction table

### Asset Detail
- Current value, XIRR, last price update
- All metadata fields with smart formatting (dates, currencies, percentages auto-detected)
- Full transaction history (buy/sell/dividend)

### Settings
- Google Drive integration — sign in, list recent backups, sync latest
- Manual file upload
- Light / Dark / System theme
- Clear all data

---

## Architecture

```
portact-mobile/
├── app/                        # Expo Router screens & layouts
│   ├── _layout.tsx             # Root layout (gesture handler, safe area, stack)
│   ├── index.tsx               # Splash / entry screen
│   ├── onboarding.tsx          # Import flow (Google Drive or manual)
│   ├── (tabs)/                 # Bottom tab navigator
│   │   ├── _layout.tsx         # Tab bar configuration
│   │   ├── index.tsx           # Overview / Dashboard
│   │   ├── portfolio.tsx       # Portfolio holdings
│   │   ├── expenses.tsx        # Expense tracker
│   │   ├── market.tsx          # Market insights
│   │   └── settings.tsx        # App settings
│   ├── asset/[id].tsx          # Asset detail (modal)
│   └── expenses/[month].tsx    # Monthly expense detail
│
└── src/
    ├── components/
    │   ├── ui/                 # Base components (Button, Card, Badge, etc.)
    │   ├── charts/             # PortfolioLineChart, AllocationDonut
    │   ├── dashboard/          # NetWorthHeader, TopHoldings
    │   └── portfolio/          # AssetCard, AssetRow
    ├── hooks/
    │   └── useTheme.ts         # Theme hook (colors, spacing, typography)
    ├── services/
    │   ├── priceService.ts     # Live price fetching (Yahoo, AMFI, CoinGecko)
    │   ├── marketService.ts    # Market indices, sentiment, news
    │   ├── backupParser.ts     # JSON validation & normalization
    │   ├── googleDrive.ts      # Google Sign-In + Drive API
    │   └── storage.ts          # AsyncStorage + FileSystem persistence
    ├── store/
    │   ├── usePortfolioStore.ts # Zustand — all portfolio state & actions
    │   └── useThemeStore.ts    # Zustand — theme preference
    ├── theme/
    │   ├── colors.ts           # Palette, light/dark themes, asset type colors
    │   ├── typography.ts       # Font sizes, weights, line heights
    │   ├── spacing.ts          # Spacing scale, border radii, icon sizes
    │   └── index.ts            # Theme type exports
    ├── types/
    │   ├── portfolio.ts        # Derived UI domain types
    │   └── backup.ts           # Raw PortAct backup JSON types (v11.0)
    └── utils/
        ├── calculations.ts     # Portfolio metrics, allocations, snapshots
        └── formatters.ts       # Currency, percent, date, number formatting
```

### Technology Choices

| Concern | Solution |
|---|---|
| Navigation | Expo Router (file-based, React Navigation v7 underneath) |
| State | Zustand (minimal boilerplate, selector subscriptions) |
| Storage | AsyncStorage (metadata) + Expo FileSystem (large JSON) |
| Charts | react-native-gifted-charts |
| Gestures | react-native-gesture-handler + react-native-reanimated |
| Icons | @expo/vector-icons (Ionicons) |
| HTTP | Native `fetch` (no axios) |
| Dates | dayjs |
| Auth | @react-native-google-signin/google-signin |
| Styling | Inline StyleSheet with design-token theme system |

---

## Screens

### Splash / Entry (`/`)

The app's entry point. On mount it attempts to load a saved backup from device storage. If data is found it shows a preview card with net worth and a "Tap to continue" prompt. It also triggers a daily Google Drive sync if the integration is configured.

**Routes to:**
- `/onboarding` if no backup is found or onboarding is incomplete
- `/(tabs)/` if backup loads successfully

---

### Onboarding (`/onboarding`)

Two import options:

1. **Google Drive** — Triggers Google Sign-In OAuth, fetches the latest `portact_backup_*.json` from the user's Drive, parses and loads it.
2. **Manual upload** — Opens the system file picker, reads the selected JSON file.

On success, stores the backup and metadata on-device and routes to the main tabs.

---

### Overview Tab (`/(tabs)/`)

The dashboard. Three main cards:

1. **Net Worth card** — Total portfolio value (assets + cash), overall P&L with percentage, and three sub-metrics: Invested amount, Asset count, Total cash (bank + demat + crypto).

2. **Portfolio Growth chart** — Line chart of historical portfolio value from `portfolio_snapshots`. Period can be filtered to 1M / 3M / 6M / 1Y / ALL. The Y-axis is shifted to the data range (not zero-based) for better visual signal.

3. **Allocation donut** — Pie chart showing current value split by asset category (Equity, Debt, Commodity, etc.) with a legend.

---

### Portfolio Tab (`/(tabs)/portfolio`)

Holdings view across 13 category tabs. Only tabs that have at least one holding are shown.

- Horizontal scroll tab strip — tap a tab or **swipe left/right** anywhere on the list to move between categories
- Summary card per tab showing total value, invested, and P&L for that category
- Column-header row (NAME | INVESTED | VALUE)
- Asset rows showing live prices when available, otherwise backup prices
- Refresh button (top-right) for manual price refresh; pull-to-refresh also works

---

### Expenses Tab (`/(tabs)/expenses`)

- Yearly summary bar (total, monthly average, months tracked)
- Monthly bar chart — tap a bar to open the month detail screen
- Category donut chart for the current year

**Month Detail (`/expenses/[month]`):**
- Month total + transaction count
- Category pie breakdown
- Sortable transaction table (tap column header to sort)

---

### Insights Tab (`/(tabs)/market`)

Real-time market data. All data is fetched fresh on screen load.

- **Sentiment gauges** — Semicircle gauges with zone colouring (Extreme Fear → Extreme Greed) and a 60-day sparkline history chart below each
- **Market indices** — Price + day change tiles for major global indices
- **Commodities** — BTC, Crude, Gold, Silver with dual INR/USD pricing
- **USD/INR rate**
- **India macro** — CPI, Nifty P/E, VIX, Repo Rate
- **Financial news** — 10 headline cards with source and date

---

### Settings Tab (`/(tabs)/settings`)

- **Backup info** — File name, export date, when it was loaded, source (Drive or manual)
- **Google Drive** — Sign in, sync latest, browse last 5 backups
- **Manual upload** — Re-import from a local file
- **Appearance** — System / Light / Dark theme selection (persisted)
- **Data** — Clear all data and return to onboarding

---

### Asset Detail (`/asset/[id]`)

Modal screen (slides up from bottom).

- **Hero card** — Current value, P&L badge, invested amount, XIRR, last price update (relative)
- **Core fields** — Broker, account holder, ISIN, symbol, quantity, avg buy price, current price
- **Extended details** — All fields from the `details` JSON blob, auto-formatted:
  - Keys matching date patterns → `DD MMM YYYY`
  - Keys matching currency patterns → `₹X.XXL`
  - Keys matching rate/percentage patterns → `+X.XX%`
  - Booleans → Yes / No
- **Transaction history** — All buy/sell/dividend transactions sorted newest-first

---

## Data Model

### Backup Format

PortAct exports a single JSON file. The app supports versions 1.0–11.0. The root object contains:

```
BackupFile
├── export_version          String
├── exported_at             ISO timestamp
├── user_profile            Name, DOB, city, salary, preferences
├── portfolios[]            Portfolio groups
├── bank_accounts[]         Bank accounts with balances
├── demat_accounts[]        Brokerage accounts with cash
├── crypto_accounts[]       Exchange accounts with cash
├── assets[]                All holdings
├── transactions[]          All buy/sell/dividend events
├── expenses[]              All expense records
├── expense_categories[]    Category definitions (name, icon, colour)
├── incomes[]               Income records
├── portfolio_snapshots[]   Historical net worth snapshots
├── mutual_fund_holdings[]  MF-specific NAV + units data
├── mf_systematic_plans[]   SIP/SWP plans
├── ff_profile              Financial Freedom profile (FIRE number, etc.)
├── ff_income_sources[]     FI income sources
├── ff_milestones[]         Financial milestones
├── ff_debts[]              Debt records
├── master_asset_types[]    Asset type master with display names
├── master_asset_categories[]  Category master
├── ref_rates[]             Reference rates
└── macro_data_points[]     Macro economic time-series data
```

### Normalised Asset

The raw `RawAsset` is normalised at load time into a typed `Asset`:

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique ID |
| `assetType` | string | Machine key (`equity_mutual_fund`, `stock`, etc.) |
| `assetTypeDisplayName` | string | Human label (`Equity Mutual Fund`, `Stock`) |
| `category` | string | Category group (`equity`, `debt`, `commodity`, etc.) |
| `name` | string | Holding name |
| `symbol` | string \| null | Ticker symbol |
| `isin` | string \| null | ISIN code |
| `quantity` | number \| null | Units / shares held |
| `avgBuyPrice` | number \| null | Average purchase price |
| `currentPrice` | number \| null | Price from backup (overridden by live price) |
| `currentValue` | number | Current value |
| `totalInvested` | number | Total cost basis |
| `profitLoss` | number | Absolute gain/loss |
| `profitLossPercent` | number | Percentage gain/loss |
| `xirr` | number \| null | Annualised return |
| `currency` | string | `INR` or `USD` |
| `brokerName` | string \| null | Broker / institution |
| `lastPriceUpdate` | string \| null | Timestamp of last price update |
| `details` | Record\<string, unknown\> | Asset-type-specific metadata |

---

## Services

### Price Service

Orchestrates live price refresh across all asset types:

| Asset Type | Data Source | Notes |
|---|---|---|
| NSE Stocks / ETFs | Yahoo Finance Spark API | `.NS` suffix, batched 20/request |
| US Stocks / ETFs | Yahoo Finance Spark API | USD → INR conversion |
| Equity / Debt MFs | AMFI `NAVAll.txt` | ISIN lookup, cached 4 hours |
| Crypto | CoinGecko API v3 | Direct INR pricing |
| Gold / Silver (physical) | Yahoo Futures (GC=F / SI=F) | Weight + purity factors |
| Sovereign Gold Bonds | Yahoo Futures | NAV calculation |
| Crude Oil | Yahoo Futures (BZ=F) | Barrel → litre, USD → INR |

**Refresh phases:**
1. Parallel warm-up (USD/INR rate, AMFI cache, metal futures)
2. Batch Yahoo Spark for all NSE + US symbols
3. Apply results, compute day change %
4. AMFI in-memory lookup for missed MFs
5. Individual chart API fallback (rate-limited, 400ms delay between calls)

### Market Service

Fetches all data for the Insights tab from Yahoo Finance, CoinGecko, and public APIs. Returns typed objects for indices, commodities, sentiment, macro data, and news.

### Google Drive Service

- OAuth via `@react-native-google-signin/google-signin` (read-only scope)
- Lists `portact_backup_*.json` files sorted by modified date
- Downloads file content as text for parsing
- Supports silent background re-auth

### Storage Service

Hybrid persistence strategy:

| Data | Storage | Why |
|---|---|---|
| Backup JSON (multi-MB) | `expo-file-system` | Avoids AsyncStorage 6MB limit |
| Metadata, config, flags | `AsyncStorage` | Simple key-value |

---

## State Management

All portfolio state lives in a single Zustand store (`usePortfolioStore`).

### Key State

```typescript
status:          'idle' | 'loading' | 'loaded' | 'error'
backup:          BackupFile | null       // full raw backup
assets:          Asset[]                 // normalised, active only
allocations:     AssetAllocation[]       // by asset category
snapshots:       PortfolioSnapshot[]     // historical + today
summary:         PortfolioSummary        // net worth totals
livePrices:      Map<number, LivePrice>  // real-time overlay
priceRefreshing: boolean
filter:          AssetFilter             // search / sort / type
```

### Key Actions

| Action | Description |
|---|---|
| `loadFromString(json, meta)` | Parse backup JSON, derive all computed state |
| `loadFromStorage()` | Restore from device, trigger background price refresh |
| `refreshLivePrices()` | Fetch live prices for all eligible assets |
| `setFilter(patch)` | Update search / sort / type filter |
| `clearData()` | Wipe all data, reset to idle |

### `useFilteredAssets()` Hook

Returns assets filtered by the current `AssetFilter` (portfolio, type, search query) and sorted by the selected sort field (name, value, P&L, P&L%, XIRR).

---

## Theme System

The app ships with fully-implemented light and dark themes, selectable in Settings or auto-detected from the system.

### Color Tokens (Dark Mode)

| Token | Value | Use |
|---|---|---|
| `background` | `#0A0A0F` | Screen background |
| `surface` | `#1C1C1E` | Cards |
| `accent` | `#4D94FF` | Active / highlight |
| `gain` | `#2ED882` | Profit |
| `loss` | `#FF6B63` | Loss |
| `textPrimary` | `#FFFFFF` | Main text |
| `textSecondary` | `#8E8E93` | Supporting text |

### Typography Scale

11 variants from `micro` (10px) to `hero` (42px). Each variant has a defined font size, weight, line height, and letter spacing.

### Spacing Scale

`px(1)` → `xs(4)` → `sm(8)` → `md(16)` → `lg(24)` → `xl(32)` → `xxl(48)` → `xxxl(64)`

---

## Live Price Refresh

**Eligible assets** — those with a symbol, ISIN, or API symbol that maps to a supported data source.

**Ineligible** (retain backup price) — PPF, SSY, NPS, real estate, insurance, gratuity, physical cash, pension.

**Session caches:**
- AMFI NAV data: 4 hours
- USD/INR rate: 10 minutes
- Metal futures: 5 minutes

**Refresh triggers:**
- App load (via `loadFromStorage`)
- Manual refresh button (Portfolio tab)
- Pull-to-refresh (Overview tab)
- Every 30 minutes while in foreground
- Daily Google Drive sync (once per calendar day)

---

## Supported Asset Types

| Category | Types |
|---|---|
| **Indian Equities** | Stock, ESOP, RSU, REIT, InvIT |
| **US Equities** | US Stock |
| **Mutual Funds** | Equity MF, Hybrid MF, Debt MF |
| **Commodities** | Commodity, Sovereign Gold Bond |
| **Physical Assets** | Physical Gold, Physical Silver, Physical Cash, Physical Currency, Precious Stone, Painting, Collectible, Other |
| **Crypto** | Crypto |
| **Fixed Income** | Fixed Deposit, Recurring Deposit, Savings Account |
| **Bonds** | Corporate Bond, RBI Bond, Tax Saving Bond |
| **Govt Schemes** | PPF, SSY, NSC, KVP, SCSS, MIS |
| **Retirement** | PF, NPS, Gratuity, Pension, Insurance Policy |
| **Real Estate** | Land, Farm Land, House |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A PortAct backup file (exported from the PortAct app or Google Drive)

### Install

```bash
git clone https://github.com/portact-admin/portact-mobile.git
cd portact-mobile
npm install
```

### Run in Development

```bash
npx expo start
```

Scan the QR code with Expo Go or press `a` for an Android emulator.

### Run with Native Build (Physical Device)

```bash
npx expo run:android
npx expo run:ios       # Mac + Xcode required
```

---

## Building an APK

### Debug APK (friend testing — no signing needed)

```bash
cd android && ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Share the file. The recipient enables **"Install from unknown sources"** in Android settings and installs it. No Expo required.

### Release APK

1. Generate a signing keystore:
```bash
keytool -genkey -v -keystore portact-release.keystore \
  -alias portact -keyalg RSA -keysize 2048 -validity 10000
```
2. Configure signing in `android/app/build.gradle`
3. Build: `cd android && ./gradlew assembleRelease`

### EAS Cloud Build

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

---

## Project Structure

```
portact-mobile/
├── app/                    # All screens (Expo Router file-based routing)
├── src/
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API + storage services
│   ├── store/              # Zustand global stores
│   ├── theme/              # Design tokens (colors, type, spacing)
│   ├── types/              # TypeScript interfaces
│   └── utils/              # Pure utility functions
├── assets/
│   └── logo.png            # App icon (1024×1024)
├── app.json                # Expo app configuration
├── babel.config.js         # Path aliases
└── tsconfig.json           # TypeScript + path mapping
```

### Path Aliases

| Alias | Resolves to |
|---|---|
| `@components/*` | `src/components/*` |
| `@hooks/*` | `src/hooks/*` |
| `@services/*` | `src/services/*` |
| `@store/*` | `src/store/*` |
| `@theme/*` | `src/theme/*` |
| `@models/*` | `src/types/*` |
| `@utils/*` | `src/utils/*` |

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `expo` | ~56.0.6 | Core framework |
| `expo-router` | ~56.2.7 | File-based navigation |
| `react-native` | 0.85.3 | UI framework |
| `zustand` | ^5.0.14 | State management |
| `react-native-gifted-charts` | ^1.4.77 | Charts (line, bar, pie) |
| `react-native-gesture-handler` | ~2.31.1 | Swipe / fling gestures |
| `react-native-reanimated` | 4.3.1 | Gesture animation |
| `react-native-safe-area-context` | ~5.7.0 | System bar insets |
| `@react-native-google-signin/google-signin` | ^16.1.2 | Google Drive OAuth |
| `expo-document-picker` | ~56.0.4 | Manual file import |
| `expo-file-system` | ~56.0.7 | Large JSON storage |
| `@react-native-async-storage/async-storage` | 2.2.0 | Key-value storage |
| `expo-linear-gradient` | ~56.0.4 | Gradient backgrounds |
| `react-native-svg` | 15.15.4 | SVG sentiment gauges |
| `dayjs` | ^1.11.21 | Date formatting |
| `@expo/vector-icons` | ^15.0.2 | Ionicons |

---

## Notes

- **No backend** — entirely client-side. All data comes from the PortAct backup file.
- **No account needed** — Google Sign-In is optional (Drive sync only). The app itself has no login.
- **Privacy** — backup data never leaves the device except for optional Google Drive reads.
- **Backup compatibility** — targets PortAct export v11.0, degrades gracefully for v1.0–10.x.
- **Android edge-to-edge** — runs in edge-to-edge mode (SDK 56 + New Architecture). The tab bar uses `useSafeAreaInsets().bottom` to sit correctly above the system navigation bar on all Android devices.
