/**
 * 地图容器组件
 * 统一的地图展示和交互容器，支持多地图服务商切换
 */
export class MapContainer {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || 'gaode',
      gaodeKey: config.gaodeKey || process.env.GAODE_API_KEY,
      baiduKey: config.baiduKey || process.env.BAIDU_MAP_API_KEY,
      defaultCenter: config.defaultCenter || [116.397428, 39.90923],
      defaultZoom: config.defaultZoom || 12,
      showProviderSwitcher: config.showProviderSwitcher !== false,
      ...config
    };

    this.currentAdapter = null;
    this.currentProvider = this.config.defaultProvider;
    this.container = null;
    this.map = null;
  }

  /**
   * 初始化地图容器
   */
  async mount(domContainer) {
    this.container = typeof domContainer === 'string'
      ? document.getElementById(domContainer)
      : domContainer;

    if (!this.container) {
      throw new Error('地图容器不存在');
    }

    // 创建 UI 结构
    this._createUI();

    // 初始化默认地图
    await this.switchProvider(this.currentProvider);

    return this.map;
  }

  /**
   * 创建 UI 结构
   */
  _createUI() {
    this.container.innerHTML = `
      <div class="map-container-wrapper">
        ${this.config.showProviderSwitcher ? `
          <div class="map-provider-switcher">
            <label>地图服务商: </label>
            <select id="map-provider-select">
              <option value="gaode" ${this.currentProvider === 'gaode' ? 'selected' : ''}>高德地图</option>
              <option value="baidu" ${this.currentProvider === 'baidu' ? 'selected' : ''}>百度地图</option>
            </select>
          </div>
        ` : ''}
        <div id="map-canvas" class="map-canvas"></div>
      </div>
    `;

    // ��定切换事件
    const select = this.container.querySelector('#map-provider-select');
    if (select) {
      select.addEventListener('change', (e) => {
        this.switchProvider(e.target.value);
      });
    }
  }

  /**
   * 切换地图服务商
   */
  async switchProvider(provider) {
    if (provider === this.currentProvider && this.map) {
      return this.map;
    }

    // �����当前地图
    if (this.currentAdapter) {
      this.currentAdapter.destroy();
    }

    this.currentProvider = provider;

    // 创建新��配器
    const { MapFactory } = await import('./MapFactory.js');
    this.currentAdapter = MapFactory.createAdapter(provider, {
      apiKey: provider === 'gaode' ? this.config.gaodeKey : this.config.baiduKey
    });

    // 初始化地图
    const canvas = this.container.querySelector('#map-canvas');
    this.map = await this.currentAdapter.init(canvas, {
      center: this.config.defaultCenter,
      zoom: this.config.defaultZoom
    });

    return this.map;
  }

  /**
   * �����取当前地图实例
   */
  getMap() {
    return this.map;
  }

  /**
   * �����取当前��配器
   */
  getAdapter() {
    return this.currentAdapter;
  }

  /**
   * 设置中心点
   */
  setCenter(lng, lat) {
    if (this.currentAdapter) {
      this.currentAdapter.setCenter(lng, lat);
    }
  }

  /**
   * 设置��放级别
   */
  setZoom(zoom) {
    if (this.currentAdapter) {
      this.currentAdapter.setZoom(zoom);
    }
  }

  /**
   * �����加标记
   */
  addMarker(options) {
    if (this.currentAdapter) {
      return this.currentAdapter.addMarker(options);
    }
  }

  /**
   * ��制配送范��
   */
  drawDeliveryRange(center, radius) {
    if (this.currentAdapter) {
      const range = this.currentAdapter.getDeliveryRange(center, radius);
      if (this.map) {
        this.map.addOverlay(range);
      }
      return range;
    }
  }

  /**
   * 地��解��
   */
  async geocode(address) {
    if (this.currentAdapter) {
      return await this.currentAdapter.geocode(address);
    }
  }

  /**
   * 逆地��解��
   */
  async reverseGeocode(lng, lat) {
    if (this.currentAdapter) {
      return await this.currentAdapter.reverseGeocode(lng, lat);
    }
  }

  /**
   * ���索地点
   */
  async searchPlaces(keyword, options = {}) {
    if (this.currentAdapter) {
      return await this.currentAdapter.searchPlaces(keyword, options);
    }
  }

  /**
   * �����组件
   */
  destroy() {
    if (this.currentAdapter) {
      this.currentAdapter.destroy();
    }
    this.currentAdapter = null;
    this.map = null;
    this.container = null;
  }
}

export default MapContainer;