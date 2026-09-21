/**
 * 用户状态管理 (Pinia Store) — 小程序版
 * 管理学生档案和偏好设置
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const studentId = ref(null)
  const name = ref('')
  const grade = ref('')
  const subject = ref('math')
  const textbookVersion = ref('人教版')

  function setStudent(id, profile = {}) {
    studentId.value = id
    name.value = profile.name || ''
    grade.value = profile.grade || ''
    subject.value = profile.subject || 'math'
    textbookVersion.value = profile.textbookVersion || '人教版'
  }

  function reset() {
    studentId.value = null
    name.value = ''
    grade.value = ''
    subject.value = 'math'
    textbookVersion.value = '人教版'
  }

  return {
    studentId,
    name,
    grade,
    subject,
    textbookVersion,
    setStudent,
    reset
  }
})