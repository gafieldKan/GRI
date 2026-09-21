/**
 * VR 热点标记组件
 * 用于在 VR/全景场景中��加交互式热点
 */
export class HotspotMarker {
  constructor(config = {}) {
    this.config = {
      position: config.position || { theta: 0, phi: Math.PI / 2 },
      content: config.content || '',
      title: config.title || '',
      description: config.description || '',
      icon: config.icon || null,
      color: config.color || '#1890ff',
      size: config.size || 48,
      onClick: config.onClick || (() => {}),
      onHover: config.onHover || (() => {}),
      ...config
    };

    this.sprite = null;
    this.tooltip = null;
    this.isHovered = false;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }

  /**
   * 创建热点标记
   */
  create(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    const THREE = window.THREE;
    if (!THREE) {
      throw new Error('Three.js 未加载');
    }

    // 创建画布用于��制热点图标
    const canvas = document.createElement('canvas');
    const size = this.config.size * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // ��制外��
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = this.config.color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // ��制内部图标
    if (this.config.icon) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = this.config.icon;
      img.onload = () => {
        ctx.drawImage(img, 4, 4, size - 8, size - 8);
        this._updateTexture();
      };
    } else {
      // ��认��制 "+" 号
      ctx.beginPath();
      ctx.moveTo(size / 2, size / 4);
      ctx.lineTo(size / 2, size * 3 / 4);
      ctx.moveTo(size / 4, size / 2);
      ctx.lineTo(size * 3 / 4, size / 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // 创建��理
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.needsUpdate = true;

    // 创建精灵材质
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true
    });

    // 创建精灵
    this.sprite = new THREE.Sprite(spriteMaterial);
    this.sprite.scale.set(this.config.size / 50, this.config.size / 50, 1);

    // 设置位置 (球坐标转��卡尔坐标)
    this._updatePosition();

    // 存��用户数据
    this.sprite.userData = {
      hotspot: this,
      onClick: this.config.onClick,
      onHover: this.config.onHover,
      content: this.config.content,
      title: this.config.title,
      description: this.config.description
    };

    // ����加到场景
    scene.add(this.sprite);

    // 创建 tooltip
    this._createTooltip();

    return this.sprite;
  }

  /**
   * 更新位置 (球坐标转��卡尔坐标)
   */
  _updatePosition() {
    const { theta, phi, radius = 500 } = this.config.position;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    if (this.sprite) {
      this.sprite.position.set(x, y, z);
    }
  }

  /**
   * 创建 tooltip
   */
  _createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'vr-hotspot-tooltip';
    this.tooltip.style.cssText = `
      position: absolute;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      max-width: 280px;
      z-index: 1000;
      display: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(4px);
    `;

    this.tooltip.innerHTML = `
      <div class="tooltip-title" style="font-weight: 600; margin-bottom: 8px; color: ${this.config.color};">${this.config.title || '热点'}</div>
      <div class="tooltip-content" style="line-height: 1.5;">${this.config.content || this.config.description || ''}</div>
    `;

    document.body.appendChild(this.tooltip);

    // ��听��标移动
    const handleMouseMove = (event) => {
      if (!this.sprite || !this.renderer) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouse = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1
      };

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      const intersects = raycaster.intersectObject(this.sprite);
      this.isHovered = intersects.length > 0;

      if (this.isHovered) {
        this.tooltip.style.display = 'block';
        this.tooltip.style.left = `${event.clientX + 16}px`;
        this.tooltip.style.top = `${event.clientY - 40}px`;

        // ��发 hover 回调
        this.config.onHover?.(this.config.content, true);
      } else {
        this.tooltip.style.display = 'none';
        this.config.onHover?.(this.config.content, false);
      }
    };

    this.renderer.domElement.addEventListener('mousemove', handleMouseMove);
    this._mouseMoveHandler = handleMouseMove;

    // 点击事件
    const handleClick = (event) => {
      if (!this.sprite || !this.renderer) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouse = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1
      };

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      const intersects = raycaster.intersectObject(this.sprite);
      if (intersects.length > 0) {
        this.config.onClick?.(this.config.content, this.config);
      }
    };

    this.renderer.domElement.addEventListener('click', handleClick);
    this._clickHandler = handleClick;
  }

  /**
   * 更新位置
   */
  setPosition(theta, phi, radius = 500) {
    this.config.position = { theta, phi, radius };
    this._updatePosition();
  }

  /**
   * 更新内容
   */
  setContent(content) {
    this.config.content = content;
    if (this.tooltip) {
      this.tooltip.querySelector('.tooltip-content').textContent = content;
    }
  }

  /**
   * 更新标题
   */
  setTitle(title) {
    this.config.title = title;
    if (this.tooltip) {
      this.tooltip.querySelector('.tooltip-title').textContent = title;
    }
  }

  /**
   * 显示/��藏
   */
  setVisible(visible) {
    if (this.sprite) {
      this.sprite.visible = visible;
    }
  }

  /**
   * �����热点
   */
  destroy() {
    // 移除场景中的精灵
    if (this.sprite && this.sprite.parent) {
      this.sprite.parent.remove(this.sprite);
    }

    // 移除 tooltip
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }

    // 移除事件��听
    if (this.renderer && this._mouseMoveHandler) {
      this.renderer.domElement.removeEventListener('mousemove', this._mouseMoveHandler);
    }
    if (this.renderer && this._clickHandler) {
      this.renderer.domElement.removeEventListener('click', this._clickHandler);
    }

    // ��理资源
    if (this.texture) {
      this.texture.dispose();
    }
    if (this.sprite) {
      this.sprite.material.dispose();
    }

    this.sprite = null;
    this.tooltip = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
  }
}

export default HotspotMarker;