/**
 * 电子��名板组件
 * ��于 Canvas 的手写��名组件，支持����、��标、手写��输入
 */
export class SignaturePad {
  constructor(config = {}) {
    this.config = {
      container: config.container,
      width: config.width || '100%',
      height: config.height || 200,
      penColor: config.penColor || '#000000',
      penWidth: config.penWidth || 2,
      minPenWidth: config.minPenWidth || 0.5,
      maxPenWidth: config.maxPenWidth || 4,
      backgroundColor: config.backgroundColor || '#ffffff',
      dotSize: config.dotSize || 0,
      velocityFilterWeight: config.velocityFilterWeight || 0.7,
      onBegin: config.onBegin || (() => {}),
      onEnd: config.onEnd || (() => {}),
      onChange: config.onChange || (() => {}),
      ...config
    };

    this.canvas = null;
    this.ctx = null;
    this.isDrawing = false;
    this.points = [];
    this.lastPoint = null;
    this.lastVelocity = 0;
    this.animationId = null;
    this.devicePixelRatio = window.devicePixelRatio || 1;
  }

  /**
   * 初始化��名板
   */
  init() {
    if (!this.config.container) {
      throw new Error('��名板容器不存在');
    }

    this._createCanvas();
    this._bindEvents();
    this._resize();

    return this;
  }

  /**
   * 创建 Canvas 元素
   */
  _createCanvas() {
    const container = typeof this.config.container === 'string'
      ? document.getElementById(this.config.container)
      : this.config.container;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = this.config.width;
    this.canvas.style.height = this.config.height;
    this.canvas.style.border = '1px solid #ddd';
    this.canvas.style.borderRadius = '8px';
    this.canvas.style.backgroundColor = this.config.backgroundColor;
    this.canvas.style.touchAction = 'none'; // ��止默认����行为
    this.canvas.style.cursor = 'crosshair';

    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.config.penColor;
    this.ctx.fillStyle = this.config.penColor;
  }

  /**
   * ��定事件
   */
  _bindEvents() {
    // ���标事件
    this.canvas.addEventListener('mousedown', this._handlePointerStart.bind(this));
    this.canvas.addEventListener('mousemove', this._handlePointerMove.bind(this));
    this.canvas.addEventListener('mouseup', this._handlePointerEnd.bind(this));
    this.canvas.addEventListener('mouseleave', this._handlePointerEnd.bind(this));

    // ����事件
    this.canvas.addEventListener('touchstart', this._handlePointerStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this._handlePointerMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this._handlePointerEnd.bind(this));
    this.canvas.addEventListener('touchcancel', this._handlePointerEnd.bind(this));

    // ����事件 (统一��标/����/手写��)
    if (window.PointerEvent) {
      this.canvas.addEventListener('pointerdown', this._handlePointerStart.bind(this));
      this.canvas.addEventListener('pointermove', this._handlePointerMove.bind(this));
      this.canvas.addEventListener('pointerup', this._handlePointerEnd.bind(this));
      this.canvas.addEventListener('pointerleave', this._handlePointerEnd.bind(this));
      this.canvas.addEventListener('pointercancel', this._handlePointerEnd.bind(this));
    }

    // ��口大小变化
    window.addEventListener('resize', this._debouncedResize.bind(this));
  }

