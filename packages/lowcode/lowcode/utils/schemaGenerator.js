/**
 * Schema Generator - Convert component layout to JSON schema
 */

export const generateSchema = (components) => {
  return {
    version: '1.0.0',
    type: 'lowcode-page',
    components: components.map((comp) => ({
      id: comp.id,
      type: comp.type,
      label: comp.label,
      props: comp.props || {},
    })),
    metadata: {
      createdAt: new Date().toISOString(),
      componentCount: components.length,
    },
  }
}

export const exportToFile = (components, filename = 'layout-schema.json') => {
  const schema = generateSchema(components)
  const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const importSchema = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString)
    if (parsed.components && Array.isArray(parsed.components)) {
      return parsed.components
    }
    return null
  } catch (e) {
    return null
  }
}

export default {
  generateSchema,
  exportToFile,
  importSchema,
}
