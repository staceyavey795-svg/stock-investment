import { useState } from 'react'

function formatCurrency(value) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function Portfolio({ holdings, onSell, onStockSelect }) {
  const [sellingSymbol, setSellingSymbol] = useState(null)
  const [sharesToSell, setSharesToSell] = useState('')

  const totalPortfolioValue = holdings.reduce(
    (total, holding) => total + holding.quantity * holding.currentPrice,
    0,
  )

  const openSellForm = (symbol) => {
    setSellingSymbol(symbol)
    setSharesToSell('')
  }

  const closeSellForm = () => {
    setSellingSymbol(null)
    setSharesToSell('')
  }

  const submitSell = (event, holding) => {
    event.preventDefault()
    const shares = Number(sharesToSell)
    if (shares <= 0 || shares > holding.quantity) return

    onSell(holding.symbol, shares)
    closeSellForm()
  }

  return (
    <section className="portfolio-section" aria-labelledby="portfolio-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR INVESTMENTS</p>
          <h2 id="portfolio-heading">Portfolio</h2>
        </div>
        <div className="portfolio-total">
          <span>Total portfolio value</span>
          <strong>{formatCurrency(totalPortfolioValue)}</strong>
        </div>
      </div>

      {holdings.length > 0 ? (
        <div className="portfolio-list">
          <div className="portfolio-table-header" aria-hidden="true">
            <span>Stock</span>
            <span>Quantity</span>
            <span>Avg. buy price</span>
            <span>Current value</span>
            <span>Action</span>
          </div>
          {holdings.map((holding) => (
            <div key={holding.symbol} className="portfolio-entry">
              <article
                className="portfolio-row"
                role="group"
                tabIndex={0}
                aria-label={`Open details for ${holding.name}`}
                onClick={(event) => {
                  if (event.target.closest('button, form, input, label')) return
                  onStockSelect(holding.symbol)
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
                  event.preventDefault()
                  onStockSelect(holding.symbol)
                }}
              >
                <div className="stock-identity">
                  <span className="stock-symbol">{holding.symbol}</span>
                  <button type="button" className="stock-name stock-name-button" onClick={() => onStockSelect(holding.symbol)}>
                    {holding.name}
                  </button>
                </div>
                <span>{holding.quantity.toFixed(4)}</span>
                <span>{formatCurrency(holding.averageBuyPrice)}</span>
                <strong>{formatCurrency(holding.quantity * holding.currentPrice)}</strong>
                <button
                  type="button"
                  className="sell-button"
                  onClick={() => (sellingSymbol === holding.symbol ? closeSellForm() : openSellForm(holding.symbol))}
                >
                  {sellingSymbol === holding.symbol ? 'Close' : 'Sell'}
                </button>
              </article>
              {sellingSymbol === holding.symbol && (
                <form className="sell-form" onSubmit={(event) => submitSell(event, holding)}>
                  <label htmlFor={`sell-${holding.symbol}`}>How many shares do you want to sell?</label>
                  <div className="sell-form-controls">
                    <input
                      id={`sell-${holding.symbol}`}
                      type="number"
                      min="0.0001"
                      max={holding.quantity}
                      step="0.0001"
                      placeholder="0.0000"
                      value={sharesToSell}
                      onChange={(event) => setSharesToSell(event.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="confirm-button" disabled={!sharesToSell || Number(sharesToSell) <= 0 || Number(sharesToSell) > holding.quantity}>
                      Confirm sell
                    </button>
                  </div>
                  <p className="sell-limit">Maximum: {holding.quantity.toFixed(4)} shares. Proceeds: {formatCurrency((Number(sharesToSell) || 0) * holding.currentPrice)}.</p>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">Your confirmed purchases will appear here.</p>
      )}
    </section>
  )
}

export default Portfolio
