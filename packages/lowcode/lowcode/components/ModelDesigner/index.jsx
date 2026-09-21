import React from 'react'
import { Layout, Tabs } from 'antd'
import SchemaEditor from './SchemaEditor'
import AutoFormGenerator from './AutoFormGenerator'

const { Content } = Layout

const ModelDesigner = () => {
  return (
    <Layout style={{ height: '100vh', background: '#f0f2f5' }}>
      <Content style={{ padding: 24, overflow: 'auto' }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 4 }}>
          <h1 style={{ marginBottom: 24 }}>数据模型设计器</h1>
          <Tabs
            items={[
              {
                key: 'schema',
                label: '模型设计',
                children: <SchemaEditor />,
              },
              {
                key: 'form',
                label: '表单生成',
                children: <AutoFormGenerator />,
              },
            ]}
            defaultActiveKey="schema"
          />
        </div>
      </Content>
    </Layout>
  )
}

export default ModelDesigner
