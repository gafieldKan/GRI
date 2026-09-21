import React, { useState } from 'react'

export default function DataSourceConfig({ onConfig }) {
  const [url, setUrl] = useState('')
  return (
    <div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="请输入 API 地址"
      />
      <button onClick={() => onConfig && onConfig(url)}>保存数据源</button>
    </div>
  )
}

export { default as DataSourceForm } from './DataSourceForm.jsx'
export { default as DataSourceList } from './DataSourceList.jsx'
export { DataSourceType, DataSourceState } from '../../engine/DataSourceManager.js'
