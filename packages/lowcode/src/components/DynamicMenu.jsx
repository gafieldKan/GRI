import React, { useState, useEffect } from 'react'
import { Menu } from 'antd'
import {
  HomeOutlined,
  OrderedListOutlined,
  ToolOutlined,
  QrcodeOutlined,
  ShopOutlined,
  ApartmentOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons'

// 别名
const FieldOutlined = EnvironmentOutlined
const RestaurantOutlined = ApartmentOutlined

/**
 * 图标映射
 */
const ICON_MAP = {
  RestaurantOutlined: ApartmentOutlined,
  HomeOutlined: HomeOutlined,
  FieldOutlined: EnvironmentOutlined,
  OrderedListOutlined: OrderedListOutlined,
  ToolOutlined: ToolOutlined,
  QrcodeOutlined: QrcodeOutlined,
  ShopOutlined: ShopOutlined,
}

/**
 * 动态菜单组件
 * 支持多级菜单动态加载
 */
const DynamicMenu = ({ onSelect }) => {
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadMenuConfig()
  }, [])

  /**
   * 加载菜单配置
   */
  const loadMenuConfig = async () => {
    setLoading(true)
    try {
      // 从模块管理器获取菜单配置
      const { moduleManager } = await import('../../lowcode/core/ModuleManager')
      const modules = moduleManager.getModuleTree()

      setMenuItems(buildMenuItems(modules))
    } catch (error) {
      console.error('加载菜单失败:', error)
      // 使用默认菜单
      setMenuItems(getDefaultMenuItems())
    } finally {
      setLoading(false)
    }
  }

  /**
   * 构建菜单项
   */
  const buildMenuItems = (modules, parentPath = '') => {
    return modules.map((module) => {
      const path = module.path || `${parentPath}/${module.id}`
      const IconComponent = module.icon ? ICON_MAP[module.icon] : null

      // 如果有子模块
      if (module.children && module.children.length > 0) {
        return {
          key: module.id,
          icon: module.icon ? <IconComponent /> : null,
          label: module.name,
          children: buildMenuItems(module.children, path),
        }
      }

      // 叶子节点 - 应用
      return {
        key: module.id,
        icon: module.icon ? <IconComponent /> : null,
        label: module.name,
        path: module.path || `/app/${module.id}`,
      }
    })
  }

  /**
   * 默认菜单项 (备用)
   */
  const getDefaultMenuItems = () => [
    {
      key: 'catering',
      icon: <RestaurantOutlined />,
      label: '餐饮',
      children: [
        {
          key: 'catering-ordering',
          label: '点餐系统',
          children: [
            {
              key: 'catering-ordering-custom',
              label: '定制化点餐',
              children: [
                {
                  key: 'catering-ordering-custom-gri',
                  label: 'GRI 点餐',
                  path: '/app/gri-restaurant',
                },
              ],
            },
            {
              key: 'catering-ordering-traditional',
              label: '传统点餐',
            },
          ],
        },
      ],
    },
    {
      key: 'accommodation',
      icon: <HomeOutlined />,
      label: '住宿',
    },
    {
      key: 'agriculture',
      icon: <FieldOutlined />,
      label: '农业',
    },
  ]

  /**
   * 菜单选择处理
   */
  const handleSelect = ({ key, keyPath }) => {
    // 查找对应的应用路径
    const { moduleManager } = window.griModules || {}
    if (moduleManager) {
      const module = moduleManager.getModule(key)
      if (module && module.apps && module.apps.length > 0) {
        // 跳转到应用
        const appKey = module.apps[0]
        window.location.href = `/app/${appKey}`
      }
    }

    onSelect && onSelect({ key, keyPath })
  }

  if (loading) {
    return <div>加载中...</div>
  }

  return <Menu mode="inline" items={menuItems} onSelect={handleSelect} style={{ height: '100%' }} />
}

export default DynamicMenu
