import React, { useState } from 'react'

/**
 * 饼图组件
 */
export function PieChart({
  data = [],
  width = 400,
  height = 400,
  title = '',
  colors = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'],
  showLabel = true,
  showValue = true,
  showPercent = true,
  innerRadius = 0,
  className = '',
  style = {},
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const total = data.reduce((sum, item) => sum + (item.value || 0), 0)
  const centerX = width / 2
  const centerY = height / 2
  const radius = Math.min(width, height) / 2 - 40

  if (data.length === 0) {
    return <div className="chart-empty">暂无数据</div>
  }

  // 使用 reduce 累积计算角度，避免在 render 中修改变量
  let runningAngle = -Math.PI / 2
  const slices = data.map((item, index) => {
    const angle = (item.value / total) * 2 * Math.PI
    const startAngle = runningAngle
    runningAngle += angle
    const endAngle = runningAngle

    const x1 = centerX + radius * Math.cos(startAngle)
    const y1 = centerY + radius * Math.sin(startAngle)
    const x2 = centerX + radius * Math.cos(endAngle)
    const y2 = centerY + radius * Math.sin(endAngle)

    const largeArcFlag = angle > Math.PI ? 1 : 0

    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      'Z',
    ].join(' ')

    // 扇形中心点（用于标签位置）
    const midAngle = startAngle + angle / 2
    const labelX = centerX + (radius + 20) * Math.cos(midAngle)
    const labelY = centerY + (radius + 20) * Math.sin(midAngle)

    return {
      path: pathData,
      color: item.color || colors[index % colors.length],
      label: item.label,
      value: item.value,
      percent: ((item.value / total) * 100).toFixed(1),
      labelX,
      labelY,
    }
  })

  // 内环路径（甜甜圈图）
  const createInnerCircle = () => {
    if (innerRadius <= 0) return null
    return <circle cx={centerX} cy={centerY} r={radius * innerRadius} fill="#fff" />
  }

  return (
    <div className={`pie-chart ${className}`} style={style}>
      {title && <h3 className="chart-title">{title}</h3>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* 饼图片 */}
        {slices.map((slice, index) => (
          <g
            key={index}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <path
              d={slice.path}
              fill={slice.color}
              stroke="#fff"
              strokeWidth="2"
              className="pie-slice"
              style={{
                transform: hoveredIndex === index ? 'scale(1.05)' : 'scale(1)',
                transformOrigin: `${centerX}px ${centerY}px`,
                transition: 'transform 0.2s',
                cursor: 'pointer',
              }}
            />
          </g>
        ))}

        {/* 标签 */}
        {showLabel &&
          slices.map((slice, index) => {
            const textAnchor = slice.labelX > centerX ? 'start' : 'end'
            return (
              <g key={`label-${index}`}>
                <text
                  x={slice.labelX}
                  y={slice.labelY}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  className="chart-label"
                  fontSize="12"
                  fill="#666"
                >
                  {slice.label}
                  {showValue && `: ${slice.value}`}
                  {showPercent && ` (${slice.percent}%)`}
                </text>
              </g>
            )
          })}

        {/* 中心文字（甜甜圈图） */}
        {innerRadius > 0 && (
          <text
            x={centerX}
            y={centerY}
            textAnchor="middle"
            dominantBaseline="middle"
            className="chart-label"
            fontSize="16"
            fontWeight="600"
          >
            总计：{total}
          </text>
        )}
      </svg>

      {/* 图例 */}
      <div className="chart-legend">
        {slices.map((slice, index) => (
          <div key={index} className="legend-item">
            <span className="legend-color" style={{ background: slice.color }} />
            <span className="legend-label">{slice.label}</span>
            <span className="legend-value">
              {slice.value} ({slice.percent}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PieChart
