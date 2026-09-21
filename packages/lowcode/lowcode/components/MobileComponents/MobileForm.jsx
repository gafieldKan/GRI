/**
 * 移动端表单组件
 * 针对触摸优化的表单控件集合
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useCallback, useMemo } from 'react'

/**
 * 移动端输入框组件
 */
export function MobileInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  error,
  className = '',
  style = {},
  ...props
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div
      className={`mobile-input-wrapper ${focused ? 'focused' : ''} ${error ? 'error' : ''} ${className}`}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        ...style,
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#666',
            marginBottom: '8px',
          }}
        >
          {label} {required && <span style={{ color: '#ff4d4f' }}>*</span>}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          padding: '8px 0',
          background: 'transparent',
        }}
        {...props}
      />
      {error && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

/**
 * 移动端选择器组件
 */
export function MobileSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = '请选择',
  required = false,
  error,
  className = '',
  style = {},
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className={`mobile-select-wrapper ${visible ? 'focused' : ''} ${error ? 'error' : ''} ${className}`}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        ...style,
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#666',
            marginBottom: '8px',
          }}
        >
          {label} {required && <span style={{ color: '#ff4d4f' }}>*</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          padding: '8px 0',
          background: 'transparent',
          appearance: 'none',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

/**
 * 移动端日期选择器
 */
export function MobileDatePicker({
  label,
  value,
  onChange,
  placeholder = '选择日期',
  required = false,
  error,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`mobile-date-wrapper ${error ? 'error' : ''} ${className}`}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        ...style,
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#666',
            marginBottom: '8px',
          }}
        >
          {label} {required && <span style={{ color: '#ff4d4f' }}>*</span>}
        </label>
      )}
      <input
        type="date"
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          padding: '8px 0',
          background: 'transparent',
        }}
      />
      {error && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

/**
 * 移动端开关组件
 */
export function MobileSwitch({ label, checked, onChange, className = '', style = {} }) {
  return (
    <div
      className={`mobile-switch-wrapper ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        ...style,
      }}
    >
      {label && <span style={{ fontSize: '16px', color: '#333' }}>{label}</span>}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        style={{
          width: '52px',
          height: '28px',
          borderRadius: '14px',
          background: checked ? '#1677ff' : '#d9d9d9',
          border: 'none',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '12px',
            background: '#fff',
            position: 'absolute',
            top: '2px',
            left: checked ? '26px' : '2px',
            transition: 'left 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  )
}

/**
 * 移动端复选框组
 */
export function MobileCheckboxGroup({
  label,
  options = [],
  value = [],
  onChange,
  className = '',
  style = {},
}) {
  const handleChange = (itemValue) => {
    const newValue = value.includes(itemValue)
      ? value.filter((v) => v !== itemValue)
      : [...value, itemValue]
    onChange?.(newValue)
  }

  return (
    <div
      className={`mobile-checkbox-group ${className}`}
      style={{ padding: '16px', background: '#fff', ...style }}
    >
      {label && (
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>{label}</div>
      )}
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid #f5f5f5',
          }}
        >
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => handleChange(opt.value)}
            style={{ marginRight: '12px' }}
          />
          <span style={{ fontSize: '16px' }}>{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * 移动端单选框组
 */
export function MobileRadioGroup({
  label,
  options = [],
  value,
  onChange,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`mobile-radio-group ${className}`}
      style={{ padding: '16px', background: '#fff', ...style }}
    >
      {label && (
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>{label}</div>
      )}
      {options.map((opt) => (
        <label
          key={opt.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: '1px solid #f5f5f5',
          }}
          onClick={() => onChange?.(opt.value)}
        >
          <input type="radio" checked={value === opt.value} style={{ marginRight: '12px' }} />
          <span style={{ fontSize: '16px' }}>{opt.label}</span>
        </label>
      ))}
    </div>
  )
}

/**
 * 移动端文本域
 */
export function MobileTextarea({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  error,
  rows = 4,
  className = '',
  style = {},
}) {
  const [focused, setFocused] = useState(false)

  return (
    <div
      className={`mobile-textarea-wrapper ${focused ? 'focused' : ''} ${error ? 'error' : ''} ${className}`}
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        ...style,
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '14px',
            color: '#666',
            marginBottom: '8px',
          }}
        >
          {label} {required && <span style={{ color: '#ff4d4f' }}>*</span>}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          padding: '8px 0',
          background: 'transparent',
          resize: 'none',
        }}
      />
      {error && <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>{error}</div>}
    </div>
  )
}

/**
 * 移动端表单
 */
export function MobileForm({ children, onSubmit, className = '', style = {} }) {
  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit?.(e)
  }

  return (
    <form
      className={`mobile-form ${className}`}
      onSubmit={handleSubmit}
      style={{
        background: '#f5f5f5',
        minHeight: '100vh',
        ...style,
      }}
    >
      {children}
    </form>
  )
}

/**
 * 移动端提交按钮
 */
export function MobileSubmitButton({
  children,
  onSubmit,
  loading = false,
  className = '',
  style = {},
}) {
  return (
    <button
      type="submit"
      onClick={onSubmit}
      disabled={loading}
      className={`mobile-submit-btn ${loading ? 'loading' : ''} ${className}`}
      style={{
        width: '100%',
        padding: '14px',
        background: loading ? '#d9d9d9' : '#1677ff',
        color: '#fff',
        border: 'none',
        fontSize: '18px',
        fontWeight: 600,
        borderRadius: '8px',
        margin: '16px',
        ...style,
      }}
    >
      {loading ? '提交中...' : children}
    </button>
  )
}

export default {
  MobileInput,
  MobileSelect,
  MobileDatePicker,
  MobileSwitch,
  MobileCheckboxGroup,
  MobileRadioGroup,
  MobileTextarea,
  MobileForm,
  MobileSubmitButton,
}
