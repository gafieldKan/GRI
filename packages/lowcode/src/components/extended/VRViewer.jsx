import React, { useState, useEffect, useRef } from 'react'
import { Carousel, Button, Space, Tooltip } from 'antd'
import {
  RotateLeftOutlined,
  RotateRightOutlined,
  FullscreenOutlined,
  PictureOutlined,
} from '@ant-design/icons'

/**
 * VR 展示组件
 * 支持 360 度全景展示、资源仿真展示
 * 基于 Three.js 或 全景图片实现
 *
 * @param {Object} props
 * @param {Array} props.images - 全景图片列表
 * @param {String} props.type - 类型：restaurant | kitchen | farm
 * @param {String} props.resourceId - 资源 ID
 * @param {Array} props.hotspots - 热点标记
 * @param {Function} props.onHotspotClick - 热点点击回调
 */
const VRViewer = ({
  images = [],
  type = 'restaurant',
  resourceId,
  hotspots = [],
  onHotspotClick,
}) => {
  const [currentImage, setCurrentImage] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)

  // 根据类型获取图标
  const getTypeIcon = () => {
    switch (type) {
      case 'restaurant':
        return '🍽️'
      case 'kitchen':
        return '👨‍🍳'
      case 'farm':
        return '🌾'
      default:
        return '📷'
    }
  }

  const handleImageLoad = () => {
    setIsLoading(false)
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  return (
    <div ref={containerRef} style={styles.container}>
      {/* 头部信息 */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={{ marginRight: 8 }}>{getTypeIcon()}</span>
          <span>
            {type === 'restaurant'
              ? '餐厅环境'
              : type === 'kitchen'
                ? '厨房环境'
                : type === 'farm'
                  ? '农场环境'
                  : '资源展示'}
          </span>
        </div>
        <Space>
          <Tooltip title="全景切换">
            <Button
              icon={<PictureOutlined />}
              size="small"
              onClick={() => setCurrentImage((prev) => (prev + 1) % images.length)}
            />
          </Tooltip>
          <Tooltip title="全屏查看">
            <Button icon={<FullscreenOutlined />} size="small" onClick={handleFullscreen} />
          </Tooltip>
        </Space>
      </div>

      {/* 全景图片展示 */}
      <div style={styles.viewer}>
        {isLoading && <div style={styles.loading}>加载中...</div>}
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImage]}
              alt={`全景图 ${currentImage + 1}`}
              style={{
                ...styles.image,
                display: isLoading ? 'none' : 'block',
              }}
              onLoad={handleImageLoad}
              onError={() => setIsLoading(false)}
            />
            {/* 热点标记 */}
            {hotspots.map((hotspot, index) => (
              <div
                key={index}
                style={{
                  ...styles.hotspot,
                  left: hotspot.position[0],
                  top: hotspot.position[1],
                }}
                onClick={() => onHotspotClick?.(hotspot)}
              >
                <div style={styles.hotspotIcon}>{hotspot.icon || '📍'}</div>
                {hotspot.label && <div style={styles.hotspotLabel}>{hotspot.label}</div>}
              </div>
            ))}
          </>
        ) : (
          <div style={styles.placeholder}>
            <PictureOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
            <div style={{ color: '#999', marginTop: 16 }}>暂无全景图片</div>
          </div>
        )}
      </div>

      {/* 图片切换器 */}
      {images.length > 1 && (
        <div style={styles.thumbnailContainer}>
          {images.map((img, index) => (
            <div
              key={index}
              style={{
                ...styles.thumbnail,
                border: currentImage === index ? '2px solid #1890ff' : '2px solid transparent',
              }}
              onClick={() => setCurrentImage(index)}
            >
              <img src={img} alt={`缩略图 ${index + 1}`} style={styles.thumbnailImage} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    background: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '12px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
  },
  title: {
    fontSize: 16,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
  },
  viewer: {
    flex: 1,
    position: 'relative',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  loading: {
    color: '#fff',
    fontSize: 14,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
  },
  hotspot: {
    position: 'absolute',
    cursor: 'pointer',
    zIndex: 10,
    transform: 'translate(-50%, -100%)',
    transition: 'transform 0.2s',
  },
  hotspotIcon: {
    fontSize: 24,
    color: '#fff',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },
  hotspotLabel: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  thumbnailContainer: {
    padding: 12,
    display: 'flex',
    gap: 8,
    background: '#fafafa',
    overflowX: 'auto',
  },
  thumbnail: {
    width: 80,
    height: 50,
    flexShrink: 0,
    borderRadius: 4,
    overflow: 'hidden',
    cursor: 'pointer',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
}

export default VRViewer
