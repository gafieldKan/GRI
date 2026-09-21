/**
 * EngineContext — 将低代码引擎注入 React 组件树
 *
 * 用法：
 *   const { appEngine, eventEngine } = useEngine()
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { bootstrap } from '../utils/appBootstrapper.js'
import { eventEngine as globalEventEngine } from '@/engine/EventEngine.js'

const EngineContext = createContext(null)

export function useEngine() {
  const ctx = useContext(EngineContext)
  if (!ctx) {
    throw new Error('useEngine must be used within <EngineProvider>')
  }
  return ctx
}

export function useEngineEvent() {
  const { eventEngine: ee } = useEngine()
  return useCallback((type, payload) => {
    ee?.emit(type, payload)
  }, [ee])
}

export function useEngineListener(type, handler) {
  const { eventEngine: ee } = useEngine()
  useEffect(() => {
    if (!ee) return
    ee.on(type, handler)
    return () => ee.off(type, handler)
  }, [ee, type, handler])
}

export function EngineProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [engine, setEngine] = useState(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const instance = await bootstrap()
        if (!cancelled) {
          setEngine(instance)
          setReady(true)
        }
      }
      catch (err) {
        if (!cancelled) {
          console.error('[EngineProvider] 初始化失败:', err)
          setError(err)
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  const contextValue = {
    appEngine: engine,
    eventEngine: globalEventEngine,
    state: engine?.globalState ?? new Map(),
    isReady: ready,
    error,
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#ff4d4f' }}>
        <h2>引擎加载失败</h2>
        <p>{error.message}</p>
        <pre style={{ background: '#fff2f0', padding: 16, borderRadius: 4, textAlign: 'left' }}>
          {error.stack}
        </pre>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <p style={{ color: '#8c8c8c', fontSize: 16 }}>引擎初始化中...</p>
        </div>
      </div>
    )
  }

  return (
    <EngineContext.Provider value={contextValue}>
      {children}
    </EngineContext.Provider>
  )
}
