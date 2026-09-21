/**
 * 地��选择组件
 * ��于地图的地�����索、选择和展示组件
 */
export class AddressSelect {
  constructor(config = {}) {
    this.config = {
      mapProvider: config.mapProvider || 'gaode',
      mapKey: config.mapKey || process.env.GAODE_API_KEY,
      placeholder: config.placeholder || '请输入地��或���索地点',
      showMap: config.showMap !== false,
      showAutocomplete: config.showAutocomplete !== false,
      onSelect: config.onSelect || (() => {}),
      onSearch: config.onSearch || (() => {}),
      ...config
    };

    this.container = null;
    this.input = null;
    this.dropdown = null;
    this.mapContainer = null;
    this.currentValue = '';
    this.suggestions = [];
    this.selectedIndex = -1;
  }

  /**
   * ��载组件
   */
  async mount(domContainer) {
    this.container = typeof domContainer === 'string'
      ? document.getElementById(domContainer)
      : domContainer;

    if (!this.container) {
      throw new Error('地��选择容器不存在');
    }

    this._createUI();
    this._bindEvents();

    // 初始化地图（如果需要）
    if (this.config.showMap) {
      await this._initMap();
    }

    return this;
  }

  /**
   * 创建 UI 结构
   */
  _createUI() {
    this.container.innerHTML = `
      <div class="address-select">
        <div class="address-input-wrapper">
          <input
            type="text"
            class="address-input"
            placeholder="${this.config.placeholder}"
            autocomplete="off"
            aria-label="地�����索"
          >
          <div class="address-dropdown" style="display: none;"></div>
        </div>
        ${this.config.showMap ? `
          <div class="address-map-container" style="height: 300px; margin-top: 12px; border-radius: 8px; overflow: hidden;">
            <div id="address-map-canvas" style="width: 100%; height: 100%;"></div>
          </div>
        ` : ''}
      </div>
    `;

    this.input = this.container.querySelector('.address-input');
    this.dropdown = this.container.querySelector('.address-dropdown');
    this.mapContainer = this.container.querySelector('#address-map-canvas');
  }

  /**
   * ��定事件
   */
  _bindEvents() {
    // ��入��事件
    this.input.addEventListener('input', (e) => {
      this.currentValue = e.target.value;
      this._debouncedSearch(this.currentValue);
    });

    this.input.addEventListener('focus', () => {
      if (this.currentValue) {
        this._showDropdown();
      }
    });

    this.input.addEventListener('keydown', (e) => {
      this._handleKeydown(e);
    });

    // 点击外部关闭下拉
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this._hideDropdown();
      }
    });
  }

  /**
   * 初始化地图
   */
  async _initMap() {
    const { MapFactory } = await import('./MapFactory.js');
    const adapter = MapFactory.createAdapter(this.config.mapProvider, {
      apiKey: this.config.mapKey
    });

    this.map = await adapter.init(this.mapContainer, {
      center: [116.397428, 39.90923],
      zoom: 12
    });
  }

  /**
   * �������索
   */
  _debouncedSearch(value) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this._search(value);
    }, 300);
  }

  /**
   * ���索地��
   */
  async _search(keyword) {
    if (!keyword.trim()) {
      this.suggestions = [];
      this._updateDropdown();
      return;
    }

    try {
      const { MapFactory } = await import('./MapFactory.js');
      const adapter = MapFactory.getDefault({ apiKey: this.config.mapKey });
      const pois = await adapter.searchPlaces(keyword);

      this.suggestions = pois.map(poi => ({
        name: poi.name,
        address: poi.address || poi.formattedAddress,
        location: poi.location || [poi.lng, poi.lat],
        type: poi.type
      }));

      this.config.onSearch?.(this.suggestions);
      this._updateDropdown();
    } catch (error) {
      console.error('地�����索失败:', error);
      this.suggestions = [];
      this._updateDropdown();
    }
  }

  /**
   * 更新下拉菜单
   */
  _updateDropdown() {
    if (this.suggestions.length === 0) {
      this._hideDropdown();
      return;
    }

    this.dropdown.innerHTML = this.suggestions.map((item, index) => `
      <div class="address-suggestion-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
        <span class="suggestion-name">${item.name}</span>
        <span class="suggestion-address">${item.address}</span>
      </div>
    `).join('');

    this._showDropdown();
  }

  /**
   * 显示下拉
   */
  _showDropdown() {
    this.dropdown.style.display = 'block';
  }

  /**
   * ��藏下拉
   */
  _hideDropdown() {
    this.dropdown.style.display = 'none';
    this.selectedIndex = -1;
  }

  /**
   * 处理����事件
   */
  _handleKeydown(e) {
    if (this.dropdown.style.display === 'none') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
        this._updateDropdown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this._updateDropdown();
        break;
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this._selectSuggestion(this.selectedIndex);
        }
        break;
      case 'Escape':
        this._hideDropdown();
        break;
    }
  }

  /**
   * 选择建议项
   */
  async _selectSuggestion(index) {
    const item = this.suggestions[index];
    if (!item) return;

    this.currentValue = item.name;
    this.input.value = item.name;
    this._hideDropdown();

    // 回调
    this.config.onSelect(item);

    // 如果有地图，定位到选中位置
    if (this.map && item.location) {
      const [lng, lat] = item.location;
      this.map.setCenter(lng, lat);
      this.map.setZoom(16);

      // �����加标记
      this.map.addMarker({
        position: item.location,
        title: item.name
      });
    }
  }

  /**
   * 设置值
   */
  setValue(value) {
    this.currentValue = value;
    this.input.value = value;
  }

  /**
   * �������取值
   */
  getValue() {
    return this.currentValue;
  }

  /**
   * �����组件
   */
  destroy() {
    clearTimeout(this.searchTimeout);
    if (this.map) {
      this.map.destroy();
    }
    this.container = null;
  }
}

export default AddressSelect;