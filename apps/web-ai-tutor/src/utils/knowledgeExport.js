/**
 * 知识图谱导出（对齐知序：图谱 + 个人学习记录）。
 * H5 走 Blob 下载；小程序/H5 无下载能力时退化为剪贴板。
 */

export function buildExportPayload(store) {
  return {
    title: '智学慧眼 · 学科知识图谱',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    subject: store.currentSubject,
    grade: store.currentGrade,
    nodes: store.graphData?.nodes || [],
    edges: store.graphData?.edges || [],
    learning: {
      mastery: store.masteryMap || {},
      notes: store.notes || {},
      bookmarks: store.bookmarks || [],
      visits: store.visits || []
    }
  }
}

export function downloadJson(payload, filename) {
  const name = filename || `智学慧眼_知识图谱_${new Date().toISOString().slice(0, 10)}.json`
  const text = JSON.stringify(payload, null, 2)

  // #ifdef H5
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch (e) {
    // 落到剪贴板兜底
  }
  // #endif

  try {
    uni.setClipboardData({ data: text })
    return true
  } catch (e) {
    return false
  }
}
