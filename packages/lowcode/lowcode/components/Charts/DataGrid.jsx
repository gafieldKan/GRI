import React, { useState, useMemo } from 'react'
import './DataGrid.css'

/**
 * 数据表格组件
 * 支持排序、筛选、分页
 */
export function DataGrid({
  data = [],
  columns = [],
  title = '',
  sortable = true,
  filterable = false,
  pagination = true,
  pageSize: propPageSize = 10,
  onSelect,
  className = '',
  style = {},
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [filters, setFilters] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState([])

  // 筛选
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      for (const key in filters) {
        if (filters[key] && !String(row[key]).includes(filters[key])) {
          return false
        }
      }
      return true
    })
  }, [data, filters])

  // 排序
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData

    const sorted = [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key]
      const bVal = b[sortConfig.key]

      if (aVal === bVal) return 0
      if (sortConfig.direction === 'asc') {
        return aVal < bVal ? -1 : 1
      }
      return aVal > bVal ? -1 : 1
    })

    return sorted
  }, [filteredData, sortConfig])

  // 分页
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData
    const start = (currentPage - 1) * propPageSize
    return sortedData.slice(start, start + propPageSize)
  }, [sortedData, currentPage, propPageSize, pagination])

  const totalPages = Math.ceil(sortedData.length / propPageSize)

  const handleSort = (key) => {
    if (!sortable) return
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  const handleFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

  const handleSelect = (row, index) => {
    const isSelected = selectedRows.includes(index)
    const newSelected = isSelected
      ? selectedRows.filter((i) => i !== index)
      : [...selectedRows, index]

    setSelectedRows(newSelected)
    onSelect?.(row, !isSelected)
  }

  const handleSelectAll = () => {
    if (selectedRows.length === paginatedData.length) {
      setSelectedRows([])
      onSelect?.(null, false)
    } else {
      setSelectedRows(paginatedData.map((_, i) => i))
      onSelect?.(null, true)
    }
  }

  return (
    <div className={`data-grid ${className}`} style={style}>
      {title && <h3 className="data-grid-title">{title}</h3>}

      <div className="data-grid-wrapper">
        <table className="data-grid-table">
          <thead>
            <tr>
              {onSelect && (
                <th className="data-grid-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === paginatedData.length}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={{
                    'data-grid-th': true,
                    sortable: sortable && col.sortable !== false,
                    [sortConfig.direction]: sortConfig.key === col.key,
                  }}
                  onClick={() => handleSort(col.key)}
                  style={{ width: col.width, textAlign: col.align || 'left' }}
                >
                  <div className="th-content">
                    {col.title}
                    {sortable && col.sortable !== false && (
                      <span className="sort-icon">
                        {sortConfig.key === col.key
                          ? sortConfig.direction === 'asc'
                            ? '↑'
                            : '↓'
                          : '↕'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
            {filterable && (
              <tr>
                <th />
                {columns.map((col) => (
                  <th key={col.key}>
                    {col.filterable && (
                      <input
                        type="text"
                        placeholder={`筛选${col.title}`}
                        value={filters[col.key] || ''}
                        onChange={(e) => handleFilter(col.key, e.target.value)}
                        className="filter-input"
                      />
                    )}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {paginatedData.map((row, index) => (
              <tr
                key={index}
                className={{
                  'data-grid-tr': true,
                  selected: selectedRows.includes(index),
                }}
              >
                {onSelect && (
                  <td className="data-grid-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRows.includes(index)}
                      onChange={() => handleSelect(row, index)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                    {col.render ? col.render(row[col.key], row, index) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedData.length === 0 && <div className="data-grid-empty">暂无数据</div>}
      </div>

      {pagination && totalPages > 1 && (
        <div className="data-grid-pagination">
          <span className="pagination-total">共 {sortedData.length} 条</span>
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
            className="pagination-btn"
          >
            首页
          </button>
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
            className="pagination-btn"
          >
            上一页
          </button>
          <span className="pagination-current">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="pagination-btn"
          >
            下一页
          </button>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="pagination-btn"
          >
            末页
          </button>
        </div>
      )}
    </div>
  )
}

export default DataGrid
