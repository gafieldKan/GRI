/**
 * 配送范��组件
 * 用于在地图上��制和管理配送/服务范��
 */
export class DeliveryRange {
  constructor(config = {}) {
    this.config = {
      mapProvider: config.mapProvider || 'gaode',
      mapKey: config.mapKey || process.env.GAODE_API_KEY,
      defaultRadius: config.defaultRadius || 5000, // 5km
      defaultCenter: config.defaultCenter || [116.397428, 39.90923],
      editable: config.editable !== false,
      onRangeChange: config.onRangeChange || (() => {}),
      ...config
    };

    this.map = null;
    this.rangeOverlay = null;
    this.marker = null;
    this.circle = null;
    this.polygon = null;
    this.editMode = false;
  }

  /**
   * ����载配送范��组件
   */
  async mount(mapInstance) {
    this.map = mapInstance;

    // 创建配送范��控件 UI
    this._createUI();

    // ��认��制��形范��
    this.drawCircle(this.config.defaultCenter, this.config.defaultRadius);

    return this;
  }

  /**
   * 创建 UI ��件
   */
  _createUI() {
    const container = document.createElement('div');
    container.className = 'delivery-range-control';
    container.innerHTML = `
      <div class="delivery-range-header">
        <span class="range-title">配送范��设置</span>
      </div>
      <div class="range-type-selector">
        <label class="range-type-btn ${this.currentType === 'circle' ? 'active' : ''}" data-type="circle">
          <span class="type-icon">����</span> ��形范��
        </label>
        <label class="range-type-btn ${this.currentType === 'polygon' ? 'active' : ''}" data-type="polygon">
          <span class="type-icon">����</span> 多边形范��
        </label>
      </div>
      <div class="range-controls" id="circle-controls">
        <div class="control-group">
          <label>中心点经度:</label>
          <input type="number" step="0.000001" class="range-input" id="center-lng" value="${this.config.defaultCenter[0]}">
        </div>
        <div class="control-group">
          <label>中心点��度:</label>
          <input type="number" step="0.000001" class="range-input" id="center-lat" value="${this.config.defaultCenter[1]}">
        </div>
        <div class="control-group">
          <label>半径 (米):</label>
          <input type="number" min="100" max="50000" class="range-input" id="range-radius" value="${this.config.defaultRadius}">
        </div>
      </div>
      <div class="range-controls" id="polygon-controls" style="display: none;">
        <button class="range-btn" id="start-draw-polygon">开始��制多边形</button>
        <button class="range-btn secondary" id="finish-draw-polygon" style="display: none;">完成��制</button>
        <button class="range-btn danger" id="clear-polygon">清除多边形</button>
      </div>
      <div class="range-actions">
        <button class="range-btn primary" id="apply-range">应用范��</button>
        <button class="range-btn secondary" id="clear-range">清除范��</button>
      </div>
    `;

    // 将控件��加到地图容器
    const mapContainer = this.map.getContainer?.() || this.map.getDiv?.() || document.querySelector('.map-canvas');
    if (mapContainer) {
      mapContainer.appendChild(container);
    }

    this.container = container;
    this._bindEvents();
  }

  get currentType() {
    return this.config.currentType || 'circle';
  }

  set currentType(type) {
    this.config.currentType = type;
  }

