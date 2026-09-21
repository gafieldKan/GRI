/**
 * 审批工作流节点插件示例
 * 演示如何扩展一个审批节点类型
 */

import { registerPlugin, PluginType } from '../../core/PluginRegistry'

// 注册审批节点插件
registerPlugin({
  name: 'workflow-approval-node',
  type: PluginType.WORKFLOW_NODE,
  version: '1.0.0',
  description: '审批节点插件，支持多级审批和会签',
  author: 'Awesome Lowcode Team',

  config: {
    maxApprovers: 10,
    defaultTimeout: 86400000, // 24 小时
  },

  async init() {
    console.log('[WorkflowApprovalNode] 初始化')
    this.nodeTypes = ['approval', 'cc', 'condition']
  },

  // 获取审批节点配置
  getNodeConfig(nodeType) {
    return {
      type: nodeType,
      label: nodeType === 'approval' ? '审批' : '抄送',
      icon: 'approval',
      form: {
        approvers: [],
        approveType: 'or', // or=或签，and=会签
        timeout: this.config.defaultTimeout,
        selfApprove: false,
      },
    }
  },

  // 执行审批节点
  async execute(context) {
    const { nodeId, approvers, approveType } = context

    console.log(`[WorkflowApprovalNode] 执行审批节点：${nodeId}`)

    // 等待审批
    return new Promise((resolve, reject) => {
      // 这里应该调用实际的审批接口
      // 实际实现应该与后端服务集成
      console.log('等待审批...')

      // 模拟审批
      setTimeout(() => {
        resolve({ status: 'approved', approver: 'admin', time: Date.now() })
      }, 1000)
    })
  },

  // 验证审批配置
  validateConfig(config) {
    const errors = []

    if (!config.approvers || config.approvers.length === 0) {
      errors.push('至少需要一个审批人')
    }

    if (config.approvers.length > this.config.maxApprovers) {
      errors.push(`审批人不能超过 ${this.config.maxApprovers} 人`)
    }

    return errors
  },

  async onLoad(context) {
    console.log('[WorkflowApprovalNode] 加载', context)
  },

  async onSave(data) {
    console.log('[WorkflowApprovalNode] 保存数据', data)
  },

  async onDestroy() {
    console.log('[WorkflowApprovalNode] 销毁')
    this.nodeTypes = undefined
  },
})

// 导出 React 组件
export const ApprovalNode = ({ config, onComplete }) => {
  return null // 实际实现应该渲染审批节点 UI
}

export default ApprovalNode
