import React from 'react'
import { Tree, Empty, Button } from 'antd'
import { DeleteOutlined, SettingOutlined } from '@ant-design/icons'
import useEditorStore from '../../store/editorStore'
import './styles.css'

const ComponentTree = () => {
  const { components, selectComponent, selectedComponent, removeComponent } = useEditorStore()

  const treeData = components.map((comp) => ({
    title: (
      <div className="tree-node-content">
        <span className="tree-node-label">{comp.label || comp.type}</span>
        <span className="tree-node-type">{comp.type}</span>
        <div className="tree-node-actions">
          <Button
            type="text"
            size="small"
            icon={<SettingOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              selectComponent(comp.id)
            }}
            title="选择"
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              removeComponent(comp.id)
            }}
            title="删除"
          />
        </div>
      </div>
    ),
    key: comp.id,
    icon: null,
  }))

  return (
    <div className="component-tree-wrapper">
      <h4 className="panel-title">组件树</h4>
      {components.length > 0 ? (
        <Tree
          treeData={treeData}
          selectedKeys={[selectedComponent]}
          onSelect={(keys) => selectComponent(keys[0])}
          showIcon={false}
          blockNode
        />
      ) : (
        <div className="tree-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无组件" style={{ transform: 'scale(0.8)' }} />
        </div>
      )}
    </div>
  )
}

export default ComponentTree
