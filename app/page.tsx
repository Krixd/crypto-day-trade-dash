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
}

interface UseLocalStorageReturn<T> {
  value: T;
  setValue: React.Dispatch<React.SetStateAction<T>>;
}

function useLocalStorage<T>(key: string, initialValue: T): UseLocalStorageReturn<T> {
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
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BYBIT:BTCUSDT.P'); // Default to perpetual
  const [activeScanner, setActiveScanner] = useState<'gainers' | 'losers' | 'volume' | 'relative' | 'micro' | 'large' | 'trending' | 'momentum'>('gainers');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { value: watchlist, setValue: setWatchlist } = useLocalStorage<string[]>('cryptoWatchlist', ['bitcoin', 'ethereum', 'solana']);
  const [news, setNews] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  const { value: leftWidth, setValue: setLeftWidth } = useLocalStorage<number>('dashLeftWidth', 610);
  const { value: rightWidth, setValue: setRightWidth } = useLocalStorage<number>('dashRightWidth', 380);
  const { value: scannerHeight, setValue: setScannerHeight } = useLocalStorage<number>('dashScannerHeight', 520);
  const { value: watchlistHeight, setValue: setWatchlistHeight } = useLocalStorage<number>('dashWatchlistHeight', 340);

  const containerRef = useRef<HTMLDivElement>(null);
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Persist selected coin
  useEffect(() => {
    const savedCoin = localStorage.getItem('selectedCoin');
    if (savedCoin) setSelectedCoin(savedCoin);
  }, []);

  useEffect(() => {
    localStorage.setItem('selectedCoin', selectedCoin);
  }, [selectedCoin]);

  const fetchWithRetry = async (url: string, retries = 4, baseDelay = 1500): Promise<any> => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
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
      const data: Coin[] = await fetchWithRetry(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=1h,24h&sparkline=false'
      );
      setCoins(data);
      setLastUpdated(new Date());
    } catch (e) {
      setError('Rate limit hit. Try Refresh Data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNews = async (coinName: string) => {
    try {
      const q = coinName.toLowerCase().replace(/ /g, '+');
      const res = await fetch(`https://cryptocurrency.cv/api/news?limit=12&q=${q}`);
      const data = await res.json();
      setNews(data.articles || data || []);
    } catch {
      setNews([]);
    }
  };

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), 90000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const coin = coins.find(c => c.id === selectedCoin);
    if (coin) fetchNews(coin.name);
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

  const loadChart = (coin: Coin) => {
    setSelectedCoin(coin.id);
    // Changed to perpetual chart: SIRENUSDT → BYBIT:SIRENUSDT.P
    setSelectedSymbol(`BYBIT:${coin.symbol.toUpperCase()}USDT.P`);
  };

  const openBybit = (symbol: string) => {
    window.open(`https://www.bybit.com/trade/usdt/${symbol.toUpperCase()}USDT`, '_blank');
  };

  const openFullTradingView = (symbol: string) => {
    // Also uses perpetual chart in full view
    window.open(`https://www.tradingview.com/chart/?symbol=BYBIT:${symbol.toUpperCase()}USDT.P`, '_blank');
  };

  const addToWatchlist = (id: string) => {
    if (!watchlist.includes(id)) setWatchlist([...watchlist, id]);
  };

  const removeFromWatchlist = (id: string) => {
    setWatchlist(watchlist.filter(i => i !== id));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key >= '1' && e.key <= '8') {
        const scanners: typeof activeScanner[] = ['gainers', 'losers', 'volume', 'relative', 'micro', 'large', 'trending', 'momentum'];
        setActiveScanner(scanners[parseInt(e.key) - 1]);
      }

      if (e.key === 'Enter' && tableRef.current) {
        const activeRow = tableRef.current.querySelector('tr[tabindex="0"]') as HTMLTableRowElement;
        if (activeRow) activeRow.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

// ... rest of your imports and component stay exactly the same ...

// TradingView Widget (now with permanent MACD)
useEffect(() => {
  if (!tvContainerRef.current) return;
  tvContainerRef.current.innerHTML = '';

  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
  script.async = true;
  script.innerHTML = JSON.stringify({
    symbol: selectedSymbol,
    interval: '5',
    theme: isDark ? 'dark' : 'light',
    style: '1',
    locale: 'en',
    autosize: true,
    allow_symbol_change: true,
    hide_top_toolbar: false,
    hide_legend: false,
    hide_side_toolbar: false,
    backgroundColor: isDark ? '#09090b' : '#ffffff',

    // ←←← THIS IS THE NEW PART: Permanent MACD
    studies: [
      {
        id: 'MACD@tv-basicstudies',
        inputs: {
          'in_0': 12,   // Fast Length
          'in_1': 26,   // Slow Length
          'in_2': 9,    // Signal Smoothing
        },
        // Optional: you can override colors here if you want
        // overrides: {
        //   'MACD.MACD.color': '#ff0000',
        //   'MACD.Signal.color': '#00ff00',
        //   'MACD.Histogram.color': '#ffff00',
        // }
      }
    ],
  });

  tvContainerRef.current.appendChild(script);
}, [selectedSymbol, isDark]);

// ... rest of your component unchanged ...
  const scannerData = useMemo(() => {
    let filtered = [...coins];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c => 
        c.symbol.toLowerCase().includes(term) || c.name.toLowerCase().includes(term)
      );
    }

    switch (activeScanner) {
      case 'gainers': filtered.sort((a, b) => (b.price_change_percentage_1h_in_currency || 0) - (a.price_change_percentage_1h_in_currency || 0)); break;
      case 'losers': filtered.sort((a, b) => (a.price_change_percentage_1h_in_currency || 0) - (b.price_change_percentage_1h_in_currency || 0)); break;
      case 'volume': filtered.sort((a, b) => b.total_volume - a.total_volume); break;
      case 'relative': filtered.sort((a, b) => (b.total_volume / (b.market_cap || 1)) - (a.total_volume / (a.market_cap || 1))); break;
      case 'micro': filtered = filtered.filter(c => c.market_cap < 150000000); filtered.sort((a, b) => (b.price_change_percentage_1h_in_currency || 0) - (a.price_change_percentage_1h_in_currency || 0)); break;
      case 'large': filtered = filtered.filter(c => c.market_cap > 5000000000); filtered.sort((a, b) => b.market_cap - a.market_cap); break;
      case 'trending': filtered = filtered.slice(0, 25); break;
      case 'momentum': filtered = filtered.filter(c => Math.abs(c.price_change_percentage_1h_in_currency || 0) > 3 && c.total_volume > 40000000); break;
    }

    return filtered.slice(0, 40);
  }, [coins, activeScanner, searchTerm]);

  const filteredWatchlist = useMemo(() => {
    return watchlist
      .map(id => coins.find(c => c.id === id))
      .filter((coin): coin is Coin => coin !== undefined)
      .filter(coin => 
        !searchTerm || 
        coin.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
        coin.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [watchlist, coins, searchTerm]);

  const formatPrice = (price: number) =>
    price < 0.00001 ? price.toExponential(2) : price < 1 ? price.toFixed(6) : price.toLocaleString('en-US', { maximumFractionDigits: 4 });

  const resetLayout = () => {
    setLeftWidth(610); setRightWidth(380); setScannerHeight(520); setWatchlistHeight(340);
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

      if (isDraggingLeft) setLeftWidth(Math.max(280, Math.min(e.clientX - rect.left, rect.width - rightWidth - 320)));
      if (isDraggingRight) {
        const newRight = Math.max(280, rect.width - (e.clientX - rect.left));
        setRightWidth(Math.min(newRight, rect.width - leftWidth - 320));
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">CRYPTO DAY TRADE DASH</h1>
          <span className="px-3 py-1 text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full">24/7 LIVE</span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          {lastUpdated && (
            <span className="text-zinc-500 dark:text-zinc-400">
              Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={() => fetchData(true)} className="flex items-center gap-2 px-5 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition" disabled={loading}>
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> Refresh
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
        {/* LEFT: Scanners + Search */}
        <div style={{ width: leftWidth }} className="border-r border-zinc-200 dark:border-zinc-700 flex flex-col bg-white dark:bg-zinc-900 relative">
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-700">
            <h2 className="font-semibold text-lg mb-3">SCANNERS</h2>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search coin or symbol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm focus:outline-none focus:border-emerald-500"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['gainers','losers','volume','relative','micro','large','trending','momentum'] as const).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setActiveScanner(s)}
                  className={`p-3 text-sm rounded-xl transition-all ${activeScanner === s ? 'bg-emerald-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-600'}`}
                >
                  {i+1}. {s === 'gainers' && '🚀 Top Gainers (1h)'}
                  {s === 'losers' && '📉 Top Losers (1h)'}
                  {s === 'volume' && '📊 Top Volume'}
                  {s === 'relative' && '🔥 Rel. Volume'}
                  {s === 'micro' && '🐜 Micro Cap'}
                  {s === 'large' && '🏦 Large Cap'}
                  {s === 'trending' && '🔥 Trending'}
                  {s === 'momentum' && '⚡ Momentum >3%'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: scannerHeight }} className="flex-1 overflow-auto p-3">
            <table ref={tableRef} className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="p-3 text-left w-10"></th>
                  <th className="p-3 text-left">Coin</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3 text-right">1h %</th>
                  <th className="p-3 text-right">24h %</th>
                  <th className="p-3 text-right">Vol</th>
                  <th className="p-3 w-20 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-20 text-zinc-500">Loading live data...</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="text-center py-20 text-red-500">{error}</td></tr>
                ) : scannerData.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-20 text-zinc-500">No results found</td></tr>
                ) : (
                  scannerData.map((coin) => {
                    const change1h = coin.price_change_percentage_1h_in_currency || 0;
                    const isUp = change1h > 0;
                    return (
                      <tr
                        key={coin.id}
                        onClick={() => loadChart(coin)}
                        tabIndex={0}
                        className="group h-16 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                      >
                        <td className="p-3 pl-4"><img src={coin.image} alt={coin.name} className="w-7 h-7 rounded-full" /></td>
                        <td className="p-3">
                          <div className="font-medium">{coin.symbol.toUpperCase()}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{coin.name}</div>
                        </td>
                        <td className={`p-3 text-right font-mono ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                          ${formatPrice(coin.current_price)}
                        </td>
                        <td className={`p-3 text-right font-medium ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                          {change1h.toFixed(1)}%
                        </td>
                        <td className={`p-3 text-right font-medium ${(coin.price_change_percentage_24h || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                          {(coin.price_change_percentage_24h || 0).toFixed(1)}%
                        </td>
                        <td className="p-3 text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {(coin.total_volume / 1_000_000).toFixed(0)}M
                        </td>
                        <td className="p-3 pr-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100">
                          <button onClick={(e) => { e.stopPropagation(); addToWatchlist(coin.id); }} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded" title="Add to Watchlist">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openBybit(coin.symbol); }} className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-emerald-600" title="Trade on Bybit">
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div onMouseDown={handleMouseDownScannerHeight} className="h-1 bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-row-resize z-50 w-full" />
          <div onMouseDown={handleMouseDownLeft} className="absolute top-0 right-0 w-1 h-full bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-col-resize z-50" />
        </div>

        {/* CENTER: Chart */}
        <div className="flex-1 flex flex-col border-r border-zinc-200 dark:border-zinc-700" style={{ height: 'calc(100vh - 73px)' }}>
          <div className="bg-white dark:bg-zinc-900 p-4 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0 flex items-center justify-between">
            <div>
              <div className="text-xl font-semibold flex items-center gap-2">
                {coins.find(c => c.id === selectedCoin)?.name}
                <span className="text-emerald-600 dark:text-emerald-400 text-base font-mono">
                  {coins.find(c => c.id === selectedCoin)?.symbol.toUpperCase()}USDT.P
                </span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Perpetual Futures • Click row or use keyboard</div>
            </div>
            <button 
              onClick={() => {
                const coin = coins.find(c => c.id === selectedCoin);
                if (coin) openFullTradingView(coin.symbol);
              }} 
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-2xl text-sm font-medium transition"
            >
              <ExternalLink className="w-4 h-4" /> Open Full Chart
            </button>
          </div>

          <div className="flex-1 relative bg-black min-h-[520px] overflow-hidden">
            <div ref={tvContainerRef} className="absolute inset-0 w-full h-full" />
          </div>
        </div>

        {/* RIGHT: Watchlist + News */}
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
                    <div 
                      key={coin.id} 
                      onClick={() => loadChart(coin)} 
                      className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 p-4 rounded-2xl flex items-center justify-between cursor-pointer group transition"
                    >
                      <div className="flex items-center gap-4">
                        <img src={coin.image} className="w-9 h-9 rounded-full" />
                        <div>
                          <div className="font-medium">{coin.symbol.toUpperCase()}</div>
                          <div className={`text-sm ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            ${formatPrice(coin.current_price)}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeFromWatchlist(coin.id); }} 
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div onMouseDown={handleMouseDownWatchlistHeight} className="h-1 bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-row-resize z-50 w-full" />
          </div>

          <div className="flex-1 flex flex-col">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="font-semibold">📰 Live News</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">For selected coin</p>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-6 text-sm">
              {news.length > 0 ? news.slice(0, 10).map((item, i) => (
                <a key={i} href={item.url} target="_blank" className="block hover:bg-zinc-100 dark:hover:bg-zinc-800 -mx-2 p-4 rounded-2xl transition">
                  <div className="font-medium leading-tight line-clamp-3">{item.title}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-3">
                    {item.source || 'Crypto News'} • {new Date(item.published_at || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </a>
              )) : (
                <div className="italic text-zinc-500 dark:text-zinc-400 text-center py-12">No recent news found</div>
              )}
            </div>
          </div>

          <div onMouseDown={handleMouseDownRight} className="absolute top-0 left-0 w-1 h-full bg-zinc-300 dark:bg-zinc-600 hover:bg-emerald-500 cursor-col-resize z-50" />
        </div>
      </div>

      <div className="text-center py-3 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
        Now using Bybit Perpetual charts (USDT.P) • Press 1-8 to switch scanners • ↑↓ + Enter to navigate
      </div>
    </div>
  );
}