/**
 * 多端适配预览组件
 * 支持 PC、Mobile、Tablet 多种设备预览，实时响应式展示
 *
 * @author GRI Team
 * @version 1.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { DeviceType, ResponsiveEngine } from '../../engine/ResponsiveEngine'

// 设备配置
const DEVICE_CONFIGS = {
  [DeviceType.MOBILE]: {
    name: '手机',
    icon: '📱',
    width: 375,
    height: 812,
    breakpoint: 'mobile',
  },
  [DeviceType.TABLET]: {
    name: '平板',
    icon: '📱',
    width: 768,
    height: 1024,
    breakpoint: 'tablet',
  },
  [DeviceType.DESKTOP]: {
    name: '桌面',
    icon: '💻',
    width: 1440,
    height: 900,
    breakpoint: 'desktop',
  },
  [DeviceType.WIDESCREEN]: {
    name: '宽屏',
    icon: '🖥️',
    width: 1920,
    height: 1080,
    breakpoint: 'widescreen',
  },
}

// 方向模式
const ORIENTATION = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
}

/**
 * 设备框架组件
 */
const DeviceFrame = ({ children, deviceType, orientation, showGrid, className = '' }) => {
  const config = DEVICE_CONFIGS[deviceType]
  const [currentOrientation, setCurrentOrientation] = useState(orientation)

  const dimensions = useMemo(() => {
    const isPortrait = currentOrientation === ORIENTATION.PORTRAIT
    return {
      width: isPortrait ? config.width : config.height,
      height: isPortrait ? config.height : config.width,
    }
  }, [config, currentOrientation])

  const toggleOrientation = () => {
    setCurrentOrientation((prev) =>
      prev === ORIENTATION.PORTRAIT ? ORIENTATION.LANDSCAPE : ORIENTATION.PORTRAIT
    )
  }

  return (
    <div
      className={`device-frame ${className}`}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        border: '2px solid #333',
        borderRadius: deviceType === DeviceType.MOBILE ? '20px' : '8px',
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#fff',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      }}
    >
      {/* 状态栏 */}
      <StatusBar deviceType={deviceType} />

      {/* 内容区域 */}
      <div
        className="device-content"
        style={{
          width: '100%',
          height: 'calc(100% - 40px)',
          overflow: 'auto',
          padding: '16px',
        }}
      >
        {children}
      </div>

      {/* 网格辅助线 */}
      {showGrid && <GridOverlay />}

      {/* 方向切换按钮 */}
      {(deviceType === DeviceType.MOBILE || deviceType === DeviceType.TABLET) && (
        <button
          onClick={toggleOrientation}
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {currentOrientation === ORIENTATION.PORTRAIT ? '横屏' : '竖屏'}
        </button>
      )}
    </div>
  )
}

/**
 * 状态栏组件
 */
const StatusBar = ({ deviceType }) => (
  <div
    style={{
      height: 40,
      backgroundColor: '#f5f5f5',
      borderBottom: '1px solid #e0e0e0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      fontSize: '12px',
    }}
  >
    <span>{new Date().toLocaleTimeString()}</span>
    <div style={{ display: 'flex', gap: 8 }}>
      <span>📶</span>
      <span>🔋</span>
    </div>
  </div>
)

/**
 * 网格辅助线组件
 */
const GridOverlay = () => (
  <div
    style={{
      position: 'absolute',
      top: 40,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `
      linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)
    `,
      backgroundSize: '8px 8px',
      pointerEvents: 'none',
      zIndex: 1000,
    }}
  />
)

/**
 * 多端预览主组件
 */
const MultiPlatformPreview = ({
  children,
  showToolbar = true,
  showDeviceList = true,
  defaultDevice = DeviceType.DESKTOP,
  onDeviceChange,
  className = '',
}) => {
  const [currentDevice, setCurrentDevice] = useState(defaultDevice)
  const [orientation, setOrientation] = useState(ORIENTATION.PORTRAIT)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [showDiffs, setShowDiffs] = useState(false)

  // 响应式布局检测
  const { breakpoints, currentBreakpoint } = ResponsiveEngine.useResponsive()

  // 设备切换处理
  const handleDeviceChange = useCallback(
    (deviceType) => {
      setCurrentDevice(deviceType)
      onDeviceChange?.(deviceType)
    },
    [onDeviceChange]
  )

  // 缩放处理
  const handleZoomChange = useCallback((e) => {
    setZoom(Number(e.target.value))
  }, [])

  return (
    <div className={`multi-platform-preview ${className}`}>
      {/* 工具栏 */}
      {showToolbar && (
        <div
          className="preview-toolbar"
          style={{
            padding: '12px',
            backgroundColor: '#f0f2f5',
            borderBottom: '1px solid #d9d9d9',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span style={{ fontWeight: 600 }}>预览模式：</span>

          {/* 设备选择器 */}
          {showDeviceList && (
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(DEVICE_CONFIGS).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleDeviceChange(type)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: currentDevice === type ? '#1890ff' : '#fff',
                    color: currentDevice === type ? '#fff' : '#666',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {config.icon} {config.name}
                </button>
              ))}
            </div>
          )}

          {/* 缩放控制 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>缩放：</span>
            <input
              type="range"
              min="50"
              max="150"
              value={zoom}
              onChange={handleZoomChange}
              style={{ width: 100 }}
            />
            <span>{zoom}%</span>
          </div>

          {/* 网格开关 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            网格
          </label>

          {/* 差异对比开关 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={showDiffs}
              onChange={(e) => setShowDiffs(e.target.checked)}
            />
            差异对比
          </label>
        </div>
      )}

      {/* 预览区域 */}
      <div
        className="preview-content"
        style={{
          padding: '24px',
          backgroundColor: '#f5f5f5',
          minHeight: 'calc(100vh - 150px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
          }}
        >
          <DeviceFrame deviceType={currentDevice} orientation={orientation} showGrid={showGrid}>
            {children}
          </DeviceFrame>
        </div>
      </div>

      {/* 断点信息 */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          padding: '8px 16px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        当前断点：{currentBreakpoint} | 设备：{DEVICE_CONFIGS[currentDevice]?.name}
      </div>
    </div>
  )
}

/**
 * 响应式 Hook
 */
export const useMultiPlatformPreview = () => {
  const [currentDevice, setCurrentDevice] = useState(DeviceType.DESKTOP)
  const [orientation, setOrientation] = useState(ORIENTATION.PORTRAIT)

  const deviceInfo = useMemo(
    () => ({
      type: currentDevice,
      orientation,
      ...DEVICE_CONFIGS[currentDevice],
    }),
    [currentDevice, orientation]
  )

  return {
    currentDevice,
    setCurrentDevice,
    orientation,
    setOrientation,
    deviceInfo,
    DeviceFrame,
    DEVICE_CONFIGS,
  }
}

export default MultiPlatformPreview
