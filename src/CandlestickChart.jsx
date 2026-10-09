import { useEffect, useRef } from 'react'
import { CandlestickSeries, createChart, ColorType } from 'lightweight-charts'

function CandlestickChart({ data, stockName }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const styles = getComputedStyle(document.documentElement)
    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      layout: {
        background: { type: ColorType.Solid, color: styles.getPropertyValue('--surface').trim() },
        textColor: styles.getPropertyValue('--muted').trim(),
      },
      grid: {
        vertLines: { color: styles.getPropertyValue('--border').trim() },
        horzLines: { color: styles.getPropertyValue('--border').trim() },
      },
      rightPriceScale: { borderColor: styles.getPropertyValue('--border').trim() },
      timeScale: { borderColor: styles.getPropertyValue('--border').trim() },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: styles.getPropertyValue('--green').trim(),
      downColor: styles.getPropertyValue('--red').trim(),
      borderVisible: false,
      wickUpColor: styles.getPropertyValue('--green').trim(),
      wickDownColor: styles.getPropertyValue('--red').trim(),
    })

    series.setData(data)
    chart.timeScale().fitContent()

    const resizeObserver = new ResizeObserver(([entry]) => {
      chart.applyOptions({
        width: Math.max(Math.floor(entry.contentRect.width), 1),
        height: Math.max(Math.floor(entry.contentRect.height), 1),
      })
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chart.remove()
    }
  }, [data])

  return (
    <div
      ref={containerRef}
      className="chart-canvas candlestick-canvas"
      role="img"
      aria-label={`${stockName} 30-day candlestick price chart`}
    />
  )
}

export default CandlestickChart