  /**
   * ���取指��坐标
   */
  _getPointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();

    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) * this.devicePixelRatio,
      y: (clientY - rect.top) * this.devicePixelRatio,
      time: Date.now()
    };
  }

  /**
   * ����开始
   */
  _handlePointerStart(event) {
    event.preventDefault();

    if (event.touches && event.touches.length > 1) return; // ���略多点����

    this.isDrawing = true;
    this.points = [];

    const point = this._getPointerPosition(event);
    this.lastPoint = point;
    this.points.push(point);

    this.config.onBegin(point);
  }

  /**
   * ����移动
   */
  _handlePointerMove(event) {
    if (!this.isDrawing) return;
    event.preventDefault();

    const point = this._getPointerPosition(event);
    this.points.push(point);

    this._drawCurve(this.lastPoint, point);
    this.lastPoint = point;

    this.config.onChange(this.points);
  }

  /**
   * ����结束
   */
  _handlePointerEnd(event) {
    if (!this.isDrawing) return;
    event.preventDefault();

    this.isDrawing = false;

    const point = this._getPointerPosition(event);
    this.points.push(point);

    this.config.onEnd(this.points);
  }

  /**
   * ����制贝塞尔曲线
   */
  _drawCurve(start, end) {
    if (!this.ctx) return;

    // 计算速度
    const distance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    const time = end.time - start.time;
    const velocity = time > 0 ? distance / time : 0;

    // 速度平��
    const smoothedVelocity = this.lastVelocity * this.config.velocityFilterWeight +
      velocity * (1 - this.config.velocityFilterWeight);

    // 根据速度计算��画宽度 (越快越��)
    const penWidth = this._calculatePenWidth(smoothedVelocity);

    // ��制二次贝塞尔曲线
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);

    // ��制点为两点中点
    const controlX = (start.x + end.x) / 2;
    const controlY = (start.y + end.y) / 2;

    this.ctx.quadraticCurveTo(controlX, controlY, end.x, end.y);
    this.ctx.lineWidth = penWidth;
    this.ctx.strokeStyle = this.config.penColor;
    this.ctx.stroke();

    // ��制端点��点 (可选)
    if (this.config.dotSize > 0) {
      this.ctx.beginPath();
      this.ctx.arc(end.x, end.y, this.config.dotSize, 0, Math.PI * 2);
      this.ctx.fillStyle = this.config.penColor;
      this.ctx.fill();
    }

    this.lastVelocity = smoothedVelocity;
  }

  /**
   * 根据速度计算��宽
   */
  _calculatePenWidth(velocity) {
    const { minPenWidth, maxPenWidth } = this.config;

    // 速度越快，��画越��
    // ���设正常书写速度范�� 0.5 - 10 px/ms
    const maxVelocity = 10;
    const minVelocity = 0.5;
    const normalizedVelocity = Math.max(0, Math.min(1,
      (velocity - minVelocity) / (maxVelocity - minVelocity)
    ));

    return maxPenWidth - (maxPenWidth - minPenWidth) * normalizedVelocity;
  }

  /**
   * ��空��名
   */
  clear() {
    if (!this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.points = [];
    this.lastPoint = null;
    this.lastVelocity = 0;
  }

  /**
   * ����最后一��
   */
  undo() {
    if (this.points.length === 0) return false;

    // 简单实现：重��除最后一��外的所有��画
    const lastStrokeIndex = this._findLastStrokeStart();
    this.points = this.points.slice(0, lastStrokeIndex);
    this._redraw();
    return true;
  }

  /**
   * ��到最后一��的开始索引
   */
  _findLastStrokeStart() {
    if (this.points.length < 2) return 0;

    // 从后向前��，��到时间间隔大于��值的点
    const threshold = 200; // 200ms
    for (let i = this.points.length - 1; i > 0; i--) {
      if (this.points[i].time - this.points[i - 1].time > threshold) {
        return i;
      }
    }
    return 0;
  }

  /**
   * 重��所有��画
   */
  _redraw() {
    this.clear();

    if (this.points.length < 2) return;

    // 分组��画 (按时间间隔)
    const strokes = this._groupStrokes();

    strokes.forEach(stroke => {
      for (let i = 1; i < stroke.length; i++) {
        this._drawCurve(stroke[i - 1], stroke[i]);
      }
    });
  }

  /**
   * ��时间间隔分组��画
   */
  _groupStrokes() {
    const strokes = [];
    let currentStroke = [this.points[0]];
    const threshold = 200; // 200ms

    for (let i = 1; i < this.points.length; i++) {
      const timeDiff = this.points[i].time - this.points[i - 1].time;

      if (timeDiff > threshold) {
        strokes.push(currentStroke);
        currentStroke = [this.points[i]];
      } else {
        currentStroke.push(this.points[i]);
      }
    }

    if (currentStroke.length > 0) {
      strokes.push(currentStroke);
    }

    return strokes;
  }

  /**
   * ���整 Canvas 大小
   */
  _resize() {
    if (!this.canvas) return;

    const container = this.canvas.parentElement;
    const rect = container.getBoundingClientRect();

    this.canvas.width = rect.width * this.devicePixelRatio;
    this.canvas.height = rect.height * this.devicePixelRatio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
  }

  /**
   * ����调整大小
   */
  _debouncedResize() {
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      const oldWidth = this.canvas.width;
      const oldHeight = this.canvas.height;
      this._resize();

      // 如果尺寸变了，重��
      if (oldWidth !== this.canvas.width || oldHeight !== this.canvas.height) {
        this._redraw();
      }
    }, 100);
  }

  /**
   * ����取��名数据 (Base64 PNG)
   */
  toDataURL(type = 'image/png', quality = 1.0) {
    if (!this.canvas) return null;
    return this.canvas.toDataURL(type, quality);
  }

  /**
   * ����取��名数据 (Blob)
   */
  toBlob(type = 'image/png', quality = 1.0) {
    return new Promise((resolve) => {
      this.canvas.toBlob(resolve, type, quality);
    });
  }

  /**
   * ����取��名数据 (SVG)
   */
  toSVG() {
    if (!this.ctx) return null;

    const strokes = this._groupStrokes();
    const width = this.canvas.width / this.devicePixelRatio;
    const height = this.canvas.height / this.devicePixelRatio;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    svg += `<rect width="${width}" height="${height}" fill="${this.config.backgroundColor}"/>`;

    strokes.forEach(stroke => {
      if (stroke.length < 2) return;

      svg += `<path d="`;
      svg += `M ${stroke[0].x / this.devicePixelRatio} ${stroke[0].y / this.devicePixelRatio}`;

      for (let i = 1; i < stroke.length; i++) {
        const controlX = (stroke[i - 1].x + stroke[i].x) / 2 / this.devicePixelRatio;
        const controlY = (stroke[i - 1].y + stroke[i].y) / 2 / this.devicePixelRatio;
        svg += ` Q ${controlX} ${controlY} ${stroke[i].x / this.devicePixelRatio} ${stroke[i].y / this.devicePixelRatio}`;
      }

      svg += `" stroke="${this.config.penColor}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * 设置����色
   */
  setPenColor(color) {
    this.config.penColor = color;
    if (this.ctx) {
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
    }
  }

  /**
   * 设置��宽
   */
  setPenWidth(width) {
    this.config.penWidth = width;
  }

  /**
   * 设置背景色
   */
  setBackgroundColor(color) {
    this.config.backgroundColor = color;
    this.clear();
  }

  /**
   * 判断是否为空
   */
  isEmpty() {
    return this.points.length === 0;
  }

  /**
   * ����取��画数
   */
  getStrokeCount() {
    return this._groupStrokes().length;
  }

  /**
   * �������组件
   */
  destroy() {
    clearTimeout(this.resizeTimeout);
    window.removeEventListener('resize', this._debouncedResize);

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    this.canvas = null;
    this.ctx = null;
    this.points = [];
  }
}

export default SignaturePad;