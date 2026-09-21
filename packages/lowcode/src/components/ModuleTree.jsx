/**
 * 模块树展示组件
 * 展示 GRI 平台的完整模块层级结构
 */

import React, { useState, useEffect } from 'react'
import { Tree, Card, Tag, Space, Typography, Spin, Alert } from 'antd'

const { Title, Text } = Typography

/**
 * 模块树展示组件
 */
export function ModuleTree() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadModules()
  }, [])

  const loadModules = async () => {
    setLoading(true)
    try {
      const { moduleManager } = await import('../../lowcode/core/ModuleManager')
      const moduleTree = moduleManager.getModuleTree()
      setModules(moduleTree)
    } catch (err) {
      setError(err.message)
      console.error('加载模块树失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const buildTreeData = (moduleList) => {
    return moduleList.map((module) => ({
      title: (
        <Space direction="vertical" size={0}>
          <Space>
            <Text strong>{module.name}</Text>
            <Tag color={getModuleColor(module.level)}>{getLevelName(module.level)}</Tag>
            {module.industryCode && <Tag color="blue">{module.industryCode}</Tag>}
          </Space>
          {module.path && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {module.path}
            </Text>
          )}
        </Space>
      ),
      key: module.id,
      children: module.children ? buildTreeData(module.children) : [],
    }))
  }

  const getLevelName = (level) => {
    const names = {
      1: '行业维度',
      2: '功能维度',
      3: '服务模式',
      4: '应用',
    }
    return names[level] || ''
  }

  const getModuleColor = (level) => {
    const colors = {
      1: 'orange',
      2: 'green',
      3: 'blue',
      4: 'purple',
    }
    return colors[level] || 'default'
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>加载模块树...</div>
      </div>
    )
  }

  if (error) {
    return <Alert message="加载失败" description={error} type="error" showIcon />
  }

  const treeData = buildTreeData(modules)

  return (
    <Card title="GRI 模块架构" style={{ width: '100%' }}>
      <Alert
        message="模块层级说明"
        description="一级模块 = 行业维度 (ISIC 分类) → 二级模块 = 功能维度 → 三级模块 = 服务模式 → 末端 = 具体应用"
        type="info"
        style={{ marginBottom: 16 }}
      />
      <Tree defaultExpandAll treeData={treeData} showLine style={{ marginTop: 16 }} />
    </Card>
  )
}

export default ModuleTree
