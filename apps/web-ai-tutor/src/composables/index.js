/**
 * 通用组合式函数
 * 提供常用的响应式逻辑复用
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useToast } from '@/components/ui/Toast.vue'
import { useModal } from '@/components/ui/Modal.vue'

// 使用示例：
// const { loading, execute } = useApi(() => api.getData())
// const { loading, execute } = useApi(() => api.postData(data), { immediate: true })

/**
 * API 请求封装
 * @param {Function} apiFn - API 函数
 * @param {Object} options - 配置选项
 * @returns {Object} { loading, error, data, execute, abort }
 */
export function useApi(apiFn, options = {}) {
  const {
    immediate = false,
    onSuccess,
    onError,
    loadingDelay = 0,
    debounce = 0
  } = options

  const loading = ref(false)
  const error = ref(null)
  const data = ref(null)
  let abortController = null
  let debounceTimer = null
  let loadingTimer = null

  const execute = async (...args) => {
    // 清除之前的防抖
    if (debounceTimer) clearTimeout(debounceTimer)
    if (loadingTimer) clearTimeout(loadingTimer)

    // 取消之前的请求
    if (abortController) abortController.abort()
    abortController = new AbortController()

    return new Promise((resolve, reject) => {
      const run = async () => {
        loading.value = true
        error.value = null

        try {
          const result = await apiFn(...args, { signal: abortController.signal })
          data.value = result
          if (onSuccess) onSuccess(result)
          resolve(result)
        } catch (e) {
          error.value = e
          if (onError) onError(e)
          reject(e)
        } finally {
          loading.value = false
        }
      }

      if (debounce > 0) {
        debounceTimer = setTimeout(run, debounce)
      } else {
        if (loadingDelay > 0) {
          loadingTimer = setTimeout(() => {
            loading.value = true
            run()
          }, loadingDelay)
        } else {
          run()
        }
      }
    })
  }

  const abort = () => {
    if (abortController) abortController.abort()
    loading.value = false
  }

  const reset = () => {
    data.value = null
    error.value = null
    loading.value = false
  }

  if (immediate) {
    execute()
  }

  onUnmounted(() => abort())

  return {
    loading,
    error,
    data,
    execute,
    abort,
    reset
  }
}

/**
 * 表单验证
 * @param {Object} rules - 验证规则 { field: [validator1, validator2] }
 * @param {Object} initialValues - 初始值
 */
export function useForm(rules = {}, initialValues = {}) {
  const values = ref({ ...initialValues })
  const errors = ref({})
  const touched = ref({})
  const submitting = ref(false)

  // 内置验证器
  const validators = {
    required: (msg = '此字段为必填项') => (value) =>
      !value || (Array.isArray(value) && value.length === 0) ? msg : null,
    email: (msg = '邮箱格式不正确') => (value) =>
      value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? msg : null,
    phone: (msg = '手机号格式不正确') => (value) =>
      value && !/^1[3-9]\d{9}$/.test(value) ? msg : null,
    minLength: (len, msg) => (value) =>
      value && value.length < len ? msg || `至少输入 ${len} 个字符` : null,
    maxLength: (len, msg) => (value) =>
      value && value.length > len ? msg || `最多输入 ${len} 个字符` : null,
    pattern: (regex, msg) => (value) =>
      value && !regex.test(value) ? msg : null,
    match: (field, msg) => (value, allValues) =>
      value !== allValues[field] ? msg : null,
    min: (min, msg) => (value) =>
      value !== undefined && value !== '' && Number(value) < min ? msg : null,
    max: (max, msg) => (value) =>
      value !== undefined && value !== '' && Number(value) > max ? msg : null
  }

  // 验证单个字段
  const validateField = (field) => {
    const fieldRules = rules[field]
    if (!fieldRules) return null

    const value = values.value[field]
    for (const rule of fieldRules) {
      const error = rule(value, values.value)
      if (error) {
        errors.value[field] = error
        return error
      }
    }
    delete errors.value[field]
    return null
  }

  // 验证所有字段
  const validate = () => {
    let isValid = true
    Object.keys(rules).forEach(field => {
      if (validateField(field)) isValid = false
    })
    return isValid
  }

  // 设置字段值
  const setFieldValue = (field, value) => {
    values.value[field] = value
    if (touched.value[field]) {
      validateField(field)
    }
  }

  // 设置字段触摸状态
  const setFieldTouched = (field, isTouched = true) => {
    touched.value[field] = isTouched
    if (isTouched) validateField(field)
  }

  // 重置表单
  const resetForm = (newValues = {}) => {
    values.value = { ...initialValues, ...newValues }
    errors.value = {}
    touched.value = {}
  }

  // 提交处理
  const handleSubmit = async (onSubmit) => {
    if (!validate()) return false

    submitting.value = true
    try {
      await onSubmit(values.value)
      return true
    } catch (e) {
      return false
    } finally {
      submitting.value = false
    }
  }

  return {
    values,
    errors,
    touched,
    submitting,
    setFieldValue,
    setFieldTouched,
    validate,
    validateField,
    resetForm,
    handleSubmit,
    validators
  }
}

