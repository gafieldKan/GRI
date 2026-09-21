import React, { useState, useMemo } from 'react'
import { Collapse, Button, Input, Empty, Badge } from 'antd'
import { DragOutlined, PlusOutlined, SearchOutlined, AppstoreOutlined, FormOutlined, TableOutlined, AlertOutlined, CompassOutlined } from '@ant-design/icons'
import useEditorStore from '../../store/editorStore'
import './styles.css'

const { Panel } = Collapse

// 分类图标映射
const categoryIcons = {
  '基础组件': AppstoreOutlined,
  '展示组件': FormOutlined,
  '布局组件': TableOutlined,
  '表单组件': FormOutlined,
  '反馈组件': AlertOutlined,
  '导航组件': CompassOutlined,
}

const ComponentPalette = ({ searchTerm = '', onComponentAdd }) => {
  const { componentTypes, addComponent } = useEditorStore()
  const [expandedKeys, setExpandedKeys] = useState(['基础组件', '展示组件', '布局组件', '表单组件', '反馈组件', '导航组件'])

  // 按分类组织组件
  const groupedComponents = useMemo(() => {
    const filtered = componentTypes.filter(
      (comp) =>
        searchTerm === '' ||
        comp.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        comp.category.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return filtered.reduce((acc, comp) => {
      if (!acc[comp.category]) {
        acc[comp.category] = []
      }
      acc[comp.category].push(comp)
      return acc
    }, {})
  }, [componentTypes, searchTerm])

  const handleDragStart = (e, comp) => {
    e.dataTransfer.setData('componentType', comp.type)
    e.dataTransfer.setData('label', comp.label)
    e.dataTransfer.setData('category', comp.category)
  }

  const handleAddClick = (component) => {
    if (addComponent) {
      addComponent(component)
    }
  }

  // 构建分类面板
  const collapseItems = Object.entries(groupedComponents).map(
    ([category, components]) => {
      const IconComponent = categoryIcons[category] || AppstoreOutlined
      return {
        key: category,
        header: (
          <div className="category-header">
            <IconComponent style={{ marginRight: 8 }} />
            <span>{category}</span>
            <Badge count={components.length} size="small" />
          </div>
        ),
        children: (
          <div className="component-list">
            {components.map((comp) => (
              <div
                key={comp.type}
                className="component-item"
                draggable
                onDragStart={(e) => handleDragStart(e, comp)}
              >
                <div className="component-drag-handle">
                  <DragOutlined />
                </div>
                <div className="component-info">
                  <span className="component-name">{comp.label}</span>
                  <span className="component-type">{comp.type}</span>
                </div>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  className="add-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddClick({ type: comp.type, label: comp.label, category: comp.category })
                  }}
                  title={`添加${comp.label}`}
                />
              </div>
            ))}
          </div>
        ),
      }
    }
  )

  return (
    <div className="component-palette">
      <div className="palette-card">
        {/* 组件列表 */}
        {Object.keys(groupedComponents).length > 0 ? (
          <Collapse
            activeKey={expandedKeys}
            onChange={(keys) => setExpandedKeys(keys)}
            items={collapseItems}
            variant="borderless"
            accordion={false}
          />
        ) : (
          <div className="palette-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组件" />
          </div>
        )}
      </div>
    </div>
  )
}

export default ComponentPalette
