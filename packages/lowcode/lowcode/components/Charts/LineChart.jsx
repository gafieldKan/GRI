import React from 'react'

/**
 * 折线图组件
 */
export function LineChart({
  data = [],
  width = 400,
  height = 300,
  title = '',
  xAxisLabel = '',
  yAxisLabel = '',
  color = '#1677ff',
  showPoint = true,
  showValue = false,
  smooth = true,
  className = '',
  style = {},
}) {
  const padding = { top: 40, right: 20, bottom: 60, left: 60 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const values = data.map((d) => d.value || 0)
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values, 0)
  const range = maxValue - minValue

  if (data.length === 0) {
    return <div className="chart-empty">暂无数据</div>
  }

  // 生成路径
  const points = data.map((item, index) => {
    const x = padding.left + (index / (data.length - 1)) * chartWidth
    const y = padding.top + chartHeight - ((item.value - minValue) / range) * chartHeight
    return { x, y, ...item }
  })

  const pathD = points
    .map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.y}`
      const prev = points[index - 1]
      if (smooth) {
        const cp1x = prev.x + (point.x - prev.x) / 2
        const cp1y = prev.y
        const cp2x = prev.x + (point.x - prev.x) / 2
        const cp2y = point.y
        return `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${point.x} ${point.y}`
      }
      return `L ${point.x} ${point.y}`
    })
    .join(' ')

  const areaD = `${pathD} L ${points[points.length - 1]?.x} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`

  return (
    <div className={`line-chart ${className}`} style={style}>
      {title && <h3 className="chart-title">{title}</h3>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + chartHeight * (1 - ratio)
          return (
            <g key={i}>
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-label">
                {Math.round(minValue + range * ratio)}
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

        {/* 区域填充 */}
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#lineGradient)" />

        {/* 折线 */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {showPoint &&
          points.map((point, index) => (
            <g key={index}>
              <circle
                cx={point.x}
                cy={point.y}
                r="4"
                fill="#fff"
                stroke={color}
                strokeWidth="2"
                className="chart-point"
              />
              {showValue && (
                <text x={point.x} y={point.y - 10} textAnchor="middle" className="chart-value">
                  {point.value}
                </text>
              )}
            </g>
          ))}

        {/* X 轴标签 */}
        {data.map((item, index) => {
          const x = padding.left + (index / (data.length - 1)) * chartWidth
          return (
            <text
              key={index}
              x={x}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="chart-axis-label"
              style={{
                transform: `rotate(-45deg)`,
                transformOrigin: `${x}px ${height - padding.bottom + 20}px`,
              }}
            >
              {item.label}
            </text>
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

export default LineChart
