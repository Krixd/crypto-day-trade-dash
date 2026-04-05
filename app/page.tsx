'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Star, Bell, BellOff, Plus, Trash2, Moon, Sun, ExternalLink, RotateCcw, Search, X, RefreshCw } from 'lucide-react';

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h: number | null;
  total_volume: number;
  market_cap: number;
  isBybitOnly?: boolean;
}

interface NewsItem {
  title: string;
  url: string;
  source: string;
  date: number; // timestamp in ms
}

// Yellow BYBIT box (hyperlinked) - exactly like in your screenshot
const BybitLink = ({ symbol }: { symbol: string }) => (
  <a
    href={`https://www.bybit.com/trade/usdt/${symbol.toUpperCase()}USDT`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#f7a600] hover:bg-[#e69500] text-black text-[10px] font-bold tracking-tighter transition-colors ml-1.5"
    onClick={(e) => e.stopPropagation()}
  >
    BYBIT
  </a>
);

function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? (JSON.parse(saved) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return { value, setValue };
}

export default function CryptoDayTradeDash() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<string>('bitcoin');
  const [activeScanner, setActiveScanner] = useState<'gainers' | 'losers' | 'volume' | 'relative' | 'micro' | 'large' | 'trending' | 'momentum'>('gainers');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { value: watchlist, setValue: setWatchlist } = useLocalStorage<string[]>('cryptoWatchlist', ['bitcoin', 'ethereum', 'solana']);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { value: showMACD, setValue: setShowMACD } = useLocalStorage<boolean>('dashShowMACD', true);
  const { value: leftWidth, setValue: setLeftWidth } = useLocalStorage<number>('dashLeftWidth', 340);
  const { value: rightWidth, setValue: setRightWidth } = useLocalStorage<number>('dashRightWidth', 380);
  const { value: scannerHeight, setValue: setScannerHeight } = useLocalStorage<number>('dashScannerHeight', 520);
  const { value: watchlistHeight, setValue: setWatchlistHeight } = useLocalStorage<number>('dashWatchlistHeight', 340);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframes, setTimeframes] = useState<string[]>(['1', '5', '15', '60']);
  const [totalBybitPairs, setTotalBybitPairs] = useState(0);
  const fetchWithRetry = async (url: string, retries = 5, baseDelay = 1200) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.retCode !== undefined && data.retCode !== 0) throw new Error(data.retMsg || 'API error');
        return data;
      } catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
      }
    }
  };
  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setError(null);
      let cursor: string | null = null;
      let allInstruments: any[] = [];
      do {
        const url = `https://api.bybit.com/v5/market/instruments-info?category=linear&limit=500${cursor ? `&cursor=${cursor}` : ''}`;
        const instrumentsRes = await fetchWithRetry(url);
        const list = instrumentsRes.result?.list || [];
        allInstruments = [...allInstruments, ...list];
        cursor = instrumentsRes.result?.nextPageCursor || null;
      } while (cursor);
      const perpList = allInstruments.filter((i: any) =>
        i.contractType === 'LinearPerpetual' && i.symbol.endsWith('USDT')
      );
      const symbols = perpList.map((i: any) => i.symbol.replace('USDT', '').toUpperCase());
      setTotalBybitPairs(symbols.length);
      const tickersRes = await fetchWithRetry('https://api.bybit.com/v5/market/tickers?category=linear');
      const tickersList = tickersRes.result?.list || [];
      const tickersMap = new Map(tickersList.map((t: any) => [t.symbol.replace('USDT', '').toUpperCase(), t]));
      const cgRes = await fetchWithRetry(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=1h,24h&sparkline=false'
      );
      const cgData = cgRes || [];
      const cgMap = new Map(cgData.map((c: any) => [c.symbol.toUpperCase(), c]));
      const merged: Coin[] = symbols.map((base: string) => {
        const cg = cgMap.get(base) || cgMap.get(base.toLowerCase());
        const ticker = tickersMap.get(base);
        const lastPrice = ticker ? parseFloat(ticker.lastPrice || '0') : 0;
        const prevPrice1h = ticker ? parseFloat(ticker.prevPrice1h || '0') : 0;
        const price24hPcnt = ticker ? parseFloat(ticker.price24hPcnt || '0') * 100 : null;
        let change1h: number | null = null;
        if (prevPrice1h > 0 && lastPrice > 0) {
          change1h = ((lastPrice - prevPrice1h) / prevPrice1h) * 100;
        } else if (cg && cg.price_change_percentage_1h_in_currency != null) {
          change1h = cg.price_change_percentage_1h_in_currency;
        }
        if (cg) {
          return {
            ...cg,
            current_price: lastPrice || cg.current_price,
            total_volume: ticker ? parseFloat(ticker.volume24h || String(cg.total_volume)) : cg.total_volume,
            price_change_percentage_24h: price24hPcnt !== null ? price24hPcnt : cg.price_change_percentage_24h,
            price_change_percentage_1h_in_currency: change1h,
            isBybitOnly: false,
          };
        } else {
          return {
            id: base.toLowerCase(),
            symbol: base.toLowerCase(),
            name: base,
            image: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
            current_price: lastPrice,
            price_change_percentage_1h_in_currency: change1h,
            price_change_percentage_24h: price24hPcnt,
            total_volume: ticker ? parseFloat(ticker.volume24h || '0') : 0,
            market_cap: 0,
            isBybitOnly: true,
          };
        }
      });
      const filteredMerged = merged.filter(coin =>
        coin.total_volume > 8000 || coin.symbol.toLowerCase() === 'btc' || coin.symbol.toLowerCase() === 'eth'
      );
      setCoins(filteredMerged);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
      setError('Bybit fetch failed. Falling back to CoinGecko...');
      try {
        const cgRes = await fetchWithRetry(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=1h,24h&sparkline=false'
        );
        setCoins((cgRes || []).map((c: any) => ({ ...c, isBybitOnly: false })));
      } catch {
        setError('Failed to load data. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, []);
  // Only this part changed - stronger fallback for news
const fetchNews = async (coinName: string, coinSymbol: string) => {
  setNewsLoading(true);
  setNewsError(null);
  setNews([]);
  try {
    const symbol = coinSymbol.toUpperCase();
    // 🥇 PRIMARY: CryptoCompare
    const res = await fetch(
      `https://min-api.cryptocompare.com/data/v2/news/?categories=${symbol}`
    );
    const data = await res.json();
    let articles: any[] = [];
    if (data.Data && data.Data.length > 0) {
      articles = data.Data.map((item: any) => ({
        title: item.title,
        url: item.url,
        source: item.source,
        date: item.published_on * 1000,
      }));
    }
    // 🥈 FALLBACK: RSS feeds
    if (articles.length < 5) {
      const rssSources = [
        "https://api.rss2json.com/v1/api.json?rss_url=https://www.coindesk.com/arc/outboundfeeds/rss/",
        "https://api.rss2json.com/v1/api.json?rss_url=https://cointelegraph.com/rss"
      ];
      for (const url of rssSources) {
        try {
          const rssRes = await fetch(url);
          const rssData = await rssRes.json();
          if (rssData.items && rssData.items.length > 0) {
            const rssArticles = rssData.items.map((item: any) => ({
              title: item.title,
              url: item.link,
              source: item.author || "RSS Feed",
              date: new Date(item.pubDate).getTime(),
            }));
            articles = [...articles, ...rssArticles];
          }
        } catch (e) {
          console.warn("RSS fallback failed", e);
        }
      }
    }
    if (articles.length === 0) {
      setNewsError("No news available right now.");
    } else {
      articles.sort((a, b) => b.date - a.date);
      setNews(articles);
    }
  } catch (err) {
    console.error(err);
    setNewsError("Failed to fetch news.");
  } finally {
    setNewsLoading(false);
  }
};
  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), 180000);
    return () => clearInterval(interval);
  }, [fetchData]);
  useEffect(() => {
    const coin = coins.find(c => c.id === selectedCoin);
    if (coin) fetchNews(coin.name, coin.symbol);
  }, [selectedCoin, coins]);
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = saved === 'dark' || (!saved && prefersDark);
    setIsDark(initialDark);
    document.documentElement.classList.toggle('dark', initialDark);
    setMounted(true);
  }, []);
  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.classList.toggle('dark', newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  };
  const loadChart = (coin: Coin) => setSelectedCoin(coin.id);
  const openBybit = (symbol: string) => window.open(`https://www.bybit.com/trade/usdt/${symbol.toUpperCase()}USDT`, '_blank');
  const openFullTradingView = (symbol: string) => window.open(`https://www.tradingview.com/chart/?symbol=BYBIT:${symbol.toUpperCase()}USDT.P`, '_blank');
  const addToWatchlist = (id: string) => {
    if (!watchlist.includes(id)) setWatchlist([...watchlist, id]);
  };
  const removeFromWatchlist = (id: string) => setWatchlist(watchlist.filter(i => i !== id));
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key >= '1' && e.key <= '8') {
        const scanners: typeof activeScanner[] = ['gainers', 'losers', 'volume', 'relative', 'micro', 'large', 'trending', 'momentum'];
        setActiveScanner(scanners[parseInt(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  useEffect(() => {
    const coin = coins.find(c => c.id === selectedCoin);
    const baseSymbol = coin ? `BYBIT:${coin.symbol.toUpperCase()}USDT.P` : 'BYBIT:BTCUSDT.P';
    const studies = showMACD
      ? [{ id: 'MACD@tv-basicstudies', inputs: { 'in_0': 12, 'in_1': 26, 'in_2': 9 } }]
      : [];
    [0, 1, 2, 3].forEach((i) => {
      const container = document.getElementById(`tv-chart-${i}`);
      if (!container) return;
      container.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      script.async = true;
      script.innerHTML = JSON.stringify({
        symbol: baseSymbol,
        interval: timeframes[i],
        theme: isDark ? 'dark' : 'light',
        style: '1',
        locale: 'en',
        autosize: true,
        allow_symbol_change: false,
        hide_top_toolbar: true,
        hide_legend: true,
        hide_side_toolbar: true,
        backgroundColor: isDark ? '#09090b' : '#ffffff',
        studies: studies,
      });
      container.appendChild(script);
    });
  }, [selectedCoin, timeframes, isDark, showMACD, coins]);
  const scannerData = useMemo(() => {
    let filtered = [...coins];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.symbol.toLowerCase().includes(term) || c.name.toLowerCase().includes(term));
    }
    switch (activeScanner) {
      case 'gainers': filtered.sort((a, b) => (b.price_change_percentage_1h_in_currency || 0) - (a.price_change_percentage_1h_in_currency || 0)); break;
      case 'losers': filtered.sort((a, b) => (a.price_change_percentage_1h_in_currency || 0) - (b.price_change_percentage_1h_in_currency || 0)); break;
      case 'volume': filtered.sort((a, b) => b.total_volume - a.total_volume); break;
      case 'relative': filtered.sort((a, b) => (b.total_volume / (b.market_cap || 1)) - (a.total_volume / (a.market_cap || 1))); break;
      case 'micro': filtered = filtered.filter(c => c.market_cap < 300000000 || c.market_cap === 0); filtered.sort((a, b) => (b.price_change_percentage_1h_in_currency || 0) - (a.price_change_percentage_1h_in_currency || 0)); break;
      case 'large': filtered = filtered.filter(c => c.market_cap > 5000000000); filtered.sort((a, b) => b.market_cap - a.market_cap); break;
      case 'trending': filtered = filtered.slice(0, 30); break;
      case 'momentum': filtered = filtered.filter(c => Math.abs(c.price_change_percentage_1h_in_currency || 0) > 3 && c.total_volume > 30000000); filtered.sort((a, b) => Math.abs(b.price_change_percentage_1h_in_currency || 0) - Math.abs(a.price_change_percentage_1h_in_currency || 0)); break;
    }
    return filtered.slice(0, 40);
  }, [coins, activeScanner, searchTerm]);
  const filteredWatchlist = useMemo(() => {
    return watchlist
      .map(id => coins.find(c => c.id === id))
      .filter((coin): coin is Coin => coin !== undefined)
      .filter(coin => !searchTerm || coin.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || coin.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [watchlist, coins, searchTerm]);
  const formatPrice = (price: number) =>
    price < 0.00001 ? price.toExponential(2) : price < 1 ? price.toFixed(6) : price.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const resetLayout = () => {
    setLeftWidth(340); setRightWidth(380); setScannerHeight(520); setWatchlistHeight(340);
  };
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingScannerHeight, setIsDraggingScannerHeight] = useState(false);
  const [isDraggingWatchlistHeight, setIsDraggingWatchlistHeight] = useState(false);
  const handleMouseDownLeft = (e: React.MouseEvent) => { e.preventDefault(); setIsDraggingLeft(true); document.body.style.userSelect = 'none'; };
  const handleMouseDownRight = (e: React.MouseEvent) => { e.preventDefault(); setIsDraggingRight(true); document.body.style.userSelect = 'none'; };
  const handleMouseDownScannerHeight = (e: React.MouseEvent) => { e.preventDefault(); setIsDraggingScannerHeight(true); document.body.style.userSelect = 'none'; };
  const handleMouseDownWatchlistHeight = (e: React.MouseEvent) => { e.preventDefault(); setIsDraggingWatchlistHeight(true); document.body.style.userSelect = 'none'; };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (isDraggingLeft) setLeftWidth(Math.max(260, Math.min(e.clientX - rect.left, rect.width - rightWidth - 340)));
      if (isDraggingRight) {
        const newRight = Math.max(280, rect.width - (e.clientX - rect.left));
        setRightWidth(Math.min(newRight, rect.width - leftWidth - 340));
      }
      if (isDraggingScannerHeight) setScannerHeight(Math.max(300, Math.min(e.clientY - rect.top - 180, 800)));
      if (isDraggingWatchlistHeight) setWatchlistHeight(Math.max(200, Math.min(e.clientY - rect.top - 180, 500)));
    };
    const handleMouseUp = () => {
      setIsDraggingLeft(false); setIsDraggingRight(false);
      setIsDraggingScannerHeight(false); setIsDraggingWatchlistHeight(false);
      document.body.style.userSelect = '';
    };
    if (isDraggingLeft || isDraggingRight || isDraggingScannerHeight || isDraggingWatchlistHeight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, isDraggingScannerHeight, isDraggingWatchlistHeight, leftWidth, rightWidth]);
  if (!mounted) return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950" />;
  const currentCoin = coins.find(c => c.id === selectedCoin);
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col overflow-hidden">
      {/* Top Bar - unchanged */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">CRYPTO DAY TRADE DASH</h1>
          <span className="px-3 py-1 text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full">
            24/7 LIVE • {totalBybitPairs} BYBIT PAIRS
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {lastUpdated && <span className="text-zinc-500 dark:text-zinc-400">Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={() => setShowMACD(!showMACD)} className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium transition ${showMACD ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
            {showMACD ? 'MACD ON' : 'MACD OFF'}
          </button>
          <button onClick={() => fetchData(true)} className="flex items-center gap-2 px-5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition" disabled={loading}>
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> Refresh Data
          </button>
          <button onClick={resetLayout} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all active:scale-95">
            <RotateCcw className="w-5 h-5" /> Reset Layout
          </button>
          <button onClick={() => setSoundEnabled(!soundEnabled)} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition">
            {soundEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />} Alerts {soundEnabled ? 'ON' : 'OFF'}
          </button>
          <button onClick={toggleTheme} className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition">
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />} {isDark ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
        {/* LEFT SCANNER - unchanged except the Coin column now has the yellow box */}
        <div style={{ width: leftWidth }} className="border-r border-zinc-200 dark:border-zinc-700 flex flex-col bg-white dark:bg-zinc-900 relative min-w-[260px]">
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-700">
            <h2 className="font-semibold text-lg mb-3">SCANNERS • Full Bybit USDT</h2>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search coin or symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm focus:outline-none focus:border-emerald-500"
              />
              {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"><X className="w-4 h-4" /></button>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['gainers','losers','volume','relative','micro','large','trending','momentum'] as const).map((s, i) => (
                <button key={s} onClick={() => setActiveScanner(s)} className={`p-3 text-sm rounded-xl transition-all ${activeScanner === s ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-600'}`}>
                  {i+1}. {s === 'gainers' && '🚀 Top Gainers (1h)'}{s === 'losers' && '📉 Top Losers (1h)'}{s === 'volume' && '📊 Top Volume'}{s === 'relative' && '🔥 Rel. Volume'}{s === 'micro' && '🐜 Micro Cap'}{s === 'large' && '🏦 Large Cap'}{s === 'trending' && '🔥 Trending'}{s === 'momentum' && '⚡ Momentum >3%'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ height: scannerHeight }} className="flex-1 overflow-auto p-3">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="p-3 text-left w-10"></th>
                  <th className="p-3 text-left">Coin</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3 text-right">1h %</th>
                  <th className="p-3 text-right">24h %</th>
                  <th className="p-3 text-right">Vol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {loading ? <tr><td colSpan={6} className="text-center py-20 text-zinc-500">Loading all Bybit pairs...</td></tr> :
                 error ? <tr><td colSpan={6} className="text-center py-20 text-red-500">{error}</td></tr> :
                 scannerData.length === 0 ? <tr><td colSpan={6} className="text-center py-20 text-zinc-500">No results found</td></tr> :
                 scannerData.map((coin) => {
                   const change1h = coin.price_change_percentage_1h_in_currency || 0;
                   const isUp = change1h > 0;
                   return (
                     <tr key={coin.id} onClick={() => loadChart(coin)} className="group h-14 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                       <td className="p-3 pl-4"><img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full" /></td>
                       <td className="p-2.5">
                         <div className="font-medium flex items-center gap-1.5">
                           {coin.symbol.toUpperCase()}
                           <BybitLink symbol={coin.symbol} />
                         </div>
                         <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate -mt-0.5">{coin.name}</div>
                       </td>
                       <td className={`p-3 text-right font-mono ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>${formatPrice(coin.current_price)}</td>
                       <td className={`p-3 text-right font-medium ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{change1h !== 0 ? change1h.toFixed(1) + '%' : '—'}</td>
                       <td className={`p-3 text-right font-medium ${(coin.price_change_percentage_24h || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{(coin.price_change_percentage_24h || 0).toFixed(1)}%</td>
                       <td className="p-3 text-right text-xs text-zinc-500 dark:text-zinc-400">{(coin.total_volume / 1_000_000).toFixed(0)}M</td>
                     </tr>
                   );
                 })}
              </tbody>
            </table>
          </div>
          <div onMouseDown={handleMouseDownScannerHeight} className="h-1 bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-row-resize z-50 w-full" />
          <div onMouseDown={handleMouseDownLeft} className="absolute top-0 right-0 w-1 h-full bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-col-resize z-50" />
        </div>
        {/* CENTER Charts - unchanged */}
        <div className="flex-1 flex flex-col border-r border-zinc-200 dark:border-zinc-700" style={{ height: 'calc(100vh - 73px)' }}>
          <div className="bg-white dark:bg-zinc-900 p-4 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold flex items-center gap-2">
                {currentCoin?.name}
                <span className="text-emerald-600 dark:text-emerald-400 text-base font-mono">{currentCoin?.symbol.toUpperCase()}USDT.P</span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Click coin name in scanner to trade on Bybit</div>
            </div>
            {currentCoin && (
              <button onClick={() => addToWatchlist(currentCoin.id)} className="flex items-center gap-2 px-5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition" disabled={watchlist.includes(currentCoin.id)}>
                <Plus className="w-5 h-5" /> {watchlist.includes(currentCoin.id) ? 'Already in Watchlist' : 'Add to Watchlist'}
              </button>
            )}
            <button onClick={() => currentCoin && openFullTradingView(currentCoin.symbol)} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-2xl text-sm font-medium transition">
              <ExternalLink className="w-4 h-4" /> Open Full Chart
            </button>
          </div>
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-px bg-zinc-800 p-px">
            {[0,1,2,3].map((i) => (
              <div key={i} className="relative bg-zinc-900 flex flex-col">
                <div className="absolute top-2 right-2 z-10 flex gap-1 bg-black/70 rounded-lg p-1">
                  {['1','3','5','15','30','60','120','240','D'].map((tf) => (
                    <button key={tf} onClick={() => { const newTfs = [...timeframes]; newTfs[i] = tf; setTimeframes(newTfs); }} className={`px-2.5 py-1 text-xs rounded-md transition ${timeframes[i] === tf ? 'bg-emerald-600 text-white' : 'hover:bg-zinc-700 text-zinc-400'}`}>
                      {tf === 'D' ? '1D' : tf + 'm'}
                    </button>
                  ))}
                </div>
                <div id={`tv-chart-${i}`} className="flex-1" />
              </div>
            ))}
          </div>
        </div>
        {/* RIGHT PANEL - unchanged except watchlist also has the yellow box for consistency */}
        <div style={{ width: rightWidth }} className="border-l border-zinc-200 dark:border-zinc-700 flex flex-col bg-white dark:bg-zinc-900 relative">
          <div style={{ height: watchlistHeight }} className="flex flex-col border-b border-zinc-200 dark:border-zinc-700">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" /> Watchlist</h3>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{filteredWatchlist.length} coins</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-3">
              {filteredWatchlist.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">No matching coins in watchlist</div>
              ) : (
                filteredWatchlist.map(coin => {
                  const change1h = coin.price_change_percentage_1h_in_currency || 0;
                  const isUp = change1h > 0;
                  return (
                    <div key={coin.id} onClick={() => loadChart(coin)} className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 p-4 rounded-2xl flex items-center justify-between cursor-pointer group transition">
                      <div className="flex items-center gap-4">
                        <img src={coin.image} className="w-9 h-9 rounded-full" />
                        <div>
                          <div className="font-medium flex items-center gap-1.5">
                            {coin.symbol.toUpperCase()}
                            <BybitLink symbol={coin.symbol} />
                          </div>
                          <div className={`text-sm ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>${formatPrice(coin.current_price)}</div>
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFromWatchlist(coin.id); }} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div onMouseDown={handleMouseDownWatchlistHeight} className="h-1 bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-row-resize z-50 w-full" />
          </div>
          {/* NEWS SECTION - unchanged */}
          <div className="flex-1 flex flex-col">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">📰 Live News</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">For {currentCoin?.symbol.toUpperCase() || 'selected coin'}</p>
              </div>
              {currentCoin && (
                <button
                  onClick={() => fetchNews(currentCoin.name, currentCoin.symbol)}
                  disabled={newsLoading}
                  className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} /> Refresh News
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-6 text-sm">
              {newsLoading ? (
                <div className="text-center py-16 text-zinc-500">Loading news...</div>
              ) : newsError ? (
                <div className="text-center py-16 text-amber-600 dark:text-amber-400">{newsError}</div>
              ) : news.length > 0 ? (
                news.slice(0, 12).map((item, i) => (
                  <a key={i} href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="block hover:bg-zinc-100 dark:hover:bg-zinc-800 -mx-2 p-4 rounded-2xl transition">
                    <div className="font-medium leading-tight line-clamp-3">{item.title}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
                      {item.source || 'Crypto News'} • {new Date(item.published_at || item.date || Date.now()).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
                  No recent news available right now.<br />Try Bitcoin or Ethereum and click "Refresh News".
                </div>
              )}
            </div>
          </div>
          <div onMouseDown={handleMouseDownRight} className="absolute top-0 left-0 w-1 h-full bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-col-resize z-50" />
        </div>
      </div>
      <div className="text-center py-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
        Full Bybit scanner • News feed with improved fallback
      </div>
    </div>
  );
}