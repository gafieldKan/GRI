import React from 'react'
import './index.css'

/**
 * 柱状图组件
 * 支持垂直和水平柱状图
 */
export function BarChart({
  data = [],
  width = 400,
  height = 300,
  title = '',
  xAxisLabel = '',
  yAxisLabel = '',
  color = '#1677ff',
  horizontal = false,
  showValue = true,
  className = '',
  style = {},
}) {
  const maxValue = Math.max(...data.map((d) => d.value || 0), 1)
  const padding = { top: 40, right: 20, bottom: 60, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const barWidth = chartWidth / data.length - 10

  if (data.length === 0) {
    return <div className="chart-empty">暂无数据</div>
  }

  return (
    <div className={`bar-chart ${className}`} style={style}>
      {title && <h3 className="chart-title">{title}</h3>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Y 轴 */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#e5e7eb"
          strokeWidth="1"
        />

        {/* X 轴 */}
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#e5e7eb"
          strokeWidth="1"
        />

        {/* Y 轴标签 */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const value = Math.round(maxValue * ratio)
          const y = height - padding.bottom - chartHeight * ratio
          return (
            <g key={i}>
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-label">
                {value}
              </text>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f0f0f0"
                strokeDasharray="4,4"
              />
            </g>
          )
        })}

        {/* 柱状图条 */}
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * chartHeight
          const x =
            padding.left +
            index * (chartWidth / data.length) +
            (chartWidth / data.length - barWidth) / 2
          const y = height - padding.bottom - barHeight

          return (
            <g key={index}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color || color}
                rx="4"
                className="chart-bar"
              />
              {showValue && (
                <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" className="chart-value">
                  {item.value}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="chart-axis-label"
                style={{
                  transform: 'rotate(-45deg)',
                  transformOrigin: `${x + barWidth / 2}px ${height - padding.bottom + 20}px`,
                }}
              >
                {item.label}
              </text>
            </g>
          )
        })}

        {/* 轴标签 */}
        {xAxisLabel && (
          <text x={width / 2} y={height - 20} textAnchor="middle" className="chart-axis-title">
            {xAxisLabel}
          </text>
        )}
        {yAxisLabel && (
          <text
            x={20}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${height / 2})`}
            className="chart-axis-title"
          >
            {yAxisLabel}
          </text>
        )}
      </svg>
    </div>
  )
}

/**
 * 水平柱状图组件
 */
export function HorizontalBarChart({
  data = [],
  width = 400,
  height = 300,
  title = '',
  color = '#1677ff',
  showValue = true,
  className = '',
  style = {},
}) {
  const maxValue = Math.max(...data.map((d) => d.value || 0), 1)
  const padding = { top: 20, right: 100, bottom: 20, left: 100 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const barHeight = Math.min(30, (chartHeight - 20) / data.length)
  const barGap = (chartHeight - barHeight * data.length) / (data.length + 1)

  if (data.length === 0) {
    return <div className="chart-empty">暂无数据</div>
  }

  return (
    <div className={`horizontal-bar-chart ${className}`} style={style}>
      {title && <h3 className="chart-title">{title}</h3>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {data.map((item, index) => {
          const barWidth = (item.value / maxValue) * chartWidth
          const y = padding.top + barHeight / 2 + index * (barHeight + barGap)

          return (
            <g key={index}>
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-label">
                {item.label}
              </text>
              <rect
                x={padding.left}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={item.color || color}
                rx="4"
                className="chart-bar"
              />
              {showValue && (
                <text
                  x={padding.left + barWidth + 8}
                  y={y + barHeight / 2 + 4}
                  className="chart-value"
                >
                  {item.value}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default { BarChart, HorizontalBarChart }
