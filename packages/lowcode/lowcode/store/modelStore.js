import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useModelStore = create(
  persist(
    (set, get) => ({
      // Data models
      models: [],

      // Selected model
      selectedModel: null,

      // Field types
      fieldTypes: [
        { type: 'string', label: '文本', default: '' },
        { type: 'number', label: '数字', default: 0 },
        { type: 'boolean', label: '布尔', default: false },
        { type: 'date', label: '日期', default: null },
        { type: 'array', label: '数组', default: [] },
        { type: 'object', label: '对象', default: {} },
        { type: 'email', label: '邮箱', default: '' },
        { type: 'phone', label: '电话', default: '' },
        { type: 'url', label: '链接', default: '' },
        { type: 'json', label: 'JSON', default: null },
      ],

      // Actions
      addModel: (model) => {
        const newModel = {
          id: `model_${Date.now()}`,
          name: model.name,
          description: model.description || '',
          fields: [],
          timestamps: true,
          ...model,
        }
        set((state) => ({ models: [...state.models, newModel] }))
        return newModel
      },

      updateModel: (id, updates) => {
        set((state) => ({
          models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
        }))
      },

      deleteModel: (id) => {
        set((state) => ({
          models: state.models.filter((m) => m.id !== id),
          selectedModel: state.selectedModel === id ? null : state.selectedModel,
        }))
      },

      selectModel: (id) => {
        set({ selectedModel: id })
      },

      // Field actions
      addField: (modelId, field) => {
        const newField = {
          id: `field_${Date.now()}`,
          required: false,
          unique: false,
          index: false,
          ...field,
        }
        set((state) => ({
          models: state.models.map((m) =>
            m.id === modelId ? { ...m, fields: [...m.fields, newField] } : m
          ),
        }))
        return newField
      },

      updateField: (modelId, fieldId, updates) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === modelId
              ? {
                  ...m,
                  fields: m.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)),
                }
              : m
          ),
        }))
      },

      deleteField: (modelId, fieldId) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === modelId ? { ...m, fields: m.fields.filter((f) => f.id !== fieldId) } : m
          ),
        }))
      },

      // Get model by ID
      getModelById: (id) => {
        return get().models.find((m) => m.id === id)
      },

      // Generate CRUD schema
      generateCRUD: (modelId) => {
        const model = get().getModelById(modelId)
        if (!model) return null

        return {
          id: model.id,
          name: model.name,
          fields: model.fields,
          timestamps: model.timestamps,
        }
      },
    }),
    {
      name: 'model-storage',
    }
  )
)

export default useModelStore
