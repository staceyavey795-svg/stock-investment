import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import CandlestickChart from './CandlestickChart.jsx'
import { supabase } from './supabaseClient.js'

const marketTabs = [
  ['quotes', 'Quotes'],
  ['chart', 'Chart'],
  ['trade', 'Trade'],
  ['positions', 'Positions'],
  ['history', 'History'],
]
const timeframes = ['1D', '1W', '1M', '3M', '1Y']

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatQuantity(value) {
  return Number(value ?? 0).toFixed(4).replace(/\.?0+$/, '')
}

function getPrice(stock) {
  return Number.parseFloat(stock?.price?.replace('$', '') ?? '0')
}

function Market({
  userId,
  stocks,
  availableBalance,
  isLoadingBalance,
  balanceError,
  holdings,
  isLoadingHoldings,
  holdingsError,
  pendingBuySymbol,
  pendingSellSymbol,
  selectedSymbol,
  onSelectStock,
  priceHistory,
  ohlcHistory,
  chartMode,
  onChartModeChange,
  onBuy,
  onSell,
  onBack,
}) {
  const [activeTab, setActiveTab] = useState('quotes')
  const [search, setSearch] = useState('')
  const [timeframe, setTimeframe] = useState('1M')
  const [side, setSide] = useState('buy')
  const [quantity, setQuantity] = useState('')
  const [historyFilter, setHistoryFilter] = useState('all')
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [confirmation, setConfirmation] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tradeMessage, setTradeMessage] = useState({ type: '', text: '' })

  const selectedStock = stocks.find((stock) => stock.symbol === selectedSymbol) ?? null
  const currentPrice = getPrice(selectedStock)
  const ownedQuantity = Number(holdings[selectedSymbol]?.quantity ?? 0)
  const maxBuyQuantity = currentPrice > 0 && availableBalance != null
    ? Math.floor((availableBalance / currentPrice) * 10000) / 10000
    : 0
  const maxSellQuantity = ownedQuantity
  const maxOrderQuantity = side === 'buy' ? maxBuyQuantity : maxSellQuantity
  const numericQuantity = Number(quantity)
  const estimatedTotal = numericQuantity * currentPrice
  const isTrading = Boolean(pendingBuySymbol || pendingSellSymbol || isSubmitting)
  const isQuantityValid = Number.isFinite(numericQuantity)
    && numericQuantity > 0
    && numericQuantity <= maxOrderQuantity
    && (side !== 'buy' || (availableBalance != null && estimatedTotal <= availableBalance))

  useEffect(() => {
    if (activeTab !== 'history') return undefined
    let isMounted = true

    const loadTrades = async () => {
      setHistoryLoading(true)
      setHistoryError('')
      try {
        const { data, error } = await supabase
          .from('trades')
          .select('symbol, side, quantity, price, total, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (error) throw error
        if (isMounted) setHistoryRows(data ?? [])
      } catch (error) {
        if (isMounted) setHistoryError(error instanceof Error ? error.message : 'Could not load trade history.')
      } finally {
        if (isMounted) setHistoryLoading(false)
      }
    }

    loadTrades()
    return () => { isMounted = false }
  }, [activeTab, historyRefreshKey, userId])

  const visibleStocks = stocks.filter((stock) => {
    const query = search.trim().toLowerCase()
    return !query || stock.symbol.toLowerCase().includes(query) || stock.name.toLowerCase().includes(query)
  })

  const currentSeries = (() => {
    const countByTimeframe = { '1D': 2, '1W': 7, '1M': 30, '3M': 30, '1Y': 30 }
    return priceHistory.slice(-countByTimeframe[timeframe])
  })()
  const currentOhlcSeries = ohlcHistory.slice(-currentSeries.length)

  const openTrade = (nextSide) => {
    setSide(nextSide)
    setQuantity('')
    setTradeMessage({ type: '', text: '' })
    setActiveTab('trade')
  }

  const requestOrder = (event) => {
    event.preventDefault()
    if (!selectedStock || !isQuantityValid || isTrading) return
    setTradeMessage({ type: '', text: '' })
    setConfirmation({ stock: selectedStock, side, quantity: numericQuantity, closePosition: false })
  }

  const submitConfirmedOrder = async () => {
    if (!confirmation || isTrading) return
    setIsSubmitting(true)
    setTradeMessage({ type: '', text: '' })
    try {
      const result = confirmation.side === 'buy'
        ? await onBuy(confirmation.stock, confirmation.quantity)
        : await onSell(confirmation.stock.symbol, confirmation.quantity)
      if (!result?.success) {
        setTradeMessage({ type: 'error', text: result?.error || 'The order could not be completed.' })
      } else {
        setTradeMessage({
          type: 'success',
          text: `${confirmation.side === 'buy' ? 'Bought' : 'Sold'} ${formatQuantity(confirmation.quantity)} ${confirmation.stock.symbol}${confirmation.closePosition ? ' position closed' : ''}.`,
        })
        setQuantity('')
        setHistoryRefreshKey((key) => key + 1)
      }
    } catch (error) {
      setTradeMessage({ type: 'error', text: error instanceof Error ? error.message : 'The order could not be completed.' })
    } finally {
      setIsSubmitting(false)
      setConfirmation(null)
    }
  }

  const closePosition = (holding) => {
    const stock = stocks.find((item) => item.symbol === holding.symbol) ?? {
      symbol: holding.symbol,
      name: holding.name,
      price: `$${holding.currentPrice}`,
      change: '0.00%',
      positive: true,
    }
    setTradeMessage({ type: '', text: '' })
    setConfirmation({ stock, side: 'sell', quantity: holding.quantity, closePosition: true })
  }

  const setQuickQuantity = (percentage) => {
    const nextQuantity = Math.floor((maxOrderQuantity * percentage) * 10000) / 10000
    setQuantity(nextQuantity ? String(nextQuantity) : '')
  }

  const portfolioRows = Object.values(holdings)
  const totalCost = portfolioRows.reduce((total, holding) => total + holding.quantity * holding.averageBuyPrice, 0)
  const totalProfitLoss = portfolioRows.reduce((total, holding) => total + holding.quantity * (holding.currentPrice - holding.averageBuyPrice), 0)
  const totalProfitLossPercent = totalCost ? (totalProfitLoss / totalCost) * 100 : 0
  const visibleTrades = historyRows.filter((trade) => historyFilter === 'all' || trade.side?.toLowerCase() === historyFilter)

  return (
    <section className="market-page" aria-labelledby="market-page-heading">
      <button type="button" className="back-button market-back-button" onClick={onBack}>Back</button>
      <div className="market-page-heading">
        <div>
          <p className="eyebrow">GX TRADING</p>
          <h2 id="market-page-heading">Market</h2>
        </div>
      </div>

      <div className="market-balance-strip" aria-live="polite">
        <span>Available balance</span>
        <strong>{isLoadingBalance ? 'Loading...' : availableBalance == null ? 'Unavailable' : formatCurrency(availableBalance)}</strong>
        {balanceError && <p role="alert">{balanceError}</p>}
      </div>

      <div className="market-tabs" role="tablist" aria-label="Market views">
        {marketTabs.map(([tab, label]) => (
          <button
            key={tab}
            id={`market-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls="market-tabpanel"
            className={activeTab === tab ? 'market-tab active' : 'market-tab'}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="market-tabpanel" className="market-content" role="tabpanel" aria-labelledby={`market-tab-${activeTab}`}>
        {activeTab === 'quotes' && (
          <div className="market-quotes-view">
            <label className="market-search-label" htmlFor="market-search">Search stocks</label>
            <input
              id="market-search"
              className="market-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Symbol or company"
            />
            {visibleStocks.length ? (
              <div className="market-quotes-list">
                {visibleStocks.map((stock) => (
                  <button
                    key={stock.symbol}
                    type="button"
                    className="market-quote-row"
                    onClick={() => { onSelectStock(stock.symbol); setActiveTab('chart') }}
                  >
                    <span className="market-quote-identity">
                      <strong>{stock.symbol}</strong>
                      <span>{stock.name}</span>
                    </span>
                    <span className="market-quote-pricing">
                      <strong>{stock.price}</strong>
                      <span className={stock.positive ? 'market-quote-change positive' : 'market-quote-change negative'}>
                        <span aria-hidden="true">{stock.positive ? '↑' : '↓'}</span> {stock.change}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="market-empty-state">No stocks match that search.</p>}
          </div>
        )}

        {activeTab === 'chart' && (
          selectedStock ? (
            <div className="market-chart-view">
              <div className="market-selected-stock">
                <div>
                  <span className="market-stock-symbol">{selectedStock.symbol}</span>
                  <h3>{selectedStock.name}</h3>
                </div>
                <div className="market-stock-price">
                  <strong>{selectedStock.price}</strong>
                  <span className={selectedStock.positive ? 'positive' : 'negative'}>{selectedStock.change} today</span>
                </div>
              </div>
              <div className="market-chart-panel">
                <div className="market-chart-toolbar">
                  <div className="market-timeframes" role="group" aria-label="Chart timeframe">
                    {timeframes.map((period) => (
                      <button key={period} type="button" className={timeframe === period ? 'active' : ''} aria-pressed={timeframe === period} onClick={() => setTimeframe(period)}>{period}</button>
                    ))}
                  </div>
                  <div className="chart-view-toggle" role="group" aria-label="Chart view">
                    <button type="button" className={chartMode === 'line' ? 'active' : ''} aria-pressed={chartMode === 'line'} onClick={() => onChartModeChange('line')}>Line</button>
                    <button type="button" className={chartMode === 'candlestick' ? 'active' : ''} aria-pressed={chartMode === 'candlestick'} onClick={() => onChartModeChange('candlestick')}>Candlestick</button>
                  </div>
                </div>
                {currentSeries.length ? chartMode === 'candlestick' ? (
                  <CandlestickChart data={currentOhlcSeries} stockName={selectedStock.name} />
                ) : (
                  <div className="chart-canvas market-chart-canvas" role="img" aria-label={`${selectedStock.name} ${timeframe} line price chart`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentSeries} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} width={54} />
                        <Tooltip formatter={(value) => [formatCurrency(value), 'Price']} />
                        <Line type="monotone" dataKey="price" stroke="var(--green)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <p className="market-empty-state">Price history is not available.</p>}
                {(timeframe === '3M' || timeframe === '1Y') && <p className="market-chart-note">Showing the available 30-day price series.</p>}
              </div>
              <div className="market-chart-actions">
                <button type="button" className="market-action-buy" onClick={() => openTrade('buy')}>Buy {selectedStock.symbol}</button>
                <button type="button" className="market-action-sell" onClick={() => openTrade('sell')}>Sell {selectedStock.symbol}</button>
              </div>
            </div>
          ) : (
            <div className="market-empty-state"><p>Choose a quote to open its chart.</p><button type="button" onClick={() => setActiveTab('quotes')}>Browse quotes</button></div>
          )
        )}

        {activeTab === 'trade' && (
          selectedStock ? (
            <div className="market-trade-view">
              <div className="market-trade-heading">
                <div><span className="market-stock-symbol">{selectedStock.symbol}</span><h3>{selectedStock.name}</h3></div>
                <strong>{selectedStock.price}</strong>
              </div>
              <div className="market-side-switch" role="group" aria-label="Order side">
                <button type="button" className={side === 'buy' ? 'active buy' : ''} aria-pressed={side === 'buy'} onClick={() => { setSide('buy'); setQuantity(''); setTradeMessage({ type: '', text: '' }) }}>Buy</button>
                <button type="button" className={side === 'sell' ? 'active sell' : ''} aria-pressed={side === 'sell'} onClick={() => { setSide('sell'); setQuantity(''); setTradeMessage({ type: '', text: '' }) }}>Sell</button>
              </div>
              <form className="market-order-form" onSubmit={requestOrder}>
                <label htmlFor="market-quantity">Quantity (shares)</label>
                <div className="market-quantity-control">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(String(Math.max(0, numericQuantity - 0.0001) || ''))} disabled={isTrading}>−</button>
                  <input id="market-quantity" type="number" min="0.0001" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isTrading} />
                  <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(String(Math.min(maxOrderQuantity, numericQuantity + 0.0001)))} disabled={isTrading || maxOrderQuantity <= 0}>+</button>
                </div>
                <div className="market-quick-quantities" aria-label="Set order size">
                  {[25, 50, 100].map((percentage) => <button key={percentage} type="button" onClick={() => setQuickQuantity(percentage / 100)} disabled={isTrading || maxOrderQuantity <= 0}>{percentage}%</button>)}
                </div>
                <dl className="market-order-summary">
                  <div><dt>Estimated total</dt><dd>{formatCurrency(estimatedTotal)}</dd></div>
                  <div><dt>Available balance</dt><dd>{availableBalance == null ? 'Unavailable' : formatCurrency(availableBalance)}</dd></div>
                  <div><dt>{side === 'buy' ? 'Maximum affordable' : 'Shares owned'}</dt><dd>{formatQuantity(side === 'buy' ? maxBuyQuantity : ownedQuantity)} shares</dd></div>
                </dl>
                <button type="submit" className={side === 'buy' ? 'market-submit-order buy' : 'market-submit-order sell'} disabled={!isQuantityValid || isLoadingBalance || isTrading || (side === 'sell' && isLoadingHoldings)}>
                  {isTrading ? 'Processing...' : `${side === 'buy' ? 'Review buy' : 'Review sell'} order`}
                </button>
              </form>
              {tradeMessage.text && <p className={tradeMessage.type === 'error' ? 'market-trade-message error' : 'market-trade-message success'} role={tradeMessage.type === 'error' ? 'alert' : 'status'}>{tradeMessage.text}</p>}
              {side === 'buy' && availableBalance == null && <p className="market-trade-message error" role="alert">{balanceError || 'Balance is unavailable.'}</p>}
              {side === 'sell' && ownedQuantity <= 0 && !isLoadingHoldings && <p className="market-trade-message error" role="status">You do not own any {selectedStock.symbol} shares.</p>}
            </div>
          ) : (
            <div className="market-empty-state"><p>Select a stock before placing an order.</p><button type="button" onClick={() => setActiveTab('quotes')}>Browse quotes</button></div>
          )
        )}

        {activeTab === 'positions' && (
          <div className="market-positions-view">
            <div className="market-pnl-summary">
              <span>Total profit / loss</span>
              <strong className={totalProfitLoss >= 0 ? 'positive' : 'negative'}>{formatCurrency(totalProfitLoss)}</strong>
              <span className={totalProfitLoss >= 0 ? 'positive' : 'negative'}>{totalProfitLossPercent.toFixed(2)}%</span>
            </div>
            {isLoadingHoldings ? <p className="market-empty-state" role="status">Loading positions...</p> : holdingsError ? <p className="market-error-state" role="alert">{holdingsError}</p> : portfolioRows.length ? (
              <div className="market-position-list">
                {portfolioRows.map((holding) => {
                  const profitLoss = holding.quantity * (holding.currentPrice - holding.averageBuyPrice)
                  const profitLossPercent = holding.averageBuyPrice ? ((holding.currentPrice - holding.averageBuyPrice) / holding.averageBuyPrice) * 100 : 0
                  return (
                    <article key={holding.symbol} className="market-position-row">
                      <div className="market-position-title"><strong>{holding.symbol}</strong><span>{holding.name}</span></div>
                      <div className="market-position-values">
                        <span>{formatQuantity(holding.quantity)} shares</span>
                        <span>Avg. {formatCurrency(holding.averageBuyPrice)}</span>
                        <span>Now {formatCurrency(holding.currentPrice)}</span>
                      </div>
                      <div className="market-position-pnl">
                        <strong className={profitLoss >= 0 ? 'positive' : 'negative'}>{formatCurrency(profitLoss)}</strong>
                        <span className={profitLoss >= 0 ? 'positive' : 'negative'}>{profitLossPercent.toFixed(2)}%</span>
                      </div>
                      <button type="button" className="market-position-close" onClick={() => closePosition(holding)} disabled={isTrading}>Close</button>
                    </article>
                  )
                })}
              </div>
            ) : <p className="market-empty-state">You have no open positions.</p>}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="market-history-view">
            <div className="market-history-filters" role="group" aria-label="Filter trade history">
              {['all', 'buy', 'sell'].map((filter) => <button key={filter} type="button" className={historyFilter === filter ? 'active' : ''} aria-pressed={historyFilter === filter} onClick={() => setHistoryFilter(filter)}>{filter === 'all' ? 'All' : filter === 'buy' ? 'Buy' : 'Sell'}</button>)}
            </div>
            {historyLoading ? <p className="market-empty-state" role="status">Loading trade history...</p> : historyError ? <p className="market-error-state" role="alert">{historyError}</p> : visibleTrades.length ? (
              <div className="market-history-list">
                {visibleTrades.map((trade, index) => (
                  <article key={`${trade.created_at}-${trade.symbol}-${index}`} className="market-history-row">
                    <div><strong>{trade.symbol}</strong><span className={trade.side?.toLowerCase() === 'buy' ? 'positive' : 'negative'}>{trade.side}</span></div>
                    <span>{formatQuantity(trade.quantity)} shares</span>
                    <span>{formatCurrency(trade.price)} / share</span>
                    <strong>{formatCurrency(trade.total)}</strong>
                    <time dateTime={trade.created_at}>{new Date(trade.created_at).toLocaleString()}</time>
                  </article>
                ))}
              </div>
            ) : <p className="market-empty-state">No trades found.</p>}
          </div>
        )}
      </div>

      {confirmation && (
        <div className="market-dialog-backdrop" role="presentation">
          <section className="market-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="market-confirmation-title" aria-describedby="market-confirmation-description">
            <p className="eyebrow">ORDER CONFIRMATION</p>
            <h3 id="market-confirmation-title">Confirm {confirmation.closePosition ? 'position close' : `${confirmation.side} order`}</h3>
            <p id="market-confirmation-description">{confirmation.side === 'buy' ? 'Buy' : 'Sell'} {formatQuantity(confirmation.quantity)} shares of {confirmation.stock.symbol} at {confirmation.stock.price} per share?</p>
            <div className="market-confirmation-actions">
              <button type="button" className="fund-back-button" onClick={() => setConfirmation(null)} disabled={isSubmitting}>Cancel</button>
              <button type="button" className={confirmation.side === 'buy' ? 'market-submit-order buy' : 'market-submit-order sell'} onClick={submitConfirmedOrder} disabled={isSubmitting}>
                {isSubmitting ? 'Processing...' : `Confirm ${confirmation.side}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default Market