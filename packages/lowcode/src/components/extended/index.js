/**
 * 低代码平台扩展组件导出
 * 包含电子签章、VR 展示、地图、组织选择器等高级组件
 */

// 电子签名组件
export { default as ElectronicSignature } from './ElectronicSignature.jsx'

// VR 展示组件
export { default as VRViewer } from './VRViewer.jsx'

// 地图组件
export { default as MapView } from './MapView.jsx'

// 组织选择器组件
export { default as OrganizationSelector } from './OrganizationSelector.jsx'

// 组织管理组件
export { default as OrganizationManager } from './OrganizationManager.jsx'

// 权限管理组件
export { default as PermissionManager } from './PermissionManager.jsx'

// 资源选择器组件
export { default as ResourceSelector } from './ResourceSelector.jsx'

// 统一导出
import ElectronicSignature from './ElectronicSignature.jsx'
import VRViewer from './VRViewer.jsx'
import MapView from './MapView.jsx'
import OrganizationSelector from './OrganizationSelector.jsx'
import OrganizationManager from './OrganizationManager.jsx'
import PermissionManager from './PermissionManager.jsx'
import ResourceSelector from './ResourceSelector.jsx'

export const ExtendedComponents = {
  ElectronicSignature,
  VRViewer,
  MapView,
  OrganizationSelector,
  OrganizationManager,
  PermissionManager,
  ResourceSelector,
}

export default ExtendedComponents
