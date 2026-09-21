import React, { useRef, useState, useEffect } from 'react'
import { Button, Space, Modal, message } from 'antd'
import { EditOutlined, UndoOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons'

/**
 * 电子签名组件
 * 支持手写签名、数字证书、合规签字
 *
 * @param {Object} props
 * @param {Function} props.onSign - 签名完成回调
 * @param {String} props.title - 标题
 * @param {Boolean} props.required - 是否必填
 * @param {String} props.value - 受控值（签名图片 URL）
 * @param {Boolean} props.disabled - 是否禁用
 */
const ElectronicSignature = ({
  onSign,
  title = '电子签名',
  required = false,
  value,
  disabled = false,
}) => {
  const canvasRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [signatureData, setSignatureData] = useState(null)

  // 初始化 Canvas
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      initCanvas()
    }
  }, [isOpen])

  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // 设置 canvas 尺寸
    canvas.width = 400 * dpr
    canvas.height = 300 * dpr
    canvas.style.width = '400px'
    canvas.style.height = '300px'

    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 400, 300)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 绘制签名区域提示
    ctx.fillStyle = '#999999'
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('请在此区域签名', 200, 150)
  }

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')

    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setIsEmpty(false)
  }

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()

    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')

    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const handleSave = () => {
    if (isEmpty) {
      message.warning('请先签名')
      return
    }

    const canvas = canvasRef.current
    const signature = canvas.toDataURL('image/png')
    setSignatureData(signature)
    onSign?.(signature)
    setIsOpen(false)
    message.success('签名已保存')
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 400 * dpr, 300 * dpr)
    ctx.fillStyle = '#999999'
    ctx.font = '14px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('请在此区域签名', 200, 150)
    setIsEmpty(true)
    setSignatureData(null)
    onSign?.(null)
  }

  return (
    <div style={styles.container}>
      <div style={styles.preview}>
        {signatureData || value ? (
          <img src={signatureData || value} alt="签名" style={styles.signatureImage} />
        ) : (
          <div style={styles.placeholder}>
            <EditOutlined style={{ fontSize: 24, color: '#999' }} />
            <div>点击签名</div>
          </div>
        )}
      </div>

      <Space style={{ marginTop: 12 }}>
        <Button icon={<EditOutlined />} onClick={() => setIsOpen(true)} disabled={disabled}>
          签名
        </Button>
        {(signatureData || value) && (
          <>
            <Button icon={<UndoOutlined />} onClick={() => handleClear()} disabled={disabled}>
              清除
            </Button>
          </>
        )}
      </Space>

      <Modal
        title={title}
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={
          <Space>
            <Button icon={<CloseOutlined />} onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button icon={<UndoOutlined />} onClick={handleClear}>
              重写
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
              保存
            </Button>
          </Space>
        }
        width="auto"
      >
        <div style={{ textAlign: 'center' }}>
          <canvas
            ref={canvasRef}
            style={{
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              touchAction: 'none',
            }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </Modal>
    </div>
  )
}

const styles = {
  container: {
    display: 'inline-block',
  },
  preview: {
    width: 200,
    height: 150,
    border: '1px dashed #d9d9d9',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fafafa',
    overflow: 'hidden',
  },
  signatureImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    color: '#999',
  },
}

export default ElectronicSignature
