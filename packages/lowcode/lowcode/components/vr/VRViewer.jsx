/**
 * VR ��看器组件
 * ��于 Three.js + WebXR 的全景图/VR ��容查看器
 */
export class VRViewer {
  constructor(config = {}) {
    this.config = {
      container: config.container,
      enableVR: config.enableVR !== false,
      enableGyroscope: config.enableGyroscope !== false,
      autoRotate: config.autoRotate || false,
      autoRotateSpeed: config.autoRotateSpeed || 0.5,
      ...config
    };

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;
    this.xrButton = null;
    this.currentTexture = null;
    this.animationId = null;
    this.isVRMode = false;
    this.gyroscopeEnabled = false;
  }

  /**
   * 初始化 VR ��看器
   */
  async init() {
    // ��查 Three.js 是否可用
    if (!window.THREE) {
      await this._loadThreeJS();
    }

    const THREE = window.THREE;

    // 创建����器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(
      this.config.container.clientWidth,
      this.config.container.clientHeight
    );
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.xr.enabled = this.config.enableVR;
    this.config.container.appendChild(this.renderer.domElement);

    // 创建场景
    this.scene = new THREE.Scene();

    // 创建相机
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.config.container.clientWidth / this.config.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0.1);

    // 创建球体几何体 (用于全景图)
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // 反转法线，使��理朝内

    // 创建材质
    const material = new THREE.MeshBasicMaterial({
      map: null,
      side: THREE.BackSide
    });

    this.panoMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.panoMesh);

    // ��加环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    // 初始化控制器
    this._initControls();

    // 处理��口大小变化
    window.addEventListener('resize', this._onResize.bind(this));

    // ��始������环
    this._animate();

    // 初始化�������
    if (this.config.enableGyroscope) {
      await this._initGyroscope();
    }

    return this;
  }

  /**
   * 加载 Three.js
   */
  _loadThreeJS() {
    return new Promise((resolve, reject) => {
      if (window.THREE) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/three@0.160.0/build/three.min.js';
      script.async = true;
      script.onload = () => {
        // 加载 OrbitControls
        const controlsScript = document.createElement('script');
        controlsScript.src = 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
        controlsScript.async = true;
        controlsScript.onload = () => {
          // 加载 VRButton
          const vrScript = document.createElement('script');
          vrScript.src = 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js';
          vrScript.async = true;
          vrScript.onload = () => resolve();
          vrScript.onerror = () => reject(new Error('VRButton 加载失败'));
          document.head.appendChild(vrScript);
        };
        controlsScript.onerror = () => reject(new Error('OrbitControls 加载失败'));
        document.head.appendChild(controlsScript);
      };
      script.onerror = () => reject(new Error('Three.js 加载失败'));
      document.head.appendChild(script);
    });
  }

  /**
   * 初始化控制器
   */
  _initControls() {
    const THREE = window.THREE;

    // ��道控制器 (��面端)
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 2;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.target.set(0, 0, 0);

    // VR ����
    if (this.config.enableVR && this.renderer.xr.enabled) {
      this.xrButton = THREE.VRButton.createButton(this.renderer);
      this.xrButton.style.position = 'absolute';
      this.xrButton.style.bottom = '20px';
      this.xrButton.style.right = '20px';
      this.xrButton.style.zIndex = '1000';
      this.config.container.appendChild(this.xrButton);

      // ��听 VR 会话开始/结束
      this.renderer.xr.addEventListener('sessionstart', () => {
        this.isVRMode = true;
        this.controls.enabled = false;
      });

      this.renderer.xr.addEventListener('sessionend', () => {
        this.isVRMode = false;
        this.controls.enabled = true;
      });
    }
  }

  /**
   * 初始化�������
   */
  async _initGyroscope() {
    if (!window.DeviceOrientationEvent) {
      console.warn('设备不支持�������');
      return;
    }

    try {
      // 请求权限 (iOS 13+)
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          console.warn('�������权限被��绝');
          return;
        }
      }

      this.gyroscopeEnabled = true;

      window.addEventListener('deviceorientation', (event) => {
        if (!this.gyroscopeEnabled || this.isVRMode) return;

        const THREE = window.THREE;
        const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
        const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
        const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

        // 更新相机旋转
        this.camera.rotation.set(beta, -alpha, -gamma, 'YXZ');
      });
    } catch (error) {
      console.warn('�������初始化失败:', error);
    }
  }

  /**
   * 加载全景图片
   */
  async loadPanorama(imageUrl) {
    const THREE = window.THREE;

    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        imageUrl,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.encoding = THREE.sRGBEncoding;

          this.panoMesh.material.map = texture;
          this.panoMesh.material.needsUpdate = true;
          this.currentTexture = texture;

          resolve(texture);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * 加载视��全景
   */
  async loadPanoramaVideo(videoUrl) {
    const THREE = window.THREE;

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;

      video.addEventListener('loadeddata', () => {
        video.play();

        const texture = new THREE.VideoTexture(video);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        this.panoMesh.material.map = texture;
        this.panoMesh.material.needsUpdate = true;
        this.currentTexture = texture;

        resolve(texture);
      });

      video.addEventListener('error', reject);
      video.src = videoUrl;
      video.load();
    });
  }

  /**
   * ��加热点标记
   */
  addHotspot(options) {
    const THREE = window.THREE;
    const { position, content, onClick, size = 32 } = options;

    // 创建热点精灵
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    const ctx = canvas.getContext('2d');

    // ��制热点图标
    ctx.beginPath();
    ctx.arc(size, size, size - 2, 0, Math.PI * 2);
    ctx.fillStyle = options.color || '#1890ff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (options.icon) {
      const img = new Image();
      img.src = options.icon;
      img.onload = () => {
        ctx.drawImage(img, 4, 4, size * 2 - 8, size * 2 - 8);
        sprite.material.map.needsUpdate = true;
      };
    }

    const spriteMaterial = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(size / 10, size / 10, 1);

    // ��换球坐标到��卡尔坐标
    const { theta, phi } = options.position; // theta: 水平角, phi: ���直角
    const radius = 500;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    sprite.position.set(x, y, z);
    sprite.userData = { onClick, content };

    this.scene.add(sprite);
    this.hotspots = this.hotspots || [];
    this.hotspots.push(sprite);

    // 点击事件处理
    if (onClick) {
      const handleClick = (event) => {
        const mouse = new THREE.Vector2();
        mouse.x = (event.clientX / this.renderer.domElement.clientWidth) * 2 - 1;
        mouse.y = -(event.clientY / this.renderer.domElement.clientHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const intersects = raycaster.intersectObjects(this.hotspots);
        if (intersects.length > 0) {
          const hotspot = intersects[0].object;
          if (hotspot.userData.onClick) {
            hotspot.userData.onClick(hotspot.userData.content);
          }
        }
      };

      this.renderer.domElement.addEventListener('click', handleClick);
      sprite._clickHandler = handleClick;
    }

    return sprite;
  }

  /**
   * 移除热点
   */
  removeHotspot(hotspot) {
    if (hotspot && hotspot.parent) {
      hotspot.parent.remove(hotspot);
    }
    this.hotspots = this.hotspots?.filter(h => h !== hotspot) || [];
  }

  /**
   * ��除所有热点
   */
  clearHotspots() {
    this.hotspots?.forEach(h => {
      if (h.parent) h.parent.remove(h);
    });
    this.hotspots = [];
  }

  /**
   * 设置自动旋转
   */
  setAutoRotate(enabled, speed = 0.5) {
    this.config.autoRotate = enabled;
    this.config.autoRotateSpeed = speed;
    if (this.controls) {
      this.controls.autoRotate = enabled;
      this.controls.autoRotateSpeed = speed;
    }
  }

  /**
   * 启用/禁用�������
   */
  setGyroscopeEnabled(enabled) {
    this.gyroscopeEnabled = enabled;
  }

  /**
   * 进入 VR ��式
   */
  async enterVR() {
    if (this.renderer.xr.enabled) {
      await this.renderer.xr.getSession().then(() => {
        this.isVRMode = true;
      });
    }
  }

  /**
   * 退出 VR ��式
   */
  exitVR() {
    if (this.renderer.xr.getSession) {
      this.renderer.xr.getSession().then(session => {
        if (session) session.end();
      });
    }
    this.isVRMode = false;
  }

  /**
   * ��口大小变化处理
   */
  _onResize() {
    const width = this.config.container.clientWidth;
    const height = this.config.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * ������环
   */
  _animate() {
    this.animationId = requestAnimationFrame(this._animate.bind(this));

    if (this.controls && !this.isVRMode) {
      this.controls.update();
    }

    if (this.config.autoRotate && !this.isVRMode && this.controls) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * �����查看器
   */
  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    window.removeEventListener('resize', this._onResize);

    if (this.hotspots) {
      this.clearHotspots();
    }

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.xrButton && this.xrButton.parentNode) {
      this.xrButton.parentNode.removeChild(this.xrButton);
    }

    if (this.currentTexture) {
      this.currentTexture.dispose();
    }

    if (this.panoMesh) {
      this.panoMesh.geometry.dispose();
      this.panoMesh.material.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }
}

export default VRViewer;