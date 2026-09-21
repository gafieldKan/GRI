/**
 * 自定义输入组件插件示例
 * 演示如何扩展一个表单输入组件
 */

import { registerPlugin, PluginType } from '../../core/PluginRegistry'
import { componentEngine, ComponentCategory } from '../../engine/ComponentEngine'

// 注册插件
registerPlugin({
  name: 'custom-input-plugin',
  type: PluginType.FORM_COMPONENT,
  version: '1.0.0',
  description: '自定义输入组件，带字数统计和格式校验',
  author: 'Awesome Lowcode Team',

  // 插件初始化
  async init() {
    console.warn('[CustomInputPlugin] 初始化')

    // 注册到组件引擎
    componentEngine.registerComponent({
      id: 'customInput',
      name: '高级输入框',
      type: 'CustomInput',
      category: ComponentCategory.FORM,
      icon: 'InputOutlined',
      description: '带字数统计和格式校验的输入框',

      props: {
        placeholder: { type: 'string', default: '请输入' },
        maxLength: { type: 'number', default: 100 },
        format: {
          type: 'select',
          options: ['none', 'uppercase', 'lowercase', 'trim'],
          default: 'none',
        },
        showCount: { type: 'boolean', default: true },
        required: { type: 'boolean', default: false },
      },

      defaultProps: {
        placeholder: '请输入内容',
        maxLength: 100,
        format: 'none',
        showCount: true,
        required: false,
      },

      events: ['onChange', 'onFocus', 'onBlur'],
    })
  },

  async onLoad(context) {
    console.warn('[CustomInputPlugin] 加载', context)
  },

  async onSave(data) {
    console.warn('[CustomInputPlugin] 保存数据', data)
  },

  async onDestroy() {
    console.warn('[CustomInputPlugin] 销毁')
  },
})

// 导出 React 组件（供实际渲染使用）
export const CustomInput = ({ value, onChange, placeholder, maxLength, format, showCount }) => {
  const handleChange = (e) => {
    let newValue = e.target.value

    // 格式化处理
    if (format === 'uppercase') {
      newValue = newValue.toUpperCase()
    } else if (format === 'lowercase') {
      newValue = newValue.toLowerCase()
    } else if (format === 'trim') {
      newValue = newValue.trim()
    }

    onChange?.(newValue)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          fontSize: '14px',
        }}
      />
      {showCount && (
        <span
          style={{
            position: 'absolute',
            right: 8,
            bottom: -20,
            fontSize: 12,
            color: '#999',
          }}
        >
          {value?.length || 0}/{maxLength}
        </span>
      )}
    </div>
  )
}

export default CustomInput
