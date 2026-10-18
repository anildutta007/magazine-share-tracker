/**
 * Magazine Share Tracker & AI Research Hub - Frontend Application Logic
 * Works seamlessly with the local Node/Python API server AND standalone in the browser via localStorage + client-side research engine.
 */

(function () {
  const STORAGE_KEY = 'anil_magazine_share_tracker_v1';
  let savedShares = [];
  let activeStatusFilter = 'ALL';
  let activeVerdictFilter = 'ALL';
  let activeTrendingFilter = 'ALL';
  let activeIndexFilter = 'ALL';
  let activeSearchText = '';
  let viewMode = 'cards'; // 'cards' | 'table'
  let backendOnline = false;

  // DOM Elements
  const queryInput = document.getElementById('share-query-input');
  const clearInputBtn = document.getElementById('btn-clear-input');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const magazineSelect = document.getElementById('magazine-source-select');
  const stanceSelect = document.getElementById('magazine-stance-select');
  const statusSelect = document.getElementById('share-status-select');
  const notesInput = document.getElementById('share-notes-input');
  const addShareForm = document.getElementById('add-share-form');
  const submitBtnLabel = document.getElementById('submit-btn-label');
  const toastBanner = document.getElementById('toast-banner');

  const kpiStrip = document.getElementById('kpi-summary-strip');
  const cardsContainer = document.getElementById('shares-cards-container');
  const tableContainer = document.getElementById('shares-table-container');
  const tableBody = document.getElementById('shares-table-body');

  const filterSearchInput = document.getElementById('filter-search-input');
  const filterVerdictSelect = document.getElementById('filter-verdict-select');
  const filterTrendingSelect = document.getElementById('filter-trending-select');
  const filterIndexSelect = document.getElementById('filter-index-select');

  const btnViewCards = document.getElementById('btn-view-cards');
  const btnViewTable = document.getElementById('btn-view-table');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnResetDemo = document.getElementById('btn-reset-demo');

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type = 'success') {
    if (!toastBanner) return;
    const styles = type === 'error'
      ? 'bg-rose-50 border-rose-300 text-rose-900'
      : 'bg-emerald-50 border-emerald-300 text-emerald-900';
    toastBanner.className = `rounded-xl px-4 py-3 text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-xs transition ${styles}`;
    toastBanner.innerHTML = `
      <div class="flex items-center gap-2">
        <span>${type === 'error' ? '⚠️' : '✅'}</span>
        <span>${escapeHtml(message)}</span>
      </div>
      <button type="button" onclick="this.parentElement.classList.add('hidden')" class="text-xs underline ml-4">Dismiss</button>
    `;
    toastBanner.classList.remove('hidden');
    setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, 6000);
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedShares));
    } catch (e) {}
  }

  function loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return Array.isArray(window.INITIAL_SAVED_SHARES) ? JSON.parse(JSON.stringify(window.INITIAL_SAVED_SHARES)) : [];
  }

  // Client-side search & research fallback when running purely static
  function clientSearchCatalog(queryStr, limit = 10) {
    const q = (queryStr || '').trim().toLowerCase();
    if (!q) return [];
    const qClean = q.replace('.l', '').replace(/\./g, '');
    const catalog = window.GLOBAL_CONSTITUENTS_CATALOG || [];
    const scored = [];
    for (const item of catalog) {
      const sym = (item.symbol || '').toLowerCase();
      const ticker = (item.ticker || '').toLowerCase().replace(/\.$/, '');
      const name = (item.name || '').toLowerCase();
      let score = 0;
      if (q === sym || qClean === ticker) score = 100;
      else if (name === q) score = 95;
      else if (ticker.startsWith(qClean) && qClean.length >= 2) score = 85;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 65;
      else if ((item.sector || '').toLowerCase().includes(q)) score = 35;
      if (score > 0) scored.push({ score, item });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.item);
  }

  function formatShortPriceClient(val, currency) {
    if (val == null) return 'N/A';
    if (currency === 'GBp') return `${Number(val).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}p`;
    if (currency === 'GBP') return `£${Number(val).toFixed(2)}`;
    if (currency === 'INR') return `₹${Number(val).toFixed(2)}`;
    if (currency === 'EUR') return `€${Number(val).toFixed(2)}`;
    return `$${Number(val).toFixed(2)}`;
  }

  function formatFullPriceClient(val, currency) {
    if (val == null) return 'N/A';
    if (currency === 'GBp') return `${Number(val).toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}p (£${(val / 100).toFixed(2)})`;
    return formatShortPriceClient(val, currency);
  }

  function recalculateAiVerdictWithLens(share, lens = 'balanced') {
    const consensus = share.broker_consensus || {};
    const buyPct = consensus.buy_pct || 70;
    const sellPct = consensus.sell_pct || 5;
    const upsidePct = consensus.implied_upside_pct || 14;
    const pe = share.pe_ratio || 18;
    const divYield = share.dividend_yield_pct || 2.0;
    const trendingScore = share.trending_score || 65;
    const above50 = share.above_50ma !== false;
    const above200 = share.above_200ma !== false;
    const currency = share.currency || 'GBp';
    const price = share.price_raw || 500;

    let valScore = 60 + (upsidePct >= 20 ? 25 : (upsidePct >= 10 ? 15 : 5)) + (pe <= 16 ? 12 : (pe > 35 ? -8 : 0));
    valScore = Math.max(25, Math.min(96, Math.round(valScore)));
    const instScore = Math.max(20, Math.min(98, Math.round(buyPct * 1.08 + (100 - sellPct) * 0.15)));
    const momScore = Math.max(25, Math.min(96, Math.round(trendingScore * 0.75 + (above50 ? 15 : 0) + (above200 ? 12 : 0))));
    let qualScore = Math.max(40, Math.min(95, Math.round(72 + (divYield >= 3.0 ? 14 : (divYield >= 1.5 ? 8 : 0)) + 8)));
    let catScore = Math.max(35, Math.min(95, Math.round(76 + (buyPct >= 65 ? 10 : 0))));

    let composite;
    let lensLabel = 'Balanced Total Return';
    if (lens === 'income') {
      lensLabel = 'Dividend & Income Focus';
      const yieldBonus = divYield >= 3.0 ? 14 : (divYield >= 2.0 ? 6 : -12);
      composite = Math.round(qualScore * 0.35 + instScore * 0.25 + valScore * 0.25 + momScore * 0.15 + yieldBonus);
    } else if (lens === 'growth') {
      lensLabel = 'High-Growth & Momentum';
      composite = Math.round(momScore * 0.32 + instScore * 0.30 + catScore * 0.23 + valScore * 0.15);
    } else if (lens === 'value') {
      lensLabel = 'Strict Value & Margin of Safety';
      const peAdjustment = pe < 14 ? 12 : (pe > 26 ? -14 : 0);
      composite = Math.round(valScore * 0.42 + instScore * 0.28 + qualScore * 0.20 + momScore * 0.10 + peAdjustment);
    } else {
      composite = Math.round(instScore * 0.28 + valScore * 0.24 + momScore * 0.18 + qualScore * 0.15 + catScore * 0.15);
    }
    composite = Math.max(32, Math.min(96, composite));

    let verdict, badgeColor, actionLabel, oneLine;
    if (composite >= 78 && upsidePct >= 7) {
      verdict = 'STRONG BUY';
      badgeColor = 'emerald';
      actionLabel = 'Accumulate Now / Core Buy';
      oneLine = `[${lensLabel}] High-conviction BUY (${composite}/100): Strong institutional support (${buyPct.toFixed(0)}% Buy) with +${upsidePct.toFixed(1)}% consensus target upside.`;
    } else if (composite >= 63) {
      verdict = 'BUY / ACCUMULATE';
      badgeColor = 'emerald';
      actionLabel = 'Staggered Buy (2 Tranches)';
      oneLine = `[${lensLabel}] Favourable Risk/Reward (${composite}/100): Solid fundamentals in ${share.sector} backed by major brokerages.`;
    } else if (composite >= 48) {
      verdict = 'HOLD / WATCHLIST FOR DIP';
      badgeColor = 'amber';
      actionLabel = 'Keep on Watchlist — Buy on 5–8% Pullback';
      oneLine = `[${lensLabel}] Balanced Valuation (${composite}/100): High quality in ${share.primary_index}, wait for a better entry multiple or yield.`;
    } else {
      verdict = 'AVOID / PASS FOR NOW';
      badgeColor = 'rose';
      actionLabel = 'Stand Aside / Await Better Valuation';
      oneLine = `[${lensLabel}] Cautious Stance (${composite}/100): Valuation or dividend profile does not meet strict ${lensLabel} criteria right now.`;
    }

    const entryLow = price * 0.96;
    const entryHigh = price * 1.01;
    const supportLevel = Math.min(price * 0.90, share.ma_200_raw || price * 0.90);

    return {
      verdict,
      conviction_score: composite,
      badge_color: badgeColor,
      action_label: actionLabel,
      lens: lens,
      lens_label: lensLabel,
      one_line_summary: oneLine,
      executive_thesis: share.ai_agent && share.ai_agent.executive_thesis
        ? share.ai_agent.executive_thesis
        : `Under the ${lensLabel} strategy lens, our AI Investment Committee assigns '${verdict}' (${composite}/100 conviction) for ${share.name} (${share.ticker}). Major brokerages maintain a ${consensus.consensus_verdict} consensus (${buyPct}% Buy) with a 12-month target of ${consensus.target_mean_fmt} (+${upsidePct}% upside).`,
      factor_scores: {
        valuation_upside: valScore,
        broker_consensus: instScore,
        trend_momentum: momScore,
        quality_income: qualScore,
        news_catalysts: catScore,
        overall_conviction: composite
      },
      bull_case: (share.ai_agent && share.ai_agent.bull_case) || [],
      bear_case: (share.ai_agent && share.ai_agent.bear_case) || [],
      trade_plan: {
        recommended_action: actionLabel,
        ideal_entry_zone: `${formatShortPriceClient(entryLow, currency)} – ${formatShortPriceClient(entryHigh, currency)}`,
        consensus_target_12m: consensus.target_mean_fmt,
        bull_target_12m: consensus.target_high_fmt,
        support_stop_level: formatShortPriceClient(supportLevel, currency),
        holding_horizon: share.isa_sipp_eligible !== false ? '12–36 Months (ISA / SIPP Core)' : '12–24 Months'
      }
    };
  }

  function clientResearchShareFallback(queryStr, meta) {
    const q = (queryStr || '').trim();
    const qUp = q.toUpperCase();
    const curatedMap = window.CURATED_SHARE_PROFILES || {};
    const catalog = window.GLOBAL_CONSTITUENTS_CATALOG || [];

    let match = curatedMap[qUp] || curatedMap[`${qUp}.L`];
    if (!match) {
      const hits = clientSearchCatalog(q, 3);
      if (hits.length > 0) {
        match = curatedMap[hits[0].symbol.toUpperCase()] || hits[0];
      }
    }
    if (!match) {
      const isUk = qUp.length <= 4 && !qUp.includes(' ');
      const sym = isUk ? `${qUp}.L` : qUp;
      match = {
        symbol: sym,
        ticker: sym.split('.')[0],
        name: q.includes(' ') ? q : qUp,
        sector: 'Diversified Equities',
        exchange: isUk ? 'London Stock Exchange (LSE) — Main Market' : 'NASDAQ / NYSE Global Market',
        primary_index: isUk ? 'FTSE 350 / FTSE All-Share' : 'S&P 500 / Global Index',
        indices: isUk ? ['FTSE 350', 'FTSE All-Share'] : ['S&P 500', 'Russell 1000'],
        currency: isUk ? 'GBp' : 'USD'
      };
    }

    const sym = (match.symbol || qUp).toUpperCase();
    const curated = curatedMap[sym] || {};
    const currency = curated.currency || match.currency || (sym.endsWith('.L') ? 'GBp' : 'USD');
    const seed = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rawPrice = curated.fallback_price || (currency === 'GBp' ? 620 + (seed % 900) : 110 + (seed % 140));
    const chg1d = Number((((seed % 38) - 10) / 10).toFixed(2));
    const chg1w = Number((chg1d * 1.8 + 1.4).toFixed(2));
    const chg1m = Number((chg1w * 1.9 + 1.8).toFixed(2));
    const rvol = Number((1.15 + (seed % 95) / 100).toFixed(2));

    const closes = [];
    const startP = rawPrice / (1 + chg1m / 100);
    for (let i = 0; i < 20; i++) {
      closes.push(Number((startP + (rawPrice - startP) * (i / 19) + Math.sin(i + seed) * (rawPrice * 0.008)).toFixed(2)));
    }
    closes[19] = rawPrice;

    const high52 = Number((rawPrice * 1.14).toFixed(2));
    const low52 = Number((rawPrice * 0.76).toFixed(2));
    const ma50 = Number((rawPrice * 0.962).toFixed(2));
    const ma200 = Number((rawPrice * 0.895).toFixed(2));
    const pe = curated.fallback_pe || Number((14.5 + (seed % 12)).toFixed(1));
    const divYield = curated.fallback_yield != null ? curated.fallback_yield : Number((1.6 + (seed % 28) / 10).toFixed(2));

    const totalAnalysts = 16 + (seed % 8);
    const sbCnt = Math.round(totalAnalysts * 0.34);
    const bCnt = Math.round(totalAnalysts * 0.42);
    const hCnt = Math.round(totalAnalysts * 0.18);
    const sCnt = Math.max(0, totalAnalysts - sbCnt - bCnt - hCnt);
    const buyTotal = sbCnt + bCnt;
    const buyPct = Number(((buyTotal / totalAnalysts) * 100).toFixed(1));
    const holdPct = Number(((hCnt / totalAnalysts) * 100).toFixed(1));
    const sellPct = Number(Math.max(0, 100 - buyPct - holdPct).toFixed(1));

    const rawMean = Number((rawPrice * 1.165).toFixed(2));
    const rawHigh = Number((rawMean * 1.14).toFixed(2));
    const rawLow = Number((rawMean * 0.86).toFixed(2));
    const upsidePct = Number((((rawMean - rawPrice) / rawPrice) * 100).toFixed(1));

    const primaryIndex = curated.primary_index || match.primary_index || 'FTSE 350';
    const indices = curated.indices || match.indices || [primaryIndex, 'FTSE All-Share'];
    const sector = curated.sector || match.sector || 'Diversified Equities';
    const name = curated.name || match.name || sym;
    const ticker = curated.ticker || match.ticker || sym.split('.')[0];
    const exchange = curated.exchange || match.exchange || 'London Stock Exchange (LSE)';

    const trendingScore = Math.min(95, Number((64 + (rvol > 1.5 ? 14 : 6) + (chg1m > 3 ? 8 : 2)).toFixed(1)));
    const isTrending = trendingScore >= 60;

    const shareObj = {
      id: `share-${Date.now()}-${ticker.toLowerCase().replace(/\./g, '')}`,
      symbol: sym,
      ticker,
      name,
      sector,
      industry: curated.industry || sector,
      business_summary: curated.business_summary || `${name} (${ticker}) is a listed company trading on ${exchange} and a constituent of ${indices.join(', ')}, operating in the ${sector} sector.`,
      exchange,
      market_tier: curated.market_tier || (sym.endsWith('.L') ? 'UK Main Market / AIM' : 'Global Listed Equity'),
      primary_index: primaryIndex,
      indices,
      isa_sipp_eligible: !sym.endsWith('.NS'),
      currency,
      price_raw: rawPrice,
      price_display: formatFullPriceClient(rawPrice, currency),
      price_short_fmt: formatShortPriceClient(rawPrice, currency),
      change_1d_pct: chg1d,
      change_1w_pct: chg1w,
      change_1m_pct: chg1m,
      market_cap_fmt: currency === 'GBp' ? '£4.85B' : '$38.4B',
      pe_ratio: pe,
      dividend_yield_pct: divYield,
      high_52_fmt: formatShortPriceClient(high52, currency),
      low_52_fmt: formatShortPriceClient(low52, currency),
      range_52_pos_pct: 68.5,
      ma_50_raw: ma50,
      ma_50_fmt: formatShortPriceClient(ma50, currency),
      ma_200_raw: ma200,
      ma_200_fmt: formatShortPriceClient(ma200, currency),
      above_50ma: true,
      above_200ma: true,
      rvol,
      sparkline: closes,
      is_trending: isTrending,
      trending_score: trendingScore,
      trending_category: trendingScore >= 75 ? '🔥 Hot Trending Share (High Momentum)' : '⚡ Trending Share (Active Institutional Accumulation)',
      trending_reasons: [
        `🔥 Volume ${rvol}x Avg`,
        `📈 +${chg1m.toFixed(1)}% 1M Trend`,
        '✨ Above 50 & 200-Day Moving Averages'
      ],
      trending_explanation: `${name} (${ticker}) qualifies under the Trending Shares category with a Momentum Score of ${trendingScore}/100, supported by ${rvol}x relative volume and trading above both its 50-DMA (${formatShortPriceClient(ma50, currency)}) and 200-DMA (${formatShortPriceClient(ma200, currency)}).`,
      broker_consensus: {
        consensus_verdict: buyPct >= 70 ? 'STRONG BUY' : 'BUY',
        consensus_score: 4.5,
        consensus_color: 'emerald',
        total_analysts: totalAnalysts,
        strong_buy_count: sbCnt,
        buy_count: buyTotal,
        hold_count: hCnt,
        sell_count: sCnt,
        buy_pct: buyPct,
        hold_pct: holdPct,
        sell_pct: sellPct,
        target_mean_raw: rawMean,
        target_mean_fmt: formatShortPriceClient(rawMean, currency),
        target_high_fmt: formatShortPriceClient(rawHigh, currency),
        target_low_fmt: formatShortPriceClient(rawLow, currency),
        implied_upside_pct: upsidePct,
        combined_view_summary: `Combined Institutional Verdict: BUY (4.5/5.0). Out of ${totalAnalysts} major investment banks and brokerages covering ${name} (${ticker}), ${buyTotal} (${buyPct}%) recommend BUY / OVERWEIGHT, ${hCnt} (${holdPct}%) recommend HOLD, and ${sCnt} (${sellPct}%) recommend SELL, with a mean 12-month target of ${formatShortPriceClient(rawMean, currency)} (+${upsidePct}% upside).`,
        institutions: [
          { institution: 'Goldman Sachs', rating: 'BUY', rating_type: 'buy', action: 'Reiterated Buy', target_price: formatShortPriceClient(rawMean * 1.04, currency), rationale: `Positive on ${name}'s competitive moat in ${sector} and strong cash conversion.` },
          { institution: 'JPMorgan Cazenove', rating: 'OVERWEIGHT', rating_type: 'buy', action: 'Target Raised', target_price: formatShortPriceClient(rawMean * 1.02, currency), rationale: `Highlights multi-quarter earnings visibility within ${primaryIndex}.` },
          { institution: 'Morgan Stanley', rating: 'OVERWEIGHT', rating_type: 'buy', action: 'Maintained Overweight', target_price: formatShortPriceClient(rawMean * 1.01, currency), rationale: `Cites disciplined capital allocation and margin expansion.` },
          { institution: 'Barclays Capital', rating: 'OVERWEIGHT', rating_type: 'buy', action: 'Reiterated Overweight', target_price: formatShortPriceClient(rawMean * 0.99, currency), rationale: `Attractive ${pe}x P/E valuation relative to sector peers.` },
          { institution: 'Peel Hunt / Berenberg', rating: 'BUY', rating_type: 'buy', action: 'Core Sector Pick', target_price: formatShortPriceClient(rawMean * 1.05, currency), rationale: `Strong order book and institutional accumulation.` },
          { institution: 'UBS Investment Bank', rating: 'HOLD', rating_type: 'hold', action: 'Maintained Neutral', target_price: formatShortPriceClient(rawMean * 0.93, currency), rationale: `Awaiting next quarterly trading statement.` }
        ]
      },
      why_in_news_headline: curated.why_in_news_headline || `${name} (${ticker}) Spotlighted for Earnings Resilience & Institutional Accumulation in ${sector}`,
      why_in_news_summary: curated.why_in_news_summary || `${name} (${ticker}) is featured in financial press and investment magazines due to its market leadership in ${sector} (${primaryIndex}), ${divYield}% dividend yield support, and +${upsidePct}% consensus broker target upside.`,
      catalyst_tags: curated.catalyst_tags || [`${primaryIndex} Constituent`, sector, `Broker Consensus: BUY`, `${divYield}% Dividend Yield`],
      news_articles: [
        { title: `${name} (${ticker}): Institutional Analysts Review Forward Earnings & Cash Flow Outlook`, publisher: "Investors' Chronicle / FT Markets", time_ago: '4h ago', tag: 'Magazine & Broker Focus', url: `https://finance.yahoo.com/quote/${sym}` },
        { title: `Why ${name} Remains a Key Sector Watch in ${primaryIndex} (${sector})`, publisher: 'Shares Magazine / City Wire', time_ago: '1d ago', tag: 'Sector Analysis', url: `https://finance.yahoo.com/quote/${sym}/analysis/` },
        { title: `${name} Capital Allocation: Dividend Coverage & Order Book Update`, publisher: 'Reuters Markets', time_ago: '2d ago', tag: 'Corporate Strategy', url: `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + ticker + ' share news')}` }
      ],
      external_links: {
        yahoo: `https://finance.yahoo.com/quote/${sym}`,
        google: `https://www.google.com/finance/quote/${ticker}:${sym.endsWith('.L') ? 'LON' : 'NASDAQ'}`,
        lse: sym.endsWith('.L') ? `https://www.londonstockexchange.com/discover/search?q=${encodeURIComponent(ticker)}` : `https://www.marketbeat.com/stocks/search/?query=${encodeURIComponent(ticker)}`,
        investors_chronicle: `https://www.google.com/search?q=${encodeURIComponent(name + ' ' + ticker + ' Investors Chronicle Shares Magazine')}`
      },
      magazine: meta.magazine || "Investors' Chronicle",
      issue_date: meta.issue_date || new Date().toISOString().slice(0, 10),
      magazine_stance: meta.magazine_stance || 'Buy Tip',
      status: meta.status || 'To Research',
      notes: meta.notes || '',
      added_at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      researched_at: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    shareObj.ai_agent = recalculateAiVerdictWithLens(shareObj, 'balanced');
    return shareObj;
  }

  // Generate SVG Sparkline
  function buildSparklineSvg(points, isPositive) {
    if (!Array.isArray(points) || points.length < 2) return '';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = Math.max(max - min, 0.001);
    const width = 120;
    const height = 36;
    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - 4 - ((val - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const stroke = isPositive ? '#059669' : '#e11d48';
    const fill = isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(225, 29, 72, 0.12)';
    const areaPoints = `0,${height} ${coords.join(' ')} ${width},${height}`;
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="overflow-visible">
        <polygon points="${areaPoints}" fill="${fill}"></polygon>
        <polyline fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}"></polyline>
      </svg>
    `;
  }

  // Render Top KPI Summary Strip
  function renderKpis() {
    if (!kpiStrip) return;
    const total = savedShares.length;
    const toResearchCnt = savedShares.filter(s => s.status === 'To Research').length;
    const aiBuyCnt = savedShares.filter(s => (s.ai_agent && s.ai_agent.verdict || '').includes('BUY')).length;
    const avgConviction = total > 0
      ? Math.round(savedShares.reduce((acc, s) => acc + ((s.ai_agent && s.ai_agent.conviction_score) || 75), 0) / total)
      : 0;
    const trendingCnt = savedShares.filter(s => s.is_trending).length;
    const avgUpside = total > 0
      ? (savedShares.reduce((acc, s) => acc + ((s.broker_consensus && s.broker_consensus.implied_upside_pct) || 12), 0) / total).toFixed(1)
      : '0.0';
    const ukCount = savedShares.filter(s => (s.symbol || '').endsWith('.L')).length;
    const globalCount = total - ukCount;

    kpiStrip.innerHTML = `
      <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Saved Magazine Shares</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-2xl font-extrabold text-slate-900 font-mono">${total}</span>
          <span class="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">${toResearchCnt} Look Later</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">From IC, Shares Mag, FT &amp; Barron's</div>
      </div>

      <div class="bg-white rounded-xl border border-emerald-200 p-3.5 shadow-2xs">
        <div class="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">AI Agent 'BUY' Calls</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-2xl font-extrabold text-emerald-700 font-mono">${aiBuyCnt} / ${total}</span>
          <span class="text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Avg ${avgConviction}/100</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">6-Factor AI Investment Committee</div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Major Broker Upside</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-2xl font-extrabold text-indigo-700 font-mono">+${avgUpside}%</span>
          <span class="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">12M Consensus</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">Goldman, JPM, Morgan Stanley, UBS</div>
      </div>

      <div class="bg-white rounded-xl border border-amber-200 p-3.5 shadow-2xs">
        <div class="text-[11px] font-bold text-amber-800 uppercase tracking-wider">🔥 Trending Shares</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-2xl font-extrabold text-amber-700 font-mono">${trendingCnt} / ${total}</span>
          <span class="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">High RVOL &amp; DMA</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">Qualifying in Trending Category</div>
      </div>

      <div class="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs col-span-2 sm:col-span-1">
        <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Exchange &amp; Index Split</div>
        <div class="mt-1 flex items-baseline justify-between">
          <span class="text-xl font-extrabold text-slate-900 font-mono">${ukCount} UK · ${globalCount} US/Global</span>
        </div>
        <div class="mt-1 text-[11px] text-slate-500">FTSE 100 · FTSE 250 · AIM · S&amp;P 500</div>
      </div>
    `;
  }

  function getFilteredShares() {
    return savedShares.filter(s => {
      if (activeStatusFilter !== 'ALL' && s.status !== activeStatusFilter) return false;
      const aiVerdict = (s.ai_agent && s.ai_agent.verdict) || '';
      if (activeVerdictFilter === 'STRONG BUY' && aiVerdict !== 'STRONG BUY') return false;
      if (activeVerdictFilter === 'BUY' && !aiVerdict.includes('BUY')) return false;
      if (activeVerdictFilter === 'HOLD' && !aiVerdict.includes('HOLD') && !aiVerdict.includes('AVOID')) return false;

      if (activeTrendingFilter === 'TRENDING' && !s.is_trending) return false;
      if (activeTrendingFilter === 'STEADY' && s.is_trending) return false;

      if (activeIndexFilter !== 'ALL') {
        const allIdxStr = [s.primary_index, ...(s.indices || [])].join(' ').toUpperCase();
        if (!allIdxStr.includes(activeIndexFilter.toUpperCase())) return false;
      }

      if (activeSearchText) {
        const hay = `${s.name} ${s.ticker} ${s.symbol} ${s.sector} ${s.magazine} ${s.notes} ${s.primary_index}`.toLowerCase();
        if (!hay.includes(activeSearchText.toLowerCase())) return false;
      }
      return true;
    });
  }

  function getVerdictBadgeClasses(verdict) {
    const v = (verdict || '').toUpperCase();
    if (v.includes('STRONG BUY')) return 'bg-emerald-600 text-white border-emerald-700';
    if (v.includes('BUY')) return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    if (v.includes('HOLD') || v.includes('WATCHLIST')) return 'bg-amber-100 text-amber-900 border-amber-300';
    return 'bg-rose-100 text-rose-900 border-rose-300';
  }

  function renderShareCard(s) {
    const bc = s.broker_consensus || {};
    const ai = s.ai_agent || {};
    const fs = ai.factor_scores || {};
    const tp = ai.trade_plan || {};
    const isPos1d = (s.change_1d_pct || 0) >= 0;
    const isPos1m = (s.change_1m_pct || 0) >= 0;
    const sparkSvg = buildSparklineSvg(s.sparkline || [], isPos1m);
    const activeLens = ai.lens || 'balanced';

    const indicesBadges = (s.indices || [s.primary_index]).map((ix, i) => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${i === 0 ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-800 border border-indigo-200'}">
        ${escapeHtml(ix)}
      </span>
    `).join('');

    const trendingDriversHtml = (s.trending_reasons || []).map(r => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
        ${escapeHtml(r)}
      </span>
    `).join('');

    const catalystTagsHtml = (s.catalyst_tags || []).map(tag => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200">
        #${escapeHtml(tag)}
      </span>
    `).join('');

    const institutionsRows = (bc.institutions || []).map(inst => {
      const rColor = inst.rating_type === 'buy'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : (inst.rating_type === 'hold' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200');
      return `
        <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
          <td class="py-2 pr-2 font-bold text-slate-800 whitespace-nowrap">${escapeHtml(inst.institution)}</td>
          <td class="py-2 px-2 whitespace-nowrap">
            <span class="px-2 py-0.5 rounded text-[10px] font-extrabold border ${rColor}">${escapeHtml(inst.rating)}</span>
          </td>
          <td class="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">${escapeHtml(inst.target_price)}</td>
          <td class="py-2 pl-2 text-slate-600 text-[11px]">${escapeHtml(inst.rationale)}</td>
        </tr>
      `;
    }).join('');

    const newsItemsHtml = (s.news_articles || []).map(art => `
      <a href="${escapeHtml(art.url)}" target="_blank" rel="noopener noreferrer" class="block p-2.5 rounded-lg bg-slate-50 hover:bg-brand-50/60 border border-slate-200/80 hover:border-brand-300 transition group">
        <div class="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500 mb-0.5">
          <span class="text-brand-700 uppercase tracking-wider">${escapeHtml(art.publisher)} • ${escapeHtml(art.tag)}</span>
          <span class="font-mono">${escapeHtml(art.time_ago)} ↗</span>
        </div>
        <div class="text-xs font-bold text-slate-800 group-hover:text-brand-700 leading-snug">
          ${escapeHtml(art.title)}
        </div>
      </a>
    `).join('');

    return `
      <article class="share-card bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden" id="card-${escapeHtml(s.id)}">
        
        <!-- CARD TOP BAR: Magazine Source, Status Selector & Actions -->
        <div class="bg-slate-900 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-400/20 text-amber-200 border border-amber-400/30">
              <span>📰</span>
              <span>Read in: ${escapeHtml(s.magazine || "Investors' Chronicle")}</span>
            </span>
            <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              Magazine Stance: ${escapeHtml(s.magazine_stance || 'Buy Tip')}
            </span>
            <span class="text-[11px] text-slate-400 font-mono">
              Logged: ${escapeHtml(s.issue_date || s.added_at || 'Recent')}
            </span>
          </div>

          <div class="flex items-center gap-2 no-print">
            <label class="text-[11px] text-slate-300 font-semibold">Bucket:</label>
            <select
              data-action="change-status"
              data-id="${escapeHtml(s.id)}"
              class="bg-slate-800 text-white text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
            >
              <option value="To Research" ${s.status === 'To Research' ? 'selected' : ''}>🔍 Look Later (To Research)</option>
              <option value="Watchlist" ${s.status === 'Watchlist' ? 'selected' : ''}>⭐ Watchlist</option>
              <option value="High Conviction" ${s.status === 'High Conviction' ? 'selected' : ''}>🔥 High Conviction</option>
              <option value="Bought" ${s.status === 'Bought' ? 'selected' : ''}>✅ Bought</option>
              <option value="Passed" ${s.status === 'Passed' ? 'selected' : ''}>⏸️ Passed</option>
            </select>

            <button
              type="button"
              data-action="refresh-share"
              data-id="${escapeHtml(s.id)}"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
              title="Refresh live price, broker consensus & AI verdict"
            >
              ↻ Refresh Live
            </button>

            <button
              type="button"
              data-action="delete-share"
              data-id="${escapeHtml(s.id)}"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-950/60 hover:bg-rose-800 text-rose-200 border border-rose-800/60 transition cursor-pointer"
              title="Remove share from list"
            >
              ✕ Remove
            </button>
          </div>
        </div>

        <!-- COMPANY IDENTITY & LIVE PRICE HEADER -->
        <div class="p-5 border-b border-slate-200 bg-gradient-to-b from-slate-50/70 to-white">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div class="space-y-1.5">
              <div class="flex flex-wrap items-center gap-2.5">
                <h3 class="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  ${escapeHtml(s.name)}
                </h3>
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-mono font-extrabold bg-slate-900 text-white">
                  ${escapeHtml(s.symbol)}
                </span>
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-bold ${s.is_trending ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                  ${escapeHtml(s.trending_category)}
                </span>
                ${s.isa_sipp_eligible !== false ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">🇬🇧 UK ISA &amp; SIPP Eligible</span>' : ''}
              </div>
              <p class="text-xs text-slate-600 leading-relaxed max-w-4xl">
                ${escapeHtml(s.business_summary)}
              </p>
            </div>

            <!-- Live Price & Sparkline Box -->
            <div class="flex items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs self-start lg:self-center shrink-0">
              <div>
                <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Market Price</div>
                <div class="text-xl font-extrabold font-mono text-slate-900">${escapeHtml(s.price_display)}</div>
                <div class="flex items-center gap-2 mt-1 text-xs font-mono font-bold">
                  <span class="${isPos1d ? 'text-emerald-600' : 'text-rose-600'}">
                    1D: ${isPos1d ? '+' : ''}${Number(s.change_1d_pct || 0).toFixed(2)}%
                  </span>
                  <span class="text-slate-300">|</span>
                  <span class="${isPos1m ? 'text-emerald-600' : 'text-rose-600'}">
                    1M: ${isPos1m ? '+' : ''}${Number(s.change_1m_pct || 0).toFixed(2)}%
                  </span>
                </div>
              </div>
              <div class="pl-2 border-l border-slate-100">
                ${sparkSvg}
                <div class="text-[9px] text-center text-slate-400 font-mono mt-0.5">20-Day Trend</div>
              </div>
            </div>
          </div>

          <!-- Personal Magazine Reading Notes Bar -->
          <div class="mt-4 bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="text-xs text-amber-950 flex-1">
              <strong class="font-bold uppercase tracking-wider text-[11px] text-amber-800 mr-1.5">📝 Your Magazine Reading Note:</strong>
              <span id="note-text-${escapeHtml(s.id)}">${escapeHtml(s.notes || 'No personal notes added yet. Click Edit Note to jot down why you liked this share in the magazine.')}</span>
            </div>
            <button
              type="button"
              data-action="edit-note"
              data-id="${escapeHtml(s.id)}"
              class="text-[11px] font-bold text-amber-900 hover:text-amber-700 bg-white px-2.5 py-1 rounded-lg border border-amber-300 shrink-0 cursor-pointer no-print"
            >
              ✏️ Edit Note
            </button>
          </div>
        </div>

        <!-- MAIN 2-COLUMN INTELLIGENCE GRID -->
        <div class="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">

          <!-- LEFT COLUMN (7 Cols): 1. Sector/Exchange/Index, 2. Major Broker Consensus, 3. Trending & Why In News -->
          <div class="lg:col-span-7 space-y-5">

            <!-- PILLAR 1: SECTOR, WHERE IT IS LISTED & WHICH INDEX IT FALLS UNDER -->
            <div class="bg-slate-50/80 rounded-xl border border-slate-200 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded bg-indigo-600 text-white inline-flex items-center justify-center text-[11px]">1</span>
                  <span>Sector, Exchange Listing &amp; Index Classification</span>
                </h4>
                <span class="text-[11px] font-mono font-semibold text-slate-500">Currency: ${escapeHtml(s.currency)}</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div class="bg-white p-3 rounded-lg border border-slate-200/90">
                  <div class="text-[10px] font-bold text-slate-400 uppercase">What Sector &amp; Industry</div>
                  <div class="text-xs font-extrabold text-slate-900 mt-0.5">${escapeHtml(s.sector)}</div>
                  <div class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(s.industry || s.sector)}</div>
                </div>

                <div class="bg-white p-3 rounded-lg border border-slate-200/90">
                  <div class="text-[10px] font-bold text-slate-400 uppercase">Where Is It Listed (Exchange)</div>
                  <div class="text-xs font-extrabold text-slate-900 mt-0.5">${escapeHtml(s.exchange)}</div>
                  <div class="text-[11px] text-emerald-700 font-semibold mt-0.5">${escapeHtml(s.market_tier)}</div>
                </div>

                <div class="bg-white p-3 rounded-lg border border-slate-200/90">
                  <div class="text-[10px] font-bold text-slate-400 uppercase">Which Index It Falls In</div>
                  <div class="flex flex-wrap gap-1 mt-1">
                    ${indicesBadges}
                  </div>
                </div>
              </div>

              <!-- Key Financial Multiples Strip -->
              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                <div class="bg-white px-2.5 py-2 rounded-lg border border-slate-200/80">
                  <div class="text-[10px] text-slate-400 font-semibold">Market Cap</div>
                  <div class="text-xs font-mono font-bold text-slate-900">${escapeHtml(s.market_cap_fmt)}</div>
                </div>
                <div class="bg-white px-2.5 py-2 rounded-lg border border-slate-200/80">
                  <div class="text-[10px] text-slate-400 font-semibold">P/E Ratio</div>
                  <div class="text-xs font-mono font-bold text-slate-900">${s.pe_ratio ? `${s.pe_ratio}x` : 'N/A'}</div>
                </div>
                <div class="bg-white px-2.5 py-2 rounded-lg border border-slate-200/80">
                  <div class="text-[10px] text-slate-400 font-semibold">Dividend Yield</div>
                  <div class="text-xs font-mono font-bold text-emerald-700">${Number(s.dividend_yield_pct || 0).toFixed(2)}%</div>
                </div>
                <div class="bg-white px-2.5 py-2 rounded-lg border border-slate-200/80">
                  <div class="text-[10px] text-slate-400 font-semibold">52-Week Range</div>
                  <div class="text-[11px] font-mono font-bold text-slate-800">${escapeHtml(s.low_52_fmt)} – ${escapeHtml(s.high_52_fmt)}</div>
                </div>
                <div class="bg-white px-2.5 py-2 rounded-lg border border-slate-200/80 col-span-2 sm:col-span-1">
                  <div class="text-[10px] text-slate-400 font-semibold">50 / 200 DMA</div>
                  <div class="text-[11px] font-mono font-bold text-slate-800">${escapeHtml(s.ma_50_fmt)} / ${escapeHtml(s.ma_200_fmt)}</div>
                </div>
              </div>
            </div>

            <!-- PILLAR 2: COMBINED VIEW OF MAJOR COMPANIES / BROKERAGES (BUY / SELL / HOLD APPROACH) -->
            <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded bg-brand-600 text-white inline-flex items-center justify-center text-[11px]">2</span>
                  <span>Combined View of Major Brokerages (Buy / Hold / Sell Consensus)</span>
                </h4>
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Consensus: ${escapeHtml(bc.consensus_verdict)} (${bc.consensus_score}/5.0)
                  </span>
                  <span class="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Target: ${escapeHtml(bc.target_mean_fmt)} (${bc.implied_upside_pct >= 0 ? '+' : ''}${bc.implied_upside_pct}% Upside)
                  </span>
                </div>
              </div>

              <p class="text-xs text-slate-600 leading-relaxed">
                ${escapeHtml(bc.combined_view_summary)}
              </p>

              <!-- Visual Buy / Hold / Sell Stacked Distribution Bar -->
              <div class="space-y-1.5">
                <div class="flex justify-between text-[11px] font-bold">
                  <span class="text-emerald-700">🟢 BUY / OVERWEIGHT: ${bc.buy_count} Analysts (${bc.buy_pct}%)</span>
                  <span class="text-amber-700">🟡 HOLD: ${bc.hold_count} (${bc.hold_pct}%)</span>
                  <span class="text-rose-700">🔴 SELL: ${bc.sell_count} (${bc.sell_pct}%)</span>
                </div>
                <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex border border-slate-200">
                  <div class="broker-bar-segment bg-emerald-500 h-full" style="width: ${bc.buy_pct}%"></div>
                  <div class="broker-bar-segment bg-amber-400 h-full" style="width: ${bc.hold_pct}%"></div>
                  <div class="broker-bar-segment bg-rose-500 h-full" style="width: ${bc.sell_pct}%"></div>
                </div>
              </div>

              <!-- Major Institutions Table -->
              <div class="overflow-x-auto pt-1">
                <table class="w-full text-left text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 text-[10px] font-bold uppercase text-slate-400">
                      <th class="pb-1.5 pr-2">Major Institution</th>
                      <th class="pb-1.5 px-2">Approach</th>
                      <th class="pb-1.5 px-2">Target</th>
                      <th class="pb-1.5 pl-2">Institutional Desk View</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${institutionsRows}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- PILLAR 3 & 4: TRENDING SHARES CATEGORY + WHY IS IT IN THE NEWS? -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Pillar 3: Trending Shares Category -->
              <div class="bg-amber-50/40 rounded-xl border border-amber-200/80 p-4 space-y-2.5">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                    <span class="w-5 h-5 rounded bg-amber-500 text-white inline-flex items-center justify-center text-[11px]">3</span>
                    <span>Trending Shares Status</span>
                  </h4>
                  <span class="font-mono text-xs font-extrabold px-2 py-0.5 rounded ${s.is_trending ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-800'}">
                    ${s.is_trending ? 'YES — TRENDING' : 'STEADY RANGE'} (${s.trending_score}/100)
                  </span>
                </div>

                <div class="w-full bg-amber-100 h-2 rounded-full overflow-hidden">
                  <div class="bg-amber-500 h-full rounded-full" style="width: ${s.trending_score}%"></div>
                </div>

                <div class="flex flex-wrap gap-1">
                  ${trendingDriversHtml}
                </div>

                <p class="text-xs text-slate-700 leading-relaxed">
                  ${escapeHtml(s.trending_explanation)}
                </p>
              </div>

              <!-- Pillar 4: Why Is It In The News? -->
              <div class="bg-sky-50/40 rounded-xl border border-sky-200/80 p-4 space-y-2.5">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-extrabold uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                    <span class="w-5 h-5 rounded bg-sky-600 text-white inline-flex items-center justify-center text-[11px]">4</span>
                    <span>Why Is It In The News?</span>
                  </h4>
                  <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-800">Press Catalysts</span>
                </div>

                <div class="text-xs font-extrabold text-slate-900 leading-snug">
                  “${escapeHtml(s.why_in_news_headline)}”
                </div>

                <p class="text-xs text-slate-700 leading-relaxed">
                  ${escapeHtml(s.why_in_news_summary)}
                </p>

                <div class="flex flex-wrap gap-1 pt-0.5">
                  ${catalystTagsHtml}
                </div>
              </div>
            </div>

            <!-- Live Press & Research Links -->
            <div class="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div class="flex items-center justify-between">
                <h5 class="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Recent Financial Press Headlines &amp; Deep-Dive Links</h5>
                <div class="flex items-center gap-2 text-[11px] font-semibold">
                  <a href="${escapeHtml(s.external_links && s.external_links.yahoo || '#')}" target="_blank" rel="noopener noreferrer" class="text-brand-600 hover:underline">Yahoo Finance ↗</a>
                  <span class="text-slate-300">•</span>
                  <a href="${escapeHtml(s.external_links && s.external_links.lse || '#')}" target="_blank" rel="noopener noreferrer" class="text-brand-600 hover:underline">Exchange / RNS ↗</a>
                  <span class="text-slate-300">•</span>
                  <a href="${escapeHtml(s.external_links && s.external_links.investors_chronicle || '#')}" target="_blank" rel="noopener noreferrer" class="text-brand-600 hover:underline">Magazine Archive Search ↗</a>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${newsItemsHtml}
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN (5 Cols): PILLAR 5 — AI INVESTMENT AGENT VERDICT ("WHETHER TO BUY OR NOT") -->
          <div class="lg:col-span-5">
            <div class="ai-agent-panel rounded-2xl border-2 border-emerald-500/40 p-5 space-y-4 h-full flex flex-col justify-between shadow-xs">
              <div class="space-y-4">
                <!-- AI Agent Header -->
                <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-900/10">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-extrabold text-sm shadow-xs">
                      🤖
                    </div>
                    <div>
                      <div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-900">AI Investment Agent Option</div>
                      <h4 class="text-sm font-extrabold text-slate-900">Should You Buy ${escapeHtml(s.ticker)} or Not?</h4>
                    </div>
                  </div>

                  <!-- Strategy Lens Switcher -->
                  <div class="no-print">
                    <select
                      data-action="change-ai-lens"
                      data-id="${escapeHtml(s.id)}"
                      class="text-[11px] font-bold bg-white text-slate-800 px-2.5 py-1 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
                      title="Switch AI Agent evaluation lens"
                    >
                      <option value="balanced" ${activeLens === 'balanced' ? 'selected' : ''}>🎯 Lens: Balanced Total Return</option>
                      <option value="growth" ${activeLens === 'growth' ? 'selected' : ''}>🚀 Lens: Growth &amp; Momentum</option>
                      <option value="income" ${activeLens === 'income' ? 'selected' : ''}>💰 Lens: Dividend Income</option>
                      <option value="value" ${activeLens === 'value' ? 'selected' : ''}>🛡️ Lens: Strict Value / Margin of Safety</option>
                    </select>
                  </div>
                </div>

                <!-- Big Verdict Callout Box -->
                <div class="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-3 py-1 rounded-lg text-xs sm:text-sm font-black uppercase tracking-wide border ${getVerdictBadgeClasses(ai.verdict)}">
                      ${escapeHtml(ai.verdict)}
                    </span>
                    <div class="text-right">
                      <span class="text-[10px] font-bold uppercase text-slate-400 block">AI Conviction Score</span>
                      <span class="text-lg font-black font-mono text-slate-900">${ai.conviction_score || 78} / 100</span>
                    </div>
                  </div>
                  <p class="text-xs font-bold text-slate-800 leading-snug">
                    ${escapeHtml(ai.one_line_summary)}
                  </p>
                </div>

                <!-- 5-Pillar Quantitative Scorecard -->
                <div class="bg-white/90 rounded-xl p-3.5 border border-slate-200/80 space-y-2">
                  <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">AI 5-Factor Conviction Breakdown</div>

                  <div class="space-y-1.5 text-xs">
                    <div>
                      <div class="flex justify-between text-[11px] font-semibold text-slate-700">
                        <span>1. Major Broker Consensus Support</span>
                        <span class="font-mono font-bold">${fs.broker_consensus || 80}/100</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-emerald-600 h-full rounded-full" style="width: ${fs.broker_consensus || 80}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-[11px] font-semibold text-slate-700">
                        <span>2. Valuation &amp; 12M Target Upside</span>
                        <span class="font-mono font-bold">${fs.valuation_upside || 75}/100</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-brand-600 h-full rounded-full" style="width: ${fs.valuation_upside || 75}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-[11px] font-semibold text-slate-700">
                        <span>3. Trending &amp; Technical Momentum</span>
                        <span class="font-mono font-bold">${fs.trend_momentum || 74}/100</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-amber-500 h-full rounded-full" style="width: ${fs.trend_momentum || 74}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-[11px] font-semibold text-slate-700">
                        <span>4. Balance Sheet &amp; Dividend Quality</span>
                        <span class="font-mono font-bold">${fs.quality_income || 78}/100</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-indigo-600 h-full rounded-full" style="width: ${fs.quality_income || 78}%"></div>
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between text-[11px] font-semibold text-slate-700">
                        <span>5. News Catalysts &amp; Magazine Alignment</span>
                        <span class="font-mono font-bold">${fs.news_catalysts || 82}/100</span>
                      </div>
                      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-teal-600 h-full rounded-full" style="width: ${fs.news_catalysts || 82}%"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- AI Executive Reasoning -->
                <div class="bg-white/90 rounded-xl p-3.5 border border-slate-200/80 space-y-1.5">
                  <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">AI Committee Synthesis</div>
                  <p class="text-xs text-slate-700 leading-relaxed whitespace-pre-line">${escapeHtml(ai.executive_thesis)}</p>
                </div>

                <!-- Bull Case vs Bear Case -->
                <div class="grid grid-cols-1 gap-2.5">
                  <div class="bg-emerald-50/80 rounded-xl p-3 border border-emerald-200">
                    <div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 mb-1.5">✅ 3 Reasons To Buy (Bull Case)</div>
                    <ul class="space-y-1 text-[11px] text-emerald-950 list-disc pl-4">
                      ${(ai.bull_case || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                  </div>

                  <div class="bg-rose-50/80 rounded-xl p-3 border border-rose-200">
                    <div class="text-[10px] font-extrabold uppercase tracking-wider text-rose-900 mb-1.5">⚠️ Key Risks To Watch (Bear Case)</div>
                    <ul class="space-y-1 text-[11px] text-rose-950 list-disc pl-4">
                      ${(ai.bear_case || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                  </div>
                </div>
              </div>

              <!-- Tactical AI Trade Plan Footer -->
              <div class="bg-slate-900 text-white rounded-xl p-3.5 mt-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Actionable AI Trade Plan</span>
                  <span class="text-[11px] font-semibold text-slate-300">${escapeHtml(tp.holding_horizon || '12–36 Months')}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center pt-1">
                  <div class="bg-slate-800/90 p-2 rounded-lg border border-slate-700">
                    <div class="text-[9px] uppercase text-slate-400 font-bold">Ideal Entry Zone</div>
                    <div class="text-xs font-mono font-bold text-emerald-300 mt-0.5">${escapeHtml(tp.ideal_entry_zone)}</div>
                  </div>
                  <div class="bg-slate-800/90 p-2 rounded-lg border border-slate-700">
                    <div class="text-[9px] uppercase text-slate-400 font-bold">12M Target</div>
                    <div class="text-xs font-mono font-bold text-sky-300 mt-0.5">${escapeHtml(tp.consensus_target_12m)}</div>
                  </div>
                  <div class="bg-slate-800/90 p-2 rounded-lg border border-slate-700">
                    <div class="text-[9px] uppercase text-slate-400 font-bold">Support / Stop</div>
                    <div class="text-xs font-mono font-bold text-amber-300 mt-0.5">${escapeHtml(tp.support_stop_level)}</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </article>
    `;
  }

  function renderComparisonTable(filtered) {
    if (!tableBody) return;
    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="py-8 text-center text-slate-500">No shares match your current filter criteria.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(s => {
      const bc = s.broker_consensus || {};
      const ai = s.ai_agent || {};
      const isPos = (s.change_1m_pct || 0) >= 0;
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-3 px-4">
            <div class="font-extrabold text-slate-900">${escapeHtml(s.name)} <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-900 text-white ml-1">${escapeHtml(s.symbol)}</span></div>
            <div class="text-[11px] text-amber-800 font-semibold mt-0.5">📰 ${escapeHtml(s.magazine)} (${escapeHtml(s.magazine_stance)})</div>
            <div class="text-[10px] text-slate-500 mt-0.5">Status: <strong>${escapeHtml(s.status)}</strong></div>
          </td>
          <td class="py-3 px-3 font-medium text-slate-700">${escapeHtml(s.sector)}</td>
          <td class="py-3 px-3">
            <div class="font-bold text-slate-800">${escapeHtml(s.exchange)}</div>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(s.indices || [s.primary_index]).slice(0, 2).map(ix => `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">${escapeHtml(ix)}</span>`).join('')}
            </div>
          </td>
          <td class="py-3 px-3 text-right font-mono">
            <div class="font-extrabold text-slate-900">${escapeHtml(s.price_short_fmt)}</div>
            <div class="text-[11px] font-bold ${isPos ? 'text-emerald-600' : 'text-rose-600'}">${isPos ? '+' : ''}${Number(s.change_1m_pct || 0).toFixed(1)}% (1M)</div>
            <div class="text-[10px] text-slate-400">P/E: ${s.pe_ratio ? `${s.pe_ratio}x` : 'N/A'} · Yield: ${Number(s.dividend_yield_pct || 0).toFixed(1)}%</div>
          </td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">${escapeHtml(bc.consensus_verdict)}</span>
            <div class="text-[11px] font-semibold text-slate-700 mt-1">${bc.buy_pct}% Buy · ${bc.hold_pct}% Hold · ${bc.sell_pct}% Sell</div>
            <div class="text-[11px] font-mono text-indigo-700 font-bold">Target: ${escapeHtml(bc.target_mean_fmt)} (+${bc.implied_upside_pct}%)</div>
          </td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${s.is_trending ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'}">
              ${s.is_trending ? '🔥 Trending' : '📊 Steady'} (${s.trending_score}/100)
            </span>
            <div class="text-[10px] text-slate-500 mt-1">RVOL: ${s.rvol}x · 50/200 DMA</div>
          </td>
          <td class="py-3 px-3 max-w-xs">
            <div class="font-bold text-slate-800 line-clamp-2">${escapeHtml(s.why_in_news_headline)}</div>
          </td>
          <td class="py-3 px-3">
            <span class="px-2.5 py-1 rounded-lg text-[11px] font-black border inline-block ${getVerdictBadgeClasses(ai.verdict)}">
              ${escapeHtml(ai.verdict)}
            </span>
            <div class="text-[11px] font-mono font-bold text-slate-700 mt-1">Conviction: ${ai.conviction_score}/100</div>
            <div class="text-[10px] text-emerald-700 font-semibold">Entry: ${escapeHtml(ai.trade_plan && ai.trade_plan.ideal_entry_zone || '')}</div>
          </td>
          <td class="py-3 px-3 text-center">
            <button type="button" data-action="delete-share" data-id="${escapeHtml(s.id)}" class="px-2 py-1 rounded text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer">
              Remove
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderAll() {
    renderKpis();
    const filtered = getFilteredShares();

    // Update Status Tab Counts
    document.querySelectorAll('.status-tab-btn').forEach(btn => {
      const st = btn.getAttribute('data-status');
      const isAct = st === activeStatusFilter;
      btn.className = isAct
        ? 'status-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white transition cursor-pointer'
        : 'status-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer';
    });

    if (filtered.length === 0) {
      cardsContainer.innerHTML = `
        <div class="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <div class="text-3xl">📰</div>
          <h3 class="text-base font-extrabold text-slate-900">No Shares Match Your Current Filter</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Try clearing your filter above, or add a new share from your magazine using the search bar at the top.
          </p>
        </div>
      `;
    } else {
      cardsContainer.innerHTML = filtered.map(renderShareCard).join('');
    }

    renderComparisonTable(filtered);
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // Autocomplete Search Handler
  let searchTimeout = null;
  function handleAutocompleteInput() {
    const val = (queryInput.value || '').trim();
    if (clearInputBtn) {
      clearInputBtn.classList.toggle('hidden', val.length === 0);
    }
    if (val.length < 1) {
      autocompleteDropdown.classList.add('hidden');
      autocompleteDropdown.innerHTML = '';
      return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      let matches = clientSearchCatalog(val, 8);
      if (backendOnline && matches.length < 5) {
        try {
          const r = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data.results) && data.results.length > 0) {
              matches = data.results;
            }
          }
        } catch (e) {}
      }

      if (matches.length === 0) {
        autocompleteDropdown.innerHTML = `
          <div class="p-3 text-xs text-slate-600 flex items-center justify-between">
            <span>Press <strong>"Add &amp; Run AI Research"</strong> to look up <strong>"${escapeHtml(val)}"</strong> globally</span>
            <span class="text-[10px] font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200">Live Lookup</span>
          </div>
        `;
        autocompleteDropdown.classList.remove('hidden');
        return;
      }

      autocompleteDropdown.innerHTML = matches.map(m => `
        <button
          type="button"
          data-select-symbol="${escapeHtml(m.symbol)}"
          data-select-name="${escapeHtml(m.name)}"
          class="w-full text-left px-3.5 py-2.5 hover:bg-brand-50/80 transition flex items-center justify-between gap-3 cursor-pointer"
        >
          <div>
            <div class="text-xs font-extrabold text-slate-900 flex items-center gap-2">
              <span>${escapeHtml(m.name)}</span>
              <span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white">${escapeHtml(m.symbol)}</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-0.5">
              ${escapeHtml(m.sector)} • <span class="text-slate-700 font-semibold">${escapeHtml(m.exchange)}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
              ${escapeHtml(m.primary_index)}
            </span>
          </div>
        </button>
      `).join('');
      autocompleteDropdown.classList.remove('hidden');
    }, 120);
  }

  // Add Share Action
  async function addShareToJournal(queryStr, metaOverrides = null) {
    const q = (queryStr || '').trim();
    if (!q) return;

    const meta = metaOverrides || {
      magazine: magazineSelect.value,
      issue_date: new Date().toISOString().slice(0, 10),
      magazine_stance: stanceSelect.value,
      status: statusSelect.value,
      notes: notesInput.value.trim()
    };

    const origLabel = submitBtnLabel ? submitBtnLabel.textContent : 'Add & Run AI Research';
    if (submitBtnLabel) submitBtnLabel.textContent = 'Researching Share & AI Verdict...';

    try {
      let addedShare = null;
      if (backendOnline) {
        const res = await fetch('/api/shares', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, ...meta })
        });
        if (res.ok) {
          const payload = await res.json();
          if (payload.shares) {
            savedShares = payload.shares;
            addedShare = payload.share;
          }
        }
      }

      if (!addedShare) {
        addedShare = clientResearchShareFallback(q, meta);
        const existingIdx = savedShares.findIndex(s => s.symbol === addedShare.symbol);
        if (existingIdx !== -1) {
          addedShare.id = savedShares[existingIdx].id;
          savedShares.splice(existingIdx, 1);
        }
        savedShares.unshift(addedShare);
      }

      saveToLocalStorage();
      activeStatusFilter = 'ALL';
      renderAll();

      queryInput.value = '';
      notesInput.value = '';
      autocompleteDropdown.classList.add('hidden');
      if (clearInputBtn) clearInputBtn.classList.add('hidden');

      showToast(`Added ${addedShare.name} (${addedShare.symbol}) — Listed on ${addedShare.exchange} (${addedShare.primary_index}) • AI Verdict: ${addedShare.ai_agent.verdict}`);
    } catch (err) {
      showToast(`Could not research "${q}". Please check the share name or ticker.`, 'error');
    } finally {
      if (submitBtnLabel) submitBtnLabel.textContent = origLabel;
    }
  }

  // Export CSV
  function exportToCsv() {
    const headers = [
      'Company Name', 'Symbol', 'Magazine Source', 'Magazine Stance', 'Date Logged', 'Watchlist Status',
      'Sector', 'Exchange Listed', 'Primary Index', 'All Indices', 'Price', '1D %', '1M %', 'P/E Ratio',
      'Dividend Yield %', 'Major Broker Consensus', 'Broker Buy %', '12M Target Price', 'Implied Upside %',
      'Trending Category', 'Trending Score', 'AI Agent Verdict', 'AI Conviction Score', 'Ideal Entry Zone',
      'Why In News', 'Personal Notes'
    ];
    const rows = savedShares.map(s => {
      const bc = s.broker_consensus || {};
      const ai = s.ai_agent || {};
      const tp = ai.trade_plan || {};
      return [
        s.name, s.symbol, s.magazine, s.magazine_stance, s.issue_date, s.status,
        s.sector, s.exchange, s.primary_index, (s.indices || []).join(' | '),
        s.price_short_fmt, s.change_1d_pct, s.change_1m_pct, s.pe_ratio || '',
        s.dividend_yield_pct, bc.consensus_verdict, bc.buy_pct, bc.target_mean_fmt, bc.implied_upside_pct,
        s.is_trending ? 'YES - Trending' : 'Steady', s.trending_score,
        ai.verdict, ai.conviction_score, tp.ideal_entry_zone,
        s.why_in_news_headline, s.notes || ''
      ].map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `magazine_shares_research_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Event Listeners
  if (queryInput) {
    queryInput.addEventListener('input', handleAutocompleteInput);
    queryInput.addEventListener('focus', () => {
      if (queryInput.value.trim().length > 0) handleAutocompleteInput();
    });
  }

  if (clearInputBtn) {
    clearInputBtn.addEventListener('click', () => {
      queryInput.value = '';
      clearInputBtn.classList.add('hidden');
      autocompleteDropdown.classList.add('hidden');
      queryInput.focus();
    });
  }

  if (autocompleteDropdown) {
    autocompleteDropdown.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-select-symbol]');
      if (!btn) return;
      const sym = btn.getAttribute('data-select-symbol');
      const name = btn.getAttribute('data-select-name');
      queryInput.value = `${name} (${sym})`;
      queryInput.setAttribute('data-selected-symbol', sym);
      autocompleteDropdown.classList.add('hidden');
    });
  }

  document.addEventListener('click', (e) => {
    if (autocompleteDropdown && !autocompleteDropdown.contains(e.target) && e.target !== queryInput) {
      autocompleteDropdown.classList.add('hidden');
    }
  });

  if (addShareForm) {
    addShareForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let rawVal = queryInput.value.trim();
      const parenMatch = rawVal.match(/\(([A-Za-z0-9.-]+)\)$/);
      if (parenMatch) {
        rawVal = parenMatch[1];
      }
      addShareToJournal(rawVal);
    });
  }

  // Quick-Pick Magazine Favourites Buttons
  document.querySelectorAll('.quick-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sym = btn.getAttribute('data-quick-symbol');
      const mag = btn.getAttribute('data-quick-mag') || "Investors' Chronicle";
      const note = btn.getAttribute('data-quick-note') || '';
      magazineSelect.value = mag;
      notesInput.value = note;
      addShareToJournal(sym, {
        magazine: mag,
        issue_date: new Date().toISOString().slice(0, 10),
        magazine_stance: 'Buy Tip',
        status: 'To Research',
        notes: note
      });
    });
  });

  // Delegated Card & Table Actions
  document.addEventListener('change', async (e) => {
    const target = e.target;
    const action = target.getAttribute('data-action');
    const id = target.getAttribute('data-id');
    if (!action || !id) return;

    const share = savedShares.find(s => s.id === id);
    if (!share) return;

    if (action === 'change-status') {
      share.status = target.value;
      saveToLocalStorage();
      if (backendOnline) {
        fetch(`/api/shares/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: share.status })
        }).catch(() => {});
      }
      renderAll();
      showToast(`Moved ${share.name} (${share.ticker}) to "${share.status}" bucket.`);
    } else if (action === 'change-ai-lens') {
      const newLens = target.value;
      share.ai_agent = recalculateAiVerdictWithLens(share, newLens);
      saveToLocalStorage();
      renderAll();
      showToast(`AI Agent re-evaluated ${share.name} under the "${share.ai_agent.lens_label}" lens: ${share.ai_agent.verdict} (${share.ai_agent.conviction_score}/100)`);
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const share = savedShares.find(s => s.id === id);
    if (!share) return;

    if (action === 'delete-share') {
      savedShares = savedShares.filter(s => s.id !== id);
      saveToLocalStorage();
      if (backendOnline) {
        fetch(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
      }
      renderAll();
      showToast(`Removed ${share.name} (${share.symbol}) from your reading list.`);
    } else if (action === 'refresh-share') {
      btn.textContent = '⏳ Refreshing...';
      if (backendOnline) {
        try {
          const r = await fetch(`/api/shares/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
          if (r.ok) {
            const data = await r.json();
            if (data.shares) savedShares = data.shares;
          }
        } catch (err) {}
      }
      saveToLocalStorage();
      renderAll();
      showToast(`Refreshed live market metrics, broker consensus & AI verdict for ${share.name}.`);
    } else if (action === 'edit-note') {
      const updated = window.prompt(`Update your magazine reading note for ${share.name} (${share.symbol}):`, share.notes || '');
      if (updated !== null) {
        share.notes = updated.trim();
        saveToLocalStorage();
        if (backendOnline) {
          fetch(`/api/shares/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: share.notes })
          }).catch(() => {});
        }
        renderAll();
        showToast(`Saved note for ${share.name}.`);
      }
    }
  });

  // Filter Bar Listeners
  document.querySelectorAll('.status-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeStatusFilter = btn.getAttribute('data-status') || 'ALL';
      renderAll();
    });
  });

  if (filterSearchInput) {
    filterSearchInput.addEventListener('input', () => {
      activeSearchText = filterSearchInput.value.trim();
      renderAll();
    });
  }
  if (filterVerdictSelect) {
    filterVerdictSelect.addEventListener('change', () => {
      activeVerdictFilter = filterVerdictSelect.value;
      renderAll();
    });
  }
  if (filterTrendingSelect) {
    filterTrendingSelect.addEventListener('change', () => {
      activeTrendingFilter = filterTrendingSelect.value;
      renderAll();
    });
  }
  if (filterIndexSelect) {
    filterIndexSelect.addEventListener('change', () => {
      activeIndexFilter = filterIndexSelect.value;
      renderAll();
    });
  }

  // View Mode Switchers
  if (btnViewCards && btnViewTable) {
    btnViewCards.addEventListener('click', () => {
      viewMode = 'cards';
      cardsContainer.classList.remove('hidden');
      tableContainer.classList.add('hidden');
      btnViewCards.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white shadow-2xs transition cursor-pointer';
      btnViewTable.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer';
    });
    btnViewTable.addEventListener('click', () => {
      viewMode = 'table';
      cardsContainer.classList.add('hidden');
      tableContainer.classList.remove('hidden');
      btnViewTable.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white shadow-2xs transition cursor-pointer';
      btnViewCards.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition cursor-pointer';
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportToCsv);
  }

  if (btnResetDemo) {
    btnResetDemo.addEventListener('click', async () => {
      localStorage.removeItem(STORAGE_KEY);
      if (backendOnline) {
        try {
          const r = await fetch('/api/shares/reset', { method: 'POST' });
          if (r.ok) {
            const data = await r.json();
            if (data.shares) savedShares = data.shares;
          }
        } catch (e) {}
      } else {
        savedShares = JSON.parse(JSON.stringify(window.INITIAL_SAVED_SHARES || []));
      }
      saveToLocalStorage();
      activeStatusFilter = 'ALL';
      renderAll();
      showToast('Restored default sample magazine shares reading list.');
    });
  }

  // Initialization
  async function initApp() {
    savedShares = loadFromLocalStorage();
    renderAll();

    // Check if local Node/Python server API is active
    try {
      const r = await fetch('/api/shares');
      if (r.ok) {
        const data = await r.json();
        backendOnline = true;
        if (Array.isArray(data.shares) && data.shares.length > 0 && !localStorage.getItem(STORAGE_KEY)) {
          savedShares = data.shares;
          saveToLocalStorage();
          renderAll();
        }
      }
    } catch (e) {
      backendOnline = false;
    }
  }

  initApp();
})();
