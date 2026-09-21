/**
 * 百度地图��配器
 * 封装百度地图 API，提供统一接口
 */
export class BaiduMapAdapter {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.BAIDU_MAP_API_KEY;
    this.version = config.version || '3.0';
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

    // 加载百度地图 JS API
    await this._loadScript();

    const BMap = window.BMap;
    if (!BMap) {
      throw new Error('百度地图 API 加载失败');
    }

    this.map = new BMap.Map(container);
    const point = options.center
      ? new BMap.Point(options.center[0], options.center[1])
      : new BMap.Point(116.404, 39.915);

    this.map.centerAndZoom(point, options.zoom || 12);
    this.map.enableScrollWheelZoom(true);

    this.loaded = true;
    return this.map;
  }

  /**
   * 加载百度地图 JS API
   */
  _loadScript() {
    return new Promise((resolve, reject) => {
      if (window.BMap) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://api.map.baidu.com/api?v=${this.version}&ak=${this.apiKey}&callback=initBMapCallback`;
      script.async = true;

      window.initBMapCallback = () => {
        delete window.initBMapCallback;
        resolve();
      };

      script.onerror = () => reject(new Error('百度地图 API 加载失败'));
      document.head.appendChild(script);
    });
  }

  /**
   * 地��解�� (地��转坐标)
   */
  async geocode(address) {
    const BMap = window.BMap;
    const geocoder = new BMap.Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.getPoint(address, (point) => {
        if (point) {
          resolve([point.lng, point.lat]);
        } else {
          reject(new Error(`地��解��失败: ${address}`));
        }
      }, '全国');
    });
  }

  /**
   * 逆地��解�� (坐标转地��)
   */
  async reverseGeocode(lng, lat) {
    const BMap = window.BMap;
    const geocoder = new BMap.Geocoder();

    return new Promise((resolve, reject) => {
      geocoder.getLocation(new BMap.Point(lng, lat), (result) => {
        if (result) {
          resolve(result.address);
        } else {
          reject(new Error(`逆地��解��失败`));
        }
      });
    });
  }

  /**
   * 关��词���索 (POI �����索)
   */
  async searchPlaces(keyword, options = {}) {
    const BMap = window.BMap;
    const localSearch = new BMap.LocalSearch(options.city || '全国', {
      pageCapacity: options.pageSize || 20,
      renderOptions: { map: this.map, autoViewport: true }
    });

    return new Promise((resolve, reject) => {
      localSearch.setSearchCompleteCallback((results) => {
        if (localSearch.getStatus() === BMAP_STATUS_SUCCESS) {
          const pois = [];
          for (let i = 0; i < results.getCurrentNumPois(); i++) {
            pois.push(results.getPoi(i));
          }
          resolve(pois);
        } else {
          reject(new Error(`���索失败`));
        }
      });
      localSearch.search(keyword);
    });
  }

  /**
   * �����取配送范�� (��形)
   */
  getDeliveryRange(center, radius = 5000) {
    const BMap = window.BMap;
    const point = new BMap.Point(center[0], center[1]);
    return new BMap.Circle(point, radius, {
      strokeColor: '#1890ff',
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: '#1890ff',
      fillOpacity: 0.2
    });
  }

  /**
   * 设置地图中心点
   */
  setCenter(lng, lat) {
    if (this.map) {
      this.map.setCenter(new BMap.Point(lng, lat));
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
   * ����加标记点
   */
  addMarker(options) {
    const BMap = window.BMap;
    const point = new BMap.Point(options.position[0], options.position[1]);
    const marker = new BMap.Marker(point, {
      title: options.title,
      enableDragging: options.draggable || false
    });

    if (options.icon) {
      const icon = new BMap.Icon(options.icon, new BMap.Size(options.iconSize[0], options.iconSize[1]));
      marker.setIcon(icon);
    }

    if (this.map) {
      this.map.addOverlay(marker);
    }

    return marker;
  }

  /**
   * �������地图
   */
  destroy() {
    if (this.map) {
      this.map.clearOverlays();
      this.map = null;
      this.loaded = false;
    }
  }
}

export default BaiduMapAdapter;