/**
 * 防抖函数
 */
export function useDebounce(value, delay = 300) {
  const debounced = ref(value.value)
  let timer = null

  watch(value, (newVal) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.value = newVal
    }, delay)
  })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return debounced
}

/**
 * 节流函数
 */
export function useThrottle(value, delay = 300) {
  const throttled = ref(value.value)
  let lastTime = 0
  let timer = null

  watch(value, (newVal) => {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      throttled.value = newVal
    } else {
      clearTimeout(timer)
      timer = setTimeout(() => {
        lastTime = Date.now()
        throttled.value = newVal
      }, delay - (now - lastTime))
    )
  })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return throttled
}

/**
 * 本地存储响应式
 */
export function useStorage(key, defaultValue, options = {}) {
  const { serializer = JSON.stringify, deserializer = JSON.parse, listen = true } = options

  const stored = uni.getStorageSync(key)
  const value = ref(stored !== '' ? (deserializer(stored) || defaultValue) : defaultValue)

  const setValue = (newValue) => {
    value.value = newValue
    try {
      uni.setStorageSync(key, serializer(newValue))
    } catch (e) {
      console.error('Storage set failed:', e)
    }
  }

  const remove = () => {
    value.value = defaultValue
    try {
      uni.removeStorageSync(key)
    } catch (e) {}
  }

  if (listen) {
    // 监听 storage 事件（仅 H5）
    // #ifdef H5
    window.addEventListener('storage', (e) => {
      if (e.key === key && e.newValue !== e.oldValue) {
        value.value = e.newValue ? deserializer(e.newValue) : defaultValue
      }
    })
    // #endif
  }

  return { value, setValue, remove }
}

/**
 * 防抖/节流执行函数
 */
export function useDebounceFn(fn, delay = 300) {
  let timer = null
  let lastArgs = null

  const debounced = (...args) => {
    lastArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...lastArgs)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer)
      fn(...lastArgs)
      timer = null
    }
  }

  onUnmounted(() => debounced.cancel())

  return debounced
}

export function useThrottleFn(fn, delay = 300) {
  let lastTime = 0
  let timer = null
  let lastArgs = null

  const throttled = (...args) => {
    lastArgs = args
    const now = Date.now()

    if (now - lastTime >= delay) {
      lastTime = now
      fn(...args)
    } else {
      clearTimeout(timer)
      timer = setTimeout(() => {
        lastTime = Date.now()
        fn(...lastArgs)
      }, delay)
    }
  }

  throttled.cancel = () => {
    clearTimeout(timer)
  }

  throttled.flush = () => {
    if (timer) {
      clearTimeout(timer)
      fn(...lastArgs)
      timer = null
    }
  }

  onUnmounted(() => throttled.cancel())

  return throttled
}

/**
 * 点击外部关闭
 */
