import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Trigger types
export const triggerTypes = [
  { type: 'manual', label: '手动触发', icon: '🖱️', description: '用户手动点击触发' },
  { type: 'schedule', label: '定时触发', icon: '⏰', description: '按指定时间触发' },
  { type: 'webhook', label: 'Webhook', icon: '🔗', description: '通过 HTTP 请求触发' },
  { type: 'onChange', label: '数据变更', icon: '📊', description: '数据变化时触发' },
  { type: 'onCreate', label: '创建数据', icon: '➕', description: '创建数据时触发' },
  { type: 'onDelete', label: '删除数据', icon: '🗑️', description: '删除数据时触发' },
]

// Action types
export const actionTypes = [
  { type: 'createData', label: '创建数据', icon: '➕', description: '创建新的数据记录' },
  { type: 'updateData', label: '更新数据', icon: '✏️', description: '更新现有数据' },
  { type: 'deleteData', label: '删除数据', icon: '🗑️', description: '删除数据记录' },
  { type: 'sendEmail', label: '发送邮件', icon: '📧', description: '发送电子邮件' },
  { type: 'sendSms', label: '发送短信', icon: '📱', description: '发送短信' },
  { type: 'httpRequest', label: 'HTTP 请求', icon: '🌐', description: '发起 HTTP 请求' },
  { type: 'runScript', label: '执行脚本', icon: '📜', description: '执行自定义脚本' },
  { type: 'notifyUser', label: '通知用户', icon: '🔔', description: '发送用户通知' },
  { type: 'approval', label: '审批流程', icon: '✅', description: '发起审批流程' },
  { type: 'condition', label: '条件判断', icon: '❓', description: '条件分支判断' },
  { type: 'delay', label: '延时等待', icon: '⏳', description: '延时执行后续操作' },
  { type: 'loop', label: '循环操作', icon: '🔄', description: '循环执行操作' },
]

const useWorkflowStore = create(
  persist(
    (set, get) => ({
      // Workflows
      workflows: [],
      selectedWorkflow: null,

      // Trigger and action types
      triggerTypes,
      actionTypes,

      // Add workflow
      addWorkflow: (workflow) => {
        const newWorkflow = {
          id: `workflow_${Date.now()}`,
          name: workflow.name || '新工作流',
          description: workflow.description || '',
          trigger: workflow.trigger || { type: 'manual' },
          actions: workflow.actions || [],
          enabled: true,
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ workflows: [...state.workflows, newWorkflow] }))
        return newWorkflow
      },

      // Update workflow
      updateWorkflow: (id, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) => (w.id === id ? { ...w, ...updates } : w)),
        }))
      },

      // Delete workflow
      deleteWorkflow: (id) => {
        set((state) => ({
          workflows: state.workflows.filter((w) => w.id !== id),
          selectedWorkflow: state.selectedWorkflow === id ? null : state.selectedWorkflow,
        }))
      },

      // Select workflow
      selectWorkflow: (id) => {
        set({ selectedWorkflow: id })
      },

      // Add action to workflow
      addAction: (workflowId, action) => {
        const newAction = {
          id: `action_${Date.now()}`,
          order: 0,
          ...action,
        }
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId ? { ...w, actions: [...w.actions, newAction] } : w
          ),
        }))
        return newAction
      },

      // Update action
      updateAction: (workflowId, actionId, updates) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId
              ? {
                  ...w,
                  actions: w.actions.map((a) => (a.id === actionId ? { ...a, ...updates } : a)),
                }
              : w
          ),
        }))
      },

      // Delete action
      deleteAction: (workflowId, actionId) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId ? { ...w, actions: w.actions.filter((a) => a.id !== actionId) } : w
          ),
        }))
      },

      // Reorder actions
      reorderActions: (workflowId, newActions) => {
        set((state) => ({
          workflows: state.workflows.map((w) =>
            w.id === workflowId ? { ...w, actions: newActions } : w
          ),
        }))
      },

      // Get workflow by ID
      getWorkflowById: (id) => {
        return get().workflows.find((w) => w.id === id)
      },

      // Execute workflow (runtime)
      executeWorkflow: async (workflowId, context = {}) => {
        const workflow = get().getWorkflowById(workflowId)
        if (!workflow) {
          throw new Error('Workflow not found')
        }

        const results = []
        for (const action of workflow.actions) {
          try {
            // Execute action based on type
            const result = await executeAction(action, context)
            results.push({ action: action.type, result, status: 'success' })
          } catch (error) {
            results.push({ action: action.type, error: error.message, status: 'failed' })
            // Continue or stop based on error handling
            if (action.onError === 'stop') {
              break
            }
          }
        }
        return results
      },
    }),
    {
      name: 'workflow-storage',
    }
  )
)

// Action executor (simplified - in production, this would be more robust)
const executeAction = async (action, context) => {
  const { type, config } = action

  switch (type) {
    case 'createData':
      // Simulate data creation
      return { success: true, data: { id: 'new_id', ...config } }
    case 'updateData':
      return { success: true, updated: config }
    case 'deleteData':
      return { success: true, deleted: config.id }
    case 'httpRequest':
      // Simulate HTTP request
      return { success: true, status: 200, data: { message: 'OK' } }
    case 'sendEmail':
      return { success: true, messageId: `msg_${Date.now()}` }
    case 'delay':
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true }), config?.delay || 1000)
      })
    case 'runScript':
      // Note: In production, use a sandboxed environment
      return { success: true, result: 'Script executed' }
    default:
      return { success: true, message: 'Action executed' }
  }
}

export default useWorkflowStore
