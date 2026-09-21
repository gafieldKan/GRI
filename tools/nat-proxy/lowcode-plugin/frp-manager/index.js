/**
 * FRP Manager Plugin - 低代码平台内网穿透管理插件
 *
 * 功能特性:
 * - 隧道配置管理
 * - 隧道状态监控
 * - 流量统计查看
 * - 一键启停隧道
 */

import frpApiRouter from './api/frp-api.js'

// 插件元数据
export const plugin = {
  name: 'frp-manager',
  version: '1.0.0',
  description: 'FRP 内网穿透管理插件',
  type: 'panel',

  // 插件入口
  init(ctx) {
    console.log('[FRP Manager] 插件初始化')

    // 注册 API 路由到低代码平台
    if (ctx?.app?.use) {
      ctx.app.use('/api/frp', frpApiRouter)
      console.log('[FRP Manager] API 路由已注册')
    }

    // 注册全局 API
    window.$frpManager = {
      // 获取隧道状态
      getTunnelStatus: this.getTunnelStatus,
      // 启动隧道
      startTunnel: this.startTunnel,
      // 停止隧道
      stopTunnel: this.stopTunnel,
      // 获取流量统计
      getTrafficStats: this.getTrafficStats,
    };

    // 注册到全局事件
    ctx?.on('app:init', () => {
      console.log('[FRP Manager] 应用已初始化');
    });
  },

  // 获取隧道状态
  async getTunnelStatus() {
    try {
      const response = await fetch('/api/frp/status');
      return await response.json();
    } catch (error) {
      console.error('[FRP Manager] 获取状态失败:', error);
      return { online: false, error: error.message };
    }
  },

  // 启动隧道
  async startTunnel(config) {
    try {
      const response = await fetch('/api/frp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      return await response.json();
    } catch (error) {
      console.error('[FRP Manager] 启动隧道失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 停止隧道
  async stopTunnel() {
    try {
      const response = await fetch('/api/frp/stop', {
        method: 'POST',
      });
      return await response.json();
    } catch (error) {
      console.error('[FRP Manager] 停止隧道失败:', error);
      return { success: false, error: error.message };
    }
  },

  // 获取流量统计
  async getTrafficStats() {
    try {
      const response = await fetch('/api/frp/stats');
      return await response.json();
    } catch (error) {
      console.error('[FRP Manager] 获取流量统计失败:', error);
      return { error: error.message };
    }
  },
};

// 导出 React 组件
export { FRPManagerPanel as default } from './FRPManagerPanel.jsx';
