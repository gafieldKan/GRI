import { useState, useCallback } from 'react'
import * as crudOps from '../../server/crudWithHooks'

/**
 * React Hook for CRUD operations
 * @param {string} modelId - Model ID
 * @param {object} options - Query options (filter, sort, limit)
 */
const useCRUD = (modelId, options = {}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState([])

  // Initialize model
  const initModel = useCallback((model) => {
    crudOps.initModel(model)
  }, [])

  // Create
  const create = useCallback(
    async (item, hooks) => {
      setLoading(true)
      setError(null)
      try {
        const result = await crudOps.create(modelId, item, hooks)
        setData((prev) => [...prev, result])
        return result
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId]
  )

  // Read all
  const readAll = useCallback(
    async (queryOptions, hooks) => {
      setLoading(true)
      setError(null)
      try {
        const result = await crudOps.readAll(modelId, { ...options, ...queryOptions }, hooks)
        setData(result)
        return result
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId, options]
  )

  // Read by ID
  const readById = useCallback(
    async (id, hooks) => {
      setLoading(true)
      setError(null)
      try {
        const result = await crudOps.readById(modelId, id, hooks)
        return result
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId]
  )

  // Update
  const update = useCallback(
    async (id, item, hooks) => {
      setLoading(true)
      setError(null)
      try {
        const result = await crudOps.update(modelId, id, item, hooks)
        setData((prev) => prev.map((i) => (i.id === id ? result : i)))
        return result
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId]
  )

  // Delete
  const remove = useCallback(
    async (id, hooks) => {
      setLoading(true)
      setError(null)
      try {
        await crudOps.remove(modelId, id, hooks)
        setData((prev) => prev.filter((i) => i.id !== id))
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId]
  )

  // Batch create
  const batchCreate = useCallback(
    async (items, hooks) => {
      setLoading(true)
      setError(null)
      try {
        const results = await crudOps.batchCreate(modelId, items, hooks)
        setData((prev) => [...prev, ...results])
        return results
      } catch (err) {
        setError(err.message)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [modelId]
  )

  return {
    loading,
    error,
    data,
    initModel,
    create,
    readAll,
    readById,
    update,
    remove,
    batchCreate,
    setData,
    setError,
  }
}

export default useCRUD