export function useClickOutside(target, handler, options = {}) {
  const { capture = false, ignoreClass = 'ignore-click-outside' } = options

  const handleClick = (e) => {
    const el = target.value
    if (!el) return

    // 检查是否点击了忽略元素
    if (e.target.closest(`.${ignoreClass}`)) return

    // 检查是否点击在目标元素外部
    if (!el.contains(e.target)) {
      handler(e)
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleClick, capture)
    document.addEventListener('touchstart', handleClick, capture)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClick, capture)
    document.removeEventListener('touchstart', handleClick, capture)
  })
}

/**
 * 键盘快捷键
 */
export function useHotkeys(shortcuts, options = {}) {
  const { preventDefault = true, target = window } = options

  const handleKeydown = (e) => {
    const key = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey

    const combo = [
      ctrl && 'ctrl',
      shift && 'shift',
      alt && 'alt',
      key
    ].filter(Boolean).join('+')

    if (shortcuts[combo]) {
      if (preventDefault) e.preventDefault()
      shortcuts[combo](e)
    }
  }

  onMounted(() => {
    target.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    target.removeEventListener('keydown', handleKeydown)
  })
}

/**
 * 媒体查询响应式
 */
export function useMediaQuery(query) {
  const matches = ref(false)

  let mediaQuery = null

  const updateMatches = () => {
    if (mediaQuery) {
      matches.value = mediaQuery.matches
    }
  }

  onMounted(() => {
    // #ifdef H5
    mediaQuery = window.matchMedia(query)
    mediaQuery.addEventListener('change', updateMatches)
    updateMatches()
    // #endif
  })

  onUnmounted(() => {
    // #ifdef H5
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', updateMatches)
    }
    // #endif
  })

  return matches
}

/**
 * 设备方向
 */
export function useOrientation() {
  const orientation = ref('portrait')

  const update = () => {
    // #ifdef H5
    orientation.value = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
    // #endif
  }

  onMounted(() => {
    // #ifdef H5
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    update()
    // #endif
  })

  onUnmounted(() => {
    // #ifdef H5
    window.removeEventListener('resize', update)
    window.removeEventListener('orientationchange', update)
    // #endif
  })

  return orientation
}

/**
 * 滚动位置
 */
export function useScrollPosition(element = window) {
  const scrollX = ref(0)
  const scrollY = ref(0)

  const update = () => {
    if (element === window) {
      // #ifdef H5
      scrollX.value = window.scrollX
      scrollY.value = window.scrollY
      // #endif
    } else if (element.value) {
      scrollX.value = element.value.scrollLeft
      scrollY.value = element.value.scrollTop
    }
  }

  onMounted(() => {
    if (element === window) {
      // #ifdef H5
      window.addEventListener('scroll', update, { passive: true })
      update()
      // #endif
    } else {
      watch(element, (el) => {
        if (el) {
          el.addEventListener('scroll', update, { passive: true })
          update()
        }
      }, { immediate: true })
    }
  })

  onUnmounted(() => {
    if (element === window) {
      // #ifdef H5
      window.removeEventListener('scroll', update)
      // #endif
    } else if (element.value) {
      element.value.removeEventListener('scroll', update)
    }
  })

  return { scrollX, scrollY }
}

/**
 * 复制到剪贴板
 */
export function useClipboard() {
  const copied = ref(false)
  const copiedText = ref('')

  const copy = async (text) => {
    try {
      // #ifdef H5
      await navigator.clipboard.writeText(text)
      // #endif
      // #ifdef MP-WEIXIN
      await uni.setClipboardData({ data: text })
      // #endif
      copied.value = true
      copiedText.value = text
      setTimeout(() => { copied.value = false }, 2000)
      return true
    } catch (e) {
      console.error('Copy failed:', e)
      return false
    }
  }

  return { copied, copiedText, copy }
}

/**
 * 网络状态
 */
export function useOnline() {
  const isOnline = ref(true)

  const updateOnline = () => {
    // #ifdef H5
    isOnline.value = navigator.onLine
    // #endif
  }

  onMounted(() => {
    // #ifdef H5
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    updateOnline()
    // #endif
  })

  onUnmounted(() => {
    // #ifdef H5
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
    // #endif
  })

  return isOnline
}

