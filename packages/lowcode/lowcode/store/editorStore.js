import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useEditorStore = create(
  persist(
    (set, get) => ({
      // Canvas components
      components: [],

      // Selected component
      selectedComponent: null,

      // Available component types - 扩展的组件库
      componentTypes: [
        // 基础组件
        { type: 'Input', label: '输入框', category: '基础组件', icon: 'input' },
        { type: 'TextArea', label: '多行输入', category: '基础组件', icon: 'textarea' },
        { type: 'NumberInput', label: '数字输入', category: '基础组件', icon: 'number' },
        { type: 'Password', label: '密码输入', category: '基础组件', icon: 'lock' },
        { type: 'Button', label: '按钮', category: '基础组件', icon: 'button' },
        { type: 'Select', label: '下拉选择', category: '基础组件', icon: 'select' },
        { type: 'Radio', label: '单选框', category: '基础组件', icon: 'radio' },
        { type: 'Checkbox', label: '复选框', category: '基础组件', icon: 'checkbox' },
        { type: 'Switch', label: '开关', category: '基础组件', icon: 'switch' },
        { type: 'Slider', label: '滑块', category: '基础组件', icon: 'slider' },

        // 展示组件
        { type: 'Text', label: '文本', category: '展示组件', icon: 'text' },
        { type: 'Title', label: '标题', category: '展示组件', icon: 'title' },
        { type: 'Paragraph', label: '段落', category: '展示组件', icon: 'paragraph' },
        { type: 'Image', label: '图片', category: '展示组件', icon: 'image' },
        { type: 'Avatar', label: '头像', category: '展示组件', icon: 'avatar' },
        { type: 'Table', label: '表格', category: '展示组件', icon: 'table' },
        { type: 'List', label: '列表', category: '展示组件', icon: 'list' },
        { type: 'Descriptions', label: '描述列表', category: '展示组件', icon: 'descriptions' },
        { type: 'Statistic', label: '统计数值', category: '展示组件', icon: 'statistic' },
        { type: 'Progress', label: '进度条', category: '展示组件', icon: 'progress' },

        // 布局组件
        { type: 'Card', label: '卡片', category: '布局组件', icon: 'card' },
        { type: 'Divider', label: '分割线', category: '布局组件', icon: 'divider' },
        { type: 'Collapse', label: '折叠面板', category: '布局组件', icon: 'collapse' },
        { type: 'Tabs', label: '标签页', category: '布局组件', icon: 'tabs' },
        { type: 'Space', label: '间距', category: '布局组件', icon: 'space' },
        { type: 'Grid', label: '网格', category: '布局组件', icon: 'grid' },

        // 表单组件
        { type: 'DatePicker', label: '日期选择', category: '表单组件', icon: 'date' },
        { type: 'TimePicker', label: '时间选择', category: '表单组件', icon: 'time' },
        { type: 'Cascader', label: '级联选择', category: '表单组件', icon: 'cascader' },
        { type: 'TreeSelect', label: '树选择', category: '表单组件', icon: 'tree' },
        { type: 'Transfer', label: '穿梭框', category: '表单组件', icon: 'transfer' },
        { type: 'Rate', label: '评分', category: '表单组件', icon: 'rate' },
        { type: 'Upload', label: '上传', category: '表单组件', icon: 'upload' },

        // 反馈组件
        { type: 'Alert', label: '警告提示', category: '反馈组件', icon: 'alert' },
        { type: 'Message', label: '全局提示', category: '反馈组件', icon: 'message' },
        { type: 'Modal', label: '对话框', category: '反馈组件', icon: 'modal' },
        { type: 'Tag', label: '标签', category: '反馈组件', icon: 'tag' },
        { type: 'Badge', label: '徽章', category: '反馈组件', icon: 'badge' },

        // 导航组件
        { type: 'Menu', label: '导航菜单', category: '导航组件', icon: 'menu' },
        { type: 'Steps', label: '步骤条', category: '导航组件', icon: 'steps' },
        { type: 'Breadcrumb', label: '面包屑', category: '导航组件', icon: 'breadcrumb' },
        { type: 'Pagination', label: '分页', category: '导航组件', icon: 'pagination' },
      ],

      // Actions
  addComponent: (component, position) => {
        const newComponent = {
          ...component,
          id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          props: component.props || {},
          settings: {
            visible: true,
            required: false,
            disabled: false,
            hidden: false,
          },
    x: position?.x ?? 0,
    y: position?.y ?? 0,
        }
        // 使用 get().components 确保获取最新状态
        const currentComponents = get().components
        set({
          components: [...currentComponents, newComponent],
          selectedComponent: newComponent.id,
        })
        return newComponent
      },

      duplicateComponent: (id) => {
        const componentToDuplicate = get().components.find((c) => c.id === id)
        if (componentToDuplicate) {
          const duplicatedComponent = {
            ...componentToDuplicate,
            id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            label: `${componentToDuplicate.label} (复制)`,
          }
          const index = get().components.findIndex((c) => c.id === id)
          set((state) => ({
            components: [
              ...state.components.slice(0, index + 1),
              duplicatedComponent,
              ...state.components.slice(index + 1),
            ],
            selectedComponent: duplicatedComponent.id,
          }))
        }
      },

      removeComponent: (id) => {
        set((state) => ({
          components: state.components.filter((comp) => comp.id !== id),
          selectedComponent:
            state.selectedComponent === id ? null : state.selectedComponent,
        }))
      },

      updateComponent: (id, updates) => {
        set((state) => ({
          components: state.components.map((comp) =>
            comp.id === id ? { ...comp, ...updates } : comp
          ),
        }))
      },

      selectComponent: (id) => {
        set({ selectedComponent: id })
      },

      moveComponent: (id, direction) => {
        const components = get().components
        const index = components.findIndex((c) => c.id === id)
        if (index === -1) return

        let newIndex = index
        if (direction === 'up' && index > 0) {
          newIndex = index - 1
        } else if (direction === 'down' && index < components.length - 1) {
          newIndex = index + 1
        }

        if (newIndex !== index) {
          const newComponents = [...components]
          const [removed] = newComponents.splice(index, 1)
          newComponents.splice(newIndex, 0, removed)
          set({ components: newComponents })
        }
      },

      reorderComponents: (newOrder) => {
        set({ components: newOrder })
      },
  updateComponentPosition: (id, x, y) => {
    set((state) => ({
      components: state.components.map((comp) =>
        comp.id === id ? { ...comp, x, y } : comp
      ),
    }))
  },

      clearCanvas: () => {
        set({ components: [], selectedComponent: null })
      },

      // Import/Export
      exportSchema: () => {
        return JSON.stringify(get().components, null, 2)
      },

      importSchema: (schema) => {
        try {
          const components = JSON.parse(schema)
          set({ components })
          return true
        } catch (e) {
          return false
        }
      },

      // Clear selected
      clearSelected: () => {
        set({ selectedComponent: null })
      },
    }),
    {
      name: 'editor-storage',
      partialize: (state) => ({ components: state.components }),
    }
  )
)

export default useEditorStore
