/**
 * CRUD Operations with Hooks
 * Provides create, read, update, delete operations with customizable hooks
 */

// In-memory database (replace with actual database in production)
const db = {
  models: {},
  data: {},
}

// Initialize model in db
export const initModel = (model) => {
  if (!db.data[model.id]) {
    db.data[model.id] = []
    db.models[model.id] = model
  }
}

// Create - with before/after hooks
export const create = async (modelId, data, hooks = {}) => {
  const { beforeCreate, afterCreate } = hooks
  const model = db.models[modelId]

  if (!model) {
    throw new Error(`Model ${modelId} not found`)
  }

  // Before create hook
  let processedData = { ...data }
  if (beforeCreate) {
    processedData = await beforeCreate(data, model)
  }

  // Add timestamps
  if (model.timestamps) {
    processedData.createdAt = new Date().toISOString()
    processedData.updatedAt = new Date().toISOString()
  }

  // Generate ID
  const newItem = {
    id: `${modelId}_${Date.now()}`,
    ...processedData,
  }

  // Store
  db.data[modelId].push(newItem)

  // After create hook
  if (afterCreate) {
    await afterCreate(newItem, model)
  }

  return newItem
}

// Read all - with before/after hooks
export const readAll = async (modelId, options = {}, hooks = {}) => {
  const { beforeRead, afterRead } = hooks
  const model = db.models[modelId]

  if (!model) {
    throw new Error(`Model ${modelId} not found`)
  }

  // Before read hook
  let queryOptions = { ...options }
  if (beforeRead) {
    queryOptions = await beforeRead(options, model)
  }

  // Get data
  let result = [...db.data[modelId]]

  // Apply filters
  if (queryOptions.filter) {
    result = result.filter((item) => {
      for (const [key, value] of Object.entries(queryOptions.filter)) {
        if (item[key] !== value) return false
      }
      return true
    })
  }

  // Apply sorting
  if (queryOptions.sort) {
    result.sort((a, b) => {
      const aVal = a[queryOptions.sort.field]
      const bVal = b[queryOptions.sort.field]
      return queryOptions.sort.order === 'desc' ? bVal - aVal : aVal - bVal
    })
  }

  // Apply pagination
  if (queryOptions.limit) {
    const start = queryOptions.offset || 0
    result = result.slice(start, start + queryOptions.limit)
  }

  // After read hook
  if (afterRead) {
    result = await afterRead(result, model)
  }

  return result
}

// Read by ID
export const readById = async (modelId, id, hooks = {}) => {
  const { afterRead } = hooks
  const items = await readAll(modelId, { filter: { id } }, hooks)
  const item = items[0]

  if (item && afterRead) {
    const processed = await afterRead(item, db.models[modelId])
    return processed
  }

  return item
}

// Update - with before/after hooks
export const update = async (modelId, id, data, hooks = {}) => {
  const { beforeUpdate, afterUpdate } = hooks
  const model = db.models[modelId]

  if (!model) {
    throw new Error(`Model ${modelId} not found`)
  }

  const itemIndex = db.data[modelId].findIndex((item) => item.id === id)
  if (itemIndex === -1) {
    throw new Error(`Item ${id} not found`)
  }

  // Before update hook
  let processedData = { ...data }
  if (beforeUpdate) {
    processedData = await beforeUpdate(data, db.data[modelId][itemIndex], model)
  }

  // Add updated timestamp
  if (model.timestamps) {
    processedData.updatedAt = new Date().toISOString()
  }

  // Update
  const updatedItem = {
    ...db.data[modelId][itemIndex],
    ...processedData,
  }
  db.data[modelId][itemIndex] = updatedItem

  // After update hook
  if (afterUpdate) {
    await afterUpdate(updatedItem, model)
  }

  return updatedItem
}

// Delete - with before/after hooks
export const remove = async (modelId, id, hooks = {}) => {
  const { beforeDelete, afterDelete } = hooks
  const model = db.models[modelId]

  if (!model) {
    throw new Error(`Model ${modelId} not found`)
  }

  const itemIndex = db.data[modelId].findIndex((item) => item.id === id)
  if (itemIndex === -1) {
    throw new Error(`Item ${id} not found`)
  }

  const item = db.data[modelId][itemIndex]

  // Before delete hook
  if (beforeDelete) {
    const shouldDelete = await beforeDelete(item, model)
    if (!shouldDelete) {
      throw new Error('Delete prevented by beforeDelete hook')
    }
  }

  // Delete
  db.data[modelId].splice(itemIndex, 1)

  // After delete hook
  if (afterDelete) {
    await afterDelete(item, model)
  }

  return item
}

// Batch operations
export const batchCreate = async (modelId, items, hooks = {}) => {
  const results = []
  for (const item of items) {
    try {
      const result = await create(modelId, item, hooks)
      results.push(result)
    } catch (error) {
      console.error('Batch create error:', error)
    }
  }
  return results
}

export default {
  initModel,
  create,
  readAll,
  readById,
  update,
  remove,
  batchCreate,
}