/**
 * 设备信息
 */
export function useDeviceInfo() {
  const info = ref({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    os: 'unknown',
    browser: 'unknown',
    pixelRatio: 1,
    screenWidth: 0,
    screenHeight: 0
  })

  const detect = () => {
    // #ifdef H5
    const ua = navigator.userAgent
    info.value.isMobile = /Mobile|Android|iPhone/i.test(ua)
    info.value.isTablet = /iPad|Tablet/i.test(ua)
    info.value.isDesktop = !info.value.isMobile && !info.value.isTablet
    info.value.pixelRatio = window.devicePixelRatio || 1
    info.value.screenWidth = window.screen.width
    info.value.screenHeight = window.screen.height

    if (/iPhone|iPad|iPod/i.test(ua)) info.value.os = 'iOS'
    else if (/Android/i.test(ua)) info.value.os = 'Android'
    else if (/Windows/i.test(ua)) info.value.os = 'Windows'
    else if (/Mac/i.test(ua)) info.value.os = 'macOS'
    else if (/Linux/i.test(ua)) info.value.os = 'Linux'

    if (/Edg/i.test(ua)) info.value.browser = 'Edge'
    else if (/Chrome/i.test(ua)) info.value.browser = 'Chrome'
    else if (/Firefox/i.test(ua)) info.value.browser = 'Firefox'
    else if (/Safari/i.test(ua)) info.value.browser = 'Safari'
    else info.value.browser = 'Other'
    // #endif
  }

  onMounted(detect)

  return info
}

/**
 * 触觉反馈
 */
export function useHaptics() {
  const vibrate = (pattern = [10]) => {
    // #ifdef H5
    if (navigator.vibrate) navigator.vibrate(pattern)
    // #endif
    // #ifdef MP-WEIXIN
    uni.vibrateShort({ type: 'medium' })
    // #endif
  }

  const light = () => vibrate([10])
  const medium = () => vibrate([20])
  const heavy = () => vibrate([30, 50, 30])
  const success = () => vibrate([10, 50, 10])
  const error = () => vibrate([50, 100, 50])
  const warning = () => vibrate([20, 50, 20])

  return { vibrate, light, medium, heavy, success, error, warning }
}

/**
 * 页面可见性
 */
export function useVisibility() {
  const visible = ref(true)

  const update = () => {
    // #ifdef H5
    visible.value = !document.hidden
    // #endif
  }

  onMounted(() => {
    // #ifdef H5
    document.addEventListener('visibilitychange', update)
    update()
    // #endif
  })

  onUnmounted(() => {
    // #ifdef H5
    document.removeEventListener('visibilitychange', update)
    // #endif
  })

  return visible
}

/**
 * 全屏控制
 */
export function useFullscreen(element = document.documentElement) {
  const isFullscreen = ref(false)

  const enter = async () => {
    // #ifdef H5
    if (element.requestFullscreen) {
      await element.requestFullscreen()
    }
    isFullscreen.value = true
    // #endif
  }

  const exit = async () => {
    // #ifdef H5
    if (document.exitFullscreen) {
      await document.exitFullscreen()
    }
    isFullscreen.value = false
    // #endif
  }

  const toggle = () => isFullscreen.value ? exit() : enter()

  onMounted(() => {
    // #ifdef H5
    document.addEventListener('fullscreenchange', () => {
      isFullscreen.value = !!document.fullscreenElement
    })
    // #endif
  })

  return { isFullscreen, enter, exit, toggle }
}

export {
  useApi,
  useForm,
  useDebounce,
  useThrottle,
  useStorage,
  useDebounceFn,
  useThrottleFn,
  useClickOutside,
  useHotkeys,
  useMediaQuery,
  useOrientation,
  useScrollPosition,
  useClipboard,
  useOnline,
  useDeviceInfo,
  useHaptics,
  useVisibility,
  useFullscreen
}