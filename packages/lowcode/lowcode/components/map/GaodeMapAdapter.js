/**
 * 高德地图��配器
 * 封装高德地图 API，提供统一接口
 */
export class GaodeMapAdapter {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.GAODE_API_KEY;
    this.version = config.version || '2.0';
    this.plugins = config.plugins || ['Geocoder', 'Autocomplete', 'PlaceSearch'];
    this.map = null;
    this.loaded = false;
  }

  /**
   * 初始化地图
   */
  async init(container, options = {}) {
    if (this.loaded && this.map) {
      return this.map;
    }

    // 加载高德地图 JS API
    await this._loadScript();

    const AMap = window.AMap;
    if (!AMap) {
      throw new Error('高德地图 API 加载失败');
    }

    this.map = new AMap.Map(container, {
      zoom: options.zoom || 12,
      center: options.center || [116.397428, 39.90923], // 北京天安门
      viewMode: options.viewMode || '2D',
      ...options
    });

    // 加载��件
    await this._loadPlugins();

    this.loaded = true;
    return this.map;
  }

  /**
   * 加载高德地图 JS API
   */
  _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.AMap) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=${this.version}&key=${this.apiKey}&plugin=${this.plugins.join(',')}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('高德地图 API 加载失败'));
      document.head.appendChild(script);
    });
  }

  /**
   * 加载��件
   */
  _loadPlugins() {
    return new Promise((resolve) => {
      const AMap = window.AMap;
      AMap.plugin(this.plugins, () => resolve());
    });
  }

  /**
   * 地��解�� (地��转坐标)
   */
  async geocode(address) {
    const AMap = window.AMap;
    const geocoder = new AMap.Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.getLocation(address, (status, result) => {
        if (status === 'complete' && result.geocodes.length > 0) {
          const location = result.geocodes[0].location;
          resolve([location.lng, location.lat]);
        } else {
          reject(new Error(`地��解��失败: ${status}`));
        }
      });
    });
  }

  /**
   * 逆地��解�� (坐标转地��)
   */
  async reverseGeocode(lng, lat) {
    const AMap = window.AMap;
    const geocoder = new AMap.Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.getAddress(new AMap.LngLat(lng, lat), (status, result) => {
        if (status === 'complete' && result.regeocode) {
          resolve(result.regeocode.formattedAddress);
        } else {
          reject(new Error(`逆地��解��失败: ${status}`));
        }
      });
    });
  }

  /**
   * 关��词���索 (POI ���索)
   */
  async searchPlaces(keyword, options = {}) {
    const AMap = window.AMap;
    const placeSearch = new AMap.PlaceSearch({
      pageSize: options.pageSize || 20,
      pageIndex: options.pageIndex || 1,
      city: options.city || '全国',
      ...options
    });

    return new Promise((resolve, reject) => {
      placeSearch.search(keyword, (status, result) => {
        if (status === 'complete') {
          resolve(result.poiList.pois);
        } else {
          reject(new Error(`���索失败: ${status}`));
        }
      });
    });
  }

  /**
   * ���取配送范�� (��形/多边形)
   */
  getDeliveryRange(center, radius = 5000) {
    const AMap = window.AMap;
    return new AMap.Circle({
      center,
      radius,
      fillColor: '#1890ff',
      fillOpacity: 0.2,
      strokeColor: '#1890ff',
      strokeWeight: 2
    });
  }

  /**
   * 设置地图中心点
   */
  setCenter(lng, lat) {
    if (this.map) {
      this.map.setCenter([lng, lat]);
    }
  }

  /**
   * 设置��放级别
   */
  setZoom(zoom) {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }

  /**
   * ��加标记点
   */
  addMarker(options) {
    const AMap = window.AMap;
    const marker = new AMap.Marker({
      position: options.position,
      title: options.title,
      content: options.content,
      icon: options.icon,
      ...options
    });

    if (this.map) {
      marker.setMap(this.map);
    }

    return marker;
  }

  /**
   * �����地图
   */
  destroy() {
    if (this.map) {
      this.map.destroy();
      this.map = null;
      this.loaded = false;
    }
  }
}

export default GaodeMapAdapter;