  /**
   * ����定事件
   */
  _bindEvents() {
    // �����类型切换
    this.container.querySelectorAll('.range-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._switchType(btn.dataset.type);
      });
    });

    // ��形控制
    const applyBtn = this.container.querySelector('#apply-range');
    const clearBtn = this.container.querySelector('#clear-range');
    const centerLng = this.container.querySelector('#center-lng');
    const centerLat = this.container.querySelector('#center-lat');
    const radiusInput = this.container.querySelector('#range-radius');

    applyBtn?.addEventListener('click', () => {
      this.drawCircle(
        [parseFloat(centerLng.value), parseFloat(centerLat.value)],
        parseInt(radiusInput.value)
      );
    });

    clearBtn?.addEventListener('click', () => {
      this.clearRange();
    });

    // 实时更新��形
    [centerLng, centerLat, radiusInput].forEach(input => {
      input?.addEventListener('change', () => {
        if (this.currentType === 'circle') {
          this.drawCircle(
            [parseFloat(centerLng.value), parseFloat(centerLat.value)],
            parseInt(radiusInput.value)
          );
        }
      });
    });

    // 多边形控制
    const startDrawBtn = this.container.querySelector('#start-draw-polygon');
    const finishDrawBtn = this.container.querySelector('#finish-draw-polygon');
    const clearPolygonBtn = this.container.querySelector('#clear-polygon');

    startDrawBtn?.addEventListener('click', () => {
      this._startDrawPolygon();
    });

    finishDrawBtn?.addEventListener('click', () => {
      this._finishDrawPolygon();
    });

    clearPolygonBtn?.addEventListener('click', () => {
      this.clearPolygon();
    });
  }

  /**
   * 切换范��类型
   */
  _switchType(type) {
    this.currentType = type;

    // 更新按��状态
    this.container.querySelectorAll('.range-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // 显示/��藏对应控制面板
    this.container.querySelector('#circle-controls').style.display = type === 'circle' ? 'block' : 'none';
    this.container.querySelector('#polygon-controls').style.display = type === 'polygon' ? 'block' : 'none';

    // ��除当前范��
    this.clearRange();
  }

  /**
   * ��制��形配送范��
   */
  drawCircle(center, radius) {
    this.clearRange();

    if (!this.map) return;

    const Adapter = this.map.constructor;
    // 根据地图类型��制��形
    if (this.map.getContainer) {
      // 高德地图
      const AMap = window.AMap;
      this.circle = new AMap.Circle({
        center: new AMap.LngLat(center[0], center[1]),
        radius: radius,
        fillColor: '#1890ff',
        fillOpacity: 0.2,
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        zIndex: 100
      });
      this.circle.setMap(this.map);

      // 中心点标记
      this.marker = new AMap.Marker({
        position: new AMap.LngLat(center[0], center[1]),
        icon: new AMap.Icon({
          size: new AMap.Size(24, 24),
          image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMxODkwZmYiIGZpbGwtb3BhY2l0eT0iMC4yIiBzdHJva2U9IiMxODkwZmYiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=',
          imageOffset: new AMap.Pixel(-12, -12)
        }),
        zIndex: 101
      });
      this.marker.setMap(this.map);

      this.config.onRangeChange?.({
        type: 'circle',
        center,
        radius,
        area: Math.PI * radius * radius
      });
    } else if (this.map.addOverlay) {
      // 百度地图
      const BMap = window.BMap;
      const point = new BMap.Point(center[0], center[1]);
      this.circle = new BMap.Circle(point, radius, {
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: '#1890ff',
        fillOpacity: 0.2
      });
      this.map.addOverlay(this.circle);

      this.marker = new BMap.Marker(point, {
        icon: new BMap.Icon('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMxODkwZmYiIGZpbGwtb3BhY2l0eT0iMC4yIiBzdHJva2U9IiMxODkwZmYiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=', new BMap.Size(24, 24))
      });
      this.map.addOverlay(this.marker);

      this.config.onRangeChange?.({
        type: 'circle',
        center,
        radius,
        area: Math.PI * radius * radius
      });
    }
  }

  /**
   * ��始��制多边形
   */
  _startDrawPolygon() {
    this.editMode = true;
    this.polygonPoints = [];

    this.container.querySelector('#start-draw-polygon').style.display = 'none';
    this.container.querySelector('#finish-draw-polygon').style.display = 'inline-block';

    // ��听地图点击
    this._clickHandler = (e) => {
      const point = e.lnglat || e.point || [e.lng, e.lat];
      this.polygonPoints.push(point);

      // ��加临时标记
      this._addTempMarker(point);

      if (this.polygonPoints.length >= 3) {
        this._updateTempPolygon();
      }
    };

    if (this.map.on) {
      this.map.on('click', this._clickHandler);
    } else if (this.map.addEventListener) {
      this.map.addEventListener('click', this._clickHandler);
    }
  }

  /**
   * 完成��制多边形
   */
  _finishDrawPolygon() {
    this.editMode = false;

    this.container.querySelector('#start-draw-polygon').style.display = 'inline-block';
    this.container.querySelector('#finish-draw-polygon').style.display = 'none';

    // 移除点击��听
    if (this.map.off) {
      this.map.off('click', this._clickHandler);
    } else if (this.map.removeEventListener) {
      this.map.removeEventListener('click', this._clickHandler);
    }

    if (this.polygonPoints.length >= 3) {
      this.drawPolygon(this.polygonPoints);
    }

    // ��除临时标记
    this._clearTempMarkers();
  }

  /**
   * ��制多边形配送范��
   */
  drawPolygon(points) {
    this.clearPolygon();

    if (!this.map || points.length < 3) return;

    if (this.map.getContainer) {
      // 高德地图
      const AMap = window.AMap;
      const path = points.map(p => new AMap.LngLat(p[0], p[1]));

      this.polygon = new AMap.Polygon({
        path,
        fillColor: '#1890ff',
        fillOpacity: 0.2,
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        zIndex: 100
      });
      this.polygon.setMap(this.map);

      // 计算面��
      const area = this._calculatePolygonArea(points);

      this.config.onRangeChange?.({
        type: 'polygon',
        points,
        area
      });
    } else if (this.map.addOverlay) {
      // 百度地图
      const BMap = window.BMap;
      const bmapPoints = points.map(p => new BMap.Point(p[0], p[1]));

      this.polygon = new BMap.Polygon(bmapPoints, {
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: '#1890ff',
        fillOpacity: 0.2
      });
      this.map.addOverlay(this.polygon);

      const area = this._calculatePolygonArea(points);

      this.config.onRangeChange?.({
        type: 'polygon',
        points,
        area
      });
    }
  }

  /**
   * ��除��形范��
   */
  clearRange() {
    if (this.circle) {
      if (this.circle.setMap) {
        this.circle.setMap(null);
      } else if (this.map.removeOverlay) {
        this.map.removeOverlay(this.circle);
      }
      this.circle = null;
    }

    if (this.marker) {
      if (this.marker.setMap) {
        this.marker.setMap(null);
      } else if (this.map.removeOverlay) {
        this.map.removeOverlay(this.marker);
      }
      this.marker = null;
    }
  }

  /**
   * ��除多边形范��
   */
  clearPolygon() {
    if (this.polygon) {
      if (this.polygon.setMap) {
        this.polygon.setMap(null);
      } else if (this.map.removeOverlay) {
        this.map.removeOverlay(this.polygon);
      }
      this.polygon = null;
    }
    this.polygonPoints = [];
    this._clearTempMarkers();
  }

  /**
   * ��除所有范��
   */
  clearAll() {
    this.clearRange();
    this.clearPolygon();
  }

  /**
   * �������取当前范��配置
   */
  getRangeConfig() {
    if (this.circle) {
      const center = this.circle.getCenter?.() || this.circle.getCenter?.();
      return {
        type: 'circle',
        center: center ? [center.lng, center.lat] : this.config.defaultCenter,
        radius: this.circle.getRadius?.() || this.config.defaultRadius
      };
    }

    if (this.polygon) {
      return {
        type: 'polygon',
        points: this.polygonPoints
      };
    }

    return null;
  }

  /**
   * 计算多边形面�� (Gauss's area formula)
   */
  _calculatePolygonArea(points) {
    if (points.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i][0] * points[j][1];
      area -= points[j][0] * points[i][1];
    }
    return Math.abs(area) / 2;
  }

  /**
   * ��加临时标记
   */
  _addTempMarker(point) {
    if (!this.map) return;

    let marker;
    if (this.map.getContainer) {
      // 高德
      const AMap = window.AMap;
      marker = new AMap.Marker({
        position: new AMap.LngLat(point[0], point[1]),
        icon: new AMap.Icon({
          size: new AMap.Size(16, 16),
          image: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjYiIGZpbGw9IiMxODkwZmYiLz4KPC9zdmc+',
          imageOffset: new AMap.Pixel(-8, -8)
        }),
        zIndex: 102
      });
      marker.setMap(this.map);
    } else if (this.map.addOverlay) {
      // 百度
      const BMap = window.BMap;
      marker = new BMap.Marker(new BMap.Point(point[0], point[1]));
      this.map.addOverlay(marker);
    }

    if (!this._tempMarkers) this._tempMarkers = [];
    this._tempMarkers.push(marker);
  }

  /**
   * 更新临时多边形
   */
  _updateTempPolygon() {
    if (!this.map || this.polygonPoints.length < 2) return;

    if (this._tempPolygon) {
      if (this._tempPolygon.setMap) {
        this._tempPolygon.setMap(null);
      } else if (this.map.removeOverlay) {
        this.map.removeOverlay(this._tempPolygon);
      }
    }

    if (this.map.getContainer) {
      const AMap = window.AMap;
      const path = this.polygonPoints.map(p => new AMap.LngLat(p[0], p[1]));

      this._tempPolygon = new AMap.Polygon({
        path,
        fillColor: '#1890ff',
        fillOpacity: 0.1,
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeStyle: 'dashed',
        strokeOpacity: 0.6,
        zIndex: 99
      });
      this._tempPolygon.setMap(this.map);
    } else if (this.map.addOverlay) {
      const BMap = window.BMap;
      const bmapPoints = this.polygonPoints.map(p => new BMap.Point(p[0], p[1]));

      this._tempPolygon = new BMap.Polygon(bmapPoints, {
        strokeColor: '#1890ff',
        strokeWeight: 2,
        strokeStyle: 'dashed',
        strokeOpacity: 0.6,
        fillColor: '#1890ff',
        fillOpacity: 0.1
      });
      this.map.addOverlay(this._tempPolygon);
    }
  }

  /**
   * ��除临时标记
   */
  _clearTempMarkers() {
    if (this._tempMarkers) {
      this._tempMarkers.forEach(marker => {
        if (marker.setMap) {
          marker.setMap(null);
        } else if (this.map.removeOverlay) {
          this.map.removeOverlay(marker);
        }
      });
      this._tempMarkers = [];
    }

    if (this._tempPolygon) {
      if (this._tempPolygon.setMap) {
        this._tempPolygon.setMap(null);
      } else if (this.map.removeOverlay) {
        this.map.removeOverlay(this._tempPolygon);
      }
      this._tempPolygon = null;
    }
  }

  /**
   * �����组件
   */
  destroy() {
    this.clearAll();
    if (this.container) {
      this.container.remove();
    }
    this.container = null;
  }
}

export default DeliveryRange;