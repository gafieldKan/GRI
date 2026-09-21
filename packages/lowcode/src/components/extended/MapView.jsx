import React, { useEffect, useRef, useState } from 'react'
import { Spin, Alert, Button, Space } from 'antd'
import { EnvironmentOutlined } from '@ant-design/icons'

/**
 * 地图组件
 * 支持高德/百度/百度地图集成
 * 可用于展示餐厅位置、配送范围、配送路线等
 *
 * @param {Object} props
 * @param {Array} props.markers - 标记点列表 [{lat, lng, title, description}]
 * @param {Object} props.center - 地图中心点 {lat, lng}
 * @param {Number} props.zoom - 缩放级别 (3-18)
 * @param {String} props.mapType - 地图类型：amap(高德), bmap(百度)
 * @param {String} props.apiKey - API Key
 * @param {Function} props.onMarkerClick - 标记点击回调
 * @param {Boolean} props.showDeliveryRange - 是否显示配送范围
 * @param {Number} props.deliveryRange - 配送范围 (公里)
 */
const MapView = ({
  markers = [],
  center = { lat: 39.9042, lng: 116.4074 }, // 默认北京
  zoom = 12,
  mapType = 'amap',
  apiKey = '',
  onMarkerClick,
  showDeliveryRange = false,
  deliveryRange = 5,
}) => {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mapRef = useRef(null)

  useEffect(() => {
    loadMapScript()
  }, [])

  // 加载地图脚本
  const loadMapScript = () => {
    const isAmap = mapType === 'amap'
    const scriptUrl = isAmap
      ? `https://webapi.amap.com/maps?v=2.0&key=${apiKey || 'your_amap_key'}`
      : `https://api.map.baidu.com/api?v=3.0&ak=${apiKey || 'your_bmap_key'}`

    // 检查是否已加载
    if (isAmap && window.AMap) {
      initMap()
      return
    }
    if (mapType === 'bmap' && window.BMap) {
      initMap()
      return
    }

    const script = document.createElement('script')
    script.src = scriptUrl
    script.async = true
    script.onload = () => {
      initMap()
    }
    script.onerror = () => {
      setError('地图加载失败，请检查网络或 API Key')
      setLoading(false)
    }
    document.head.appendChild(script)
  }

  // 初始化地图
  const initMap = () => {
    if (!containerRef.current) return

    try {
      if (mapType === 'amap') {
        // 高德地图
        mapRef.current = new window.AMap.Map(containerRef.current, {
          center: [center.lng, center.lat],
          zoom: zoom,
          viewMode: '3D',
        })
      } else {
        // 百度地图
        mapRef.current = new window.BMap.Map(containerRef.current)
        const point = new window.BMap.Point(center.lng, center.lat)
        mapRef.current.centerAndZoom(point, zoom)
        mapRef.current.enableScrollWheelZoom(true)
      }

      setLoading(false)
      addMarkers()
    } catch (err) {
      setError('地图初始化失败：' + err.message)
      setLoading(false)
    }
  }

  // 添加标记
  const addMarkers = () => {
    if (!mapRef.current || markers.length === 0) return

    markers.forEach((marker, index) => {
      if (mapType === 'amap') {
        const amapMarker = new window.AMap.Marker({
          position: [marker.lng, marker.lat],
          title: marker.title,
          offset: new window.AMap.Pixel(-10, -30),
        })

        if (marker.description) {
          const infoWindow = new window.AMap.InfoWindow({
            content: marker.description,
            offset: new window.AMap.Pixel(0, -30),
          })
          amapMarker.on('click', () => {
            infoWindow.open(mapRef.current, [marker.lng, marker.lat])
            onMarkerClick?.(marker)
          })
        } else {
          amapMarker.on('click', () => onMarkerClick?.(marker))
        }

        amapMarker.setMap(mapRef.current)
      } else {
        // 百度地图标记
        const point = new window.BMap.Point(marker.lng, marker.lat)
        const bmapMarker = new window.BMap.Marker(point)

        if (marker.description) {
          const infoWindow = new window.BMap.InfoWindow(marker.description)
          bmapMarker.addEventListener('click', () => {
            mapRef.current.openInfoWindow(infoWindow, point)
            onMarkerClick?.(marker)
          })
        } else {
          bmapMarker.addEventListener('click', () => onMarkerClick?.(marker))
        }

        mapRef.current.addOverlay(bmapMarker)
      }
    })

    // 显示配送范围
    if (showDeliveryRange && center) {
      addDeliveryRange(center, deliveryRange)
    }
  }

  // 添加配送范围圆
  const addDeliveryRange = (centerPos, rangeKm) => {
    if (mapType === 'amap') {
      const circle = new window.AMap.Circle({
        center: [centerPos.lng, centerPos.lat],
        radius: rangeKm * 1000,
        fillColor: '#1890ff',
        fillOpacity: 0.2,
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.5,
      })
      circle.setMap(mapRef.current)
    } else {
      const point = new window.BMap.Point(centerPos.lng, centerPos.lat)
      const circle = new window.BMap.Circle(point, rangeKm * 1000, {
        fillColor: '#1890ff',
        fillOpacity: 0.2,
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.5,
      })
      mapRef.current.addOverlay(circle)
    }
  }

  if (error) {
    return (
      <Alert
        message="地图加载失败"
        description={error}
        type="error"
        showRefresh
        action={
          <Button size="small" onClick={() => window.location.reload()}>
            重新加载
          </Button>
        }
      />
    )
  }

  return (
    <div style={styles.container}>
      {loading && (
        <div style={styles.loading}>
          <Spin size="large" tip="地图加载中..." />
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          ...styles.map,
          display: loading ? 'none' : 'block',
        }}
      />
    </div>
  )
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    minHeight: 400,
    position: 'relative',
    background: '#f5f5f5',
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.8)',
    zIndex: 1000,
  },
  map: {
    width: '100%',
    height: '100%',
  },
}

export default MapView
