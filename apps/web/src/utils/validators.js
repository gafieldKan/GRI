/**
 * Form Validation Utilities
 * 表单验证工具
 */

/**
 * Validate email address format (RFC 2822 simplified)
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false
  // RFC 2822 simplified pattern
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  return re.test(email.trim())
}

/**
 * Validate Chinese mobile phone number
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false
  // Chinese mobile: 1xx-xxxx-xxxx, 11 digits total
  const cleaned = phone.trim().replace(/\s+/g, '')
  const re = /^1[3-9]\d{9}$/
  return re.test(cleaned)
}

/**
 * Get password strength assessment
 * @param {string} password
 * @returns {{ level: 'weak'|'medium'|'strong', score: number, message: string }}
 */
export function getPasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { level: 'weak', score: 0, message: '请输入密码' }
  }

  let score = 0
  const len = password.length

  // Length scoring
  if (len >= 8) score += 25
  if (len >= 12) score += 10

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 15
  if (/[A-Z]/.test(password)) score += 15
  if (/\d/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 20

  // Penalty for repeating characters
  if (/(.)\1{2,}/.test(password)) score -= 10

  // Clamp score
  score = Math.max(0, Math.min(100, score))

  let level = 'weak'
  let message = '密码强度：弱 — 建议添加大小写字母和特殊字符'
  if (score >= 60) {
    level = 'medium'
    message = '密码强度：中等 — 可以加入特殊字符使其更强'
  }
  if (score >= 80) {
    level = 'strong'
    message = '密码强度：强 ✓'
  }

  return { level, score, message }
}

/**
 * Check if two password strings match
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {boolean}
 */
export function passwordsMatch(password, confirmPassword) {
  if (!password || !confirmPassword) return false
  return password === confirmPassword
}

/**
 * Validate form field with a rule
 * @param {string} value - current field value
 * @param {string} type - 'email' | 'phone' | 'password' | 'confirmPassword'
 * @param {string} [compareValue] - used for confirmPassword comparison
 * @returns {string|null} error message or null if valid
 */
export function validateField(value, type, compareValue) {
  if (!value || (typeof value === 'string' && !value.trim())) {
    const labels = {
      email: '请输入邮箱地址',
      phone: '请输入手机号码',
      password: '请输入密码',
      confirmPassword: '请再次输入密码以确认',
      username: '请输入用户名'
    }
    return labels[type] || '此字段为必填项'
  }

  switch (type) {
    case 'email':
      return isValidEmail(value) ? null : '请输入有效的邮箱地址'
    case 'phone':
      return isValidPhone(value) ? null : '请输入有效的11位手机号码'
    case 'password': {
      if (value.length < 8) return '密码长度不能少于8个字符'
      if (!/[a-zA-Z]/.test(value)) return '密码需包含至少一个英文字母'
      if (!/\d/.test(value)) return '密码需包含至少一个数字'
      return null
    }
    case 'confirmPassword':
      if (!passwordsMatch(value, compareValue)) return '两次输入的密码不一致'
      return null
    case 'username':
      if (value.trim().length < 2) return '用户名长度不能少于2个字符'
      if (value.trim().length > 30) return '用户名长度不能超过30个字符'
      return null
    case 'smsCode': {
      if (!/^\d{6}$/.test(value)) return '验证码为6位数字'
      return null
    }
    default:
      return null
  }
}