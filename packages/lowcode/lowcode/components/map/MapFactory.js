/**
 * 地图��件工��
 * 统一管理不同地图服务商的��配器
 */
import { GaodeMapAdapter } from './GaodeMapAdapter.js';
import { BaiduMapAdapter } from './BaiduMapAdapter.js';

export class MapFactory {
  static providers = {
    gaode: GaodeMapAdapter,
    baidu: BaiduMapAdapter
  };

  static instances = new Map();

  /**
   * 创建地图��配器
   */
  static createAdapter(provider, config = {}) {
    const ProviderClass = this.providers[provider];
    if (!ProviderClass) {
      throw new Error(`不支持的地图服务商: ${provider}。支持: ${Object.keys(this.providers).join(', ')}`);
    }
    return new ProviderClass(config);
  }

  /**
   * ���取或创建单例实例
   */
  static getInstance(provider, config = {}) {
    const key = `${provider}-${JSON.stringify(config)}`;
    if (!this.instances.has(key)) {
      this.instances.set(key, this.createAdapter(provider, config));
    }
    return this.instances.get(key);
  }

  /**
   * ���取默认实例
   */
  static getDefault(config = {}) {
    const defaultProvider = config.defaultProvider || 'gaode';
    return this.getInstance(defaultProvider, config);
  }

  /**
   * 注册新的地图服务商
   */
  static registerProvider(name, adapterClass) {
    this.providers[name] = adapterClass;
  }

  /**
   * �����所有实例
   */
  static destroyAll() {
    this.instances.forEach(instance => {
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
      }
    });
    this.instances.clear();
  }

  /**
   * ���取支持的服务商列表
   */
  static getSupportedProviders() {
    return Object.keys(this.providers);
  }
}

export default MapFactory;