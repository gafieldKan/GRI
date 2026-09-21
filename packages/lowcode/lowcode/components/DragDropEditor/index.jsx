import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Layout, Button, Input, Tooltip, Empty, Space, Divider } from 'antd'
import {
  SearchOutlined,
  EyeOutlined,
  CodeOutlined,
  ClearOutlined,
  SaveOutlined,
  DownloadOutlined,
  UploadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CopyOutlined,
  DeleteOutlined,
  CheckOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import ComponentPalette from './ComponentPalette'
import PropertiesPanel from './PropertiesPanel'
import ComponentTree from './ComponentTree'
import DraggableComponent from './DraggableComponent'
import useEditorStore from '../../store/editorStore'
import './styles.css'

export default function DragDropEditor() {
  const store = useEditorStore()
  const {
    components,
    selectedComponent,
    selectComponent,
    removeComponent,
    clearCanvas,
    addComponent,
    duplicateComponent,
    moveComponent,
  } = store

  const [previewMode, setPreviewMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showGrid, setShowGrid] = useState(true)
  const [layoutMode, setLayoutMode] = useState('list') // 'list' | 'free'
  const canvasContentRef = useRef(null)
  const canvasRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const componentType = e.dataTransfer.getData('componentType')
    const label = e.dataTransfer.getData('label')
    const category = e.dataTransfer.getData('category')

    if (componentType && label) {
      addComponent({ type: componentType, label, category: category || '基础组件' })
    }
  }, [addComponent])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDeleteSelected = useCallback(() => {
    if (selectedComponent) {
      removeComponent(selectedComponent)
    }
  }, [selectedComponent, removeComponent])

  const handleDuplicateSelected = useCallback(() => {
    if (selectedComponent) {
      duplicateComponent(selectedComponent)
    }
  }, [selectedComponent, duplicateComponent])

  const handleMoveComponent = useCallback((direction) => {
    if (selectedComponent) {
      moveComponent(selectedComponent, direction)
    }
  }, [selectedComponent, moveComponent])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedComponent) {
        handleDeleteSelected()
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault()
          // 保存功能
        }
        if (e.key === 'd' && selectedComponent) {
          e.preventDefault()
          handleDuplicateSelected()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedComponent, handleDeleteSelected, handleDuplicateSelected])

  return (
    <div className="designer-container-wrapper">
      {/* 主体区域：左中右三栏 */}
      <div className="designer-body">
        {/* 左侧：组件库 */}
        <div className="designer-sidebar-left" style={{ width: 260, flexShrink: 0 }}>
          <ComponentPalette searchTerm={searchTerm} />
        </div>

        {/* 中间：画布区域 */}
        <div className="designer-content">
          <div className={`canvas-wrapper ${showGrid ? 'canvas-grid' : ''}`}>
            {/* 画布工具栏 */}
            <div className="canvas-toolbar">
              <Space size="small">
                <Tooltip title="上移">
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    disabled={!selectedComponent}
                    onClick={() => handleMoveComponent('up')}
                  />
                </Tooltip>
                <Tooltip title="下移">
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    disabled={!selectedComponent}
                    onClick={() => handleMoveComponent('down')}
                  />
                </Tooltip>
                <Divider orientation="vertical" />
                <Tooltip title="复制 (Ctrl+D)">
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    disabled={!selectedComponent}
                    onClick={handleDuplicateSelected}
                  />
                </Tooltip>
                <Tooltip title="删除 (Delete)">
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!selectedComponent}
                    onClick={handleDeleteSelected}
                  />
                </Tooltip>
              </Space>
            </div>

            {/* 画布内容区 */}
            <div
              className={`canvas-area ${components.length === 0 ? 'canvas-empty' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {components.length === 0 ? (
                <div className="canvas-placeholder">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="拖拽组件到此处，或点击左侧组件的添加按钮"
                  />
                </div>
              ) : (
                <div className={`canvas-content ${layoutMode === 'free' ? 'canvas-free-mode' : ''}`} ref={canvasContentRef}>
                  {components.map((comp, index) => (
                    <DraggableComponent
                      key={comp.id}
                      component={comp}
                      index={index}
                      total={components.length}
                      isSelected={selectedComponent === comp.id}
                      onSelect={() => selectComponent(comp.id)}
                      onRemove={() => removeComponent(comp.id)}
                      onDuplicate={() => duplicateComponent(comp.id)}
                      onMove={(direction) => moveComponent(comp.id, direction)}
                      previewMode={previewMode}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：组件树和属性面板 */}
        <div className="designer-sidebar-right" style={{ width: 280, flexShrink: 0 }}>
          <div className="right-sidebar-content">
            <div className="right-panel">
              <ComponentTree />
            </div>
            <div className="right-panel properties-panel-wrapper">
              <PropertiesPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
