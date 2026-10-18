# Magazine Share Tracker & AI Research Hub

A personal investment reading companion designed for readers of **Investors' Chronicle**, **Shares Magazine**, **Financial Times**, **The Economist**, **Barron's**, and weekend business papers.

## Key Features
1. **Quick-Capture Share Input & Global Autocomplete**:
   - Type any share name or ticker symbol (UK FTSE 100, FTSE 250, FTSE AIM 100, US S&P 500, NASDAQ-100, Dow 30, European & Indian equities).
   - Record which magazine/newspaper you read it in, the magazine's stance (`Buy Tip`, `Feature Mention`, `Hold / Update`, `Contrarian Pick`), your action bucket (`Look Later (To Research)`, `Watchlist`, `High Conviction`, `Bought`, `Passed`), and personal notes.
2. **Sector, Exchange Listing & Index Classification**:
   - Automatically identifies the company's **Sector & Industry**, **Where It Is Listed** (e.g., *London Stock Exchange — Main Market*, *LSE AIM*, *NASDAQ*, *NYSE*, *Euronext*, *NSE*), **UK ISA & SIPP Eligibility**, and **Which Index / Indices It Falls Under** (`FTSE 100`, `FTSE 250`, `FTSE 350`, `FTSE All-Share`, `FTSE AIM 100`, `S&P 500`, `NASDAQ-100`, etc.).
3. **Combined View of Major Companies / Brokerages (Buy / Hold / Sell Approach)**:
   - Displays the aggregated institutional analyst consensus (`STRONG BUY`, `BUY`, `HOLD`, `SELL`), `% Buy / % Hold / % Sell` distribution bar, 12-month consensus target price & implied upside %, and individual ratings from major investment banks (*Goldman Sachs*, *JPMorgan Cazenove*, *Morgan Stanley*, *Barclays Capital*, *Peel Hunt / Berenberg*, *UBS*).
4. **Trending Shares Category & Momentum Analysis**:
   - Evaluates whether the share falls under the **🔥 Trending Shares** category (`0–100` Momentum Score) using Relative Volume (`RVOL`), 1D/1W/1M price momentum, and 50-Day / 200-Day Moving Average structure.
5. **Why Is It In The News?**:
   - Synthesizes the primary news catalysts driving magazine and press coverage alongside clickable financial news headlines.
6. **AI Investment Agent Verdict ("Should You Buy or Not?")**:
   - Multi-factor AI Investment Committee evaluation with a **5-Factor Conviction Scorecard**, **Executive Thesis**, **3 Bull Case Reasons to Buy**, **3 Bear Case Risks to Watch**, **Tactical Trade Plan** (Entry Zone, 12M Target, Support/Stop-Loss), and a live **Strategy Lens Switcher** (*Balanced Total Return*, *Growth & Momentum*, *Dividend Income*, *Strict Value*).

## Running Locally
Double-click `run_magazine_tracker.bat` in the root workspace folder, or run:
```bash
cd magazine-share-tracker
node server.js
```
Then open `http://127.0.0.1:8090` in your browser.
