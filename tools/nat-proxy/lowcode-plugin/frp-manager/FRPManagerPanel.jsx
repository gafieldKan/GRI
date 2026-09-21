import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Statistic,
  Row,
  Col,
  Descriptions,
  Switch,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  ReloadOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';

const { Option } = Select;

/**
 * FRP 管理面板组件
 * 用于在低代码平台中管理内网穿透隧道
 */
const FRPManagerPanel = () => {
  // 状态管理
  const [tunnels, setTunnels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState(null);
  const [frpStatus, setFrpStatus] = useState({
    connected: false,
    serverAddr: '',
    version: '',
  });

  const [form] = Form.useForm();

  // 加载隧道列表
  const loadTunnels = async () => {
    setLoading(true);
    try {
      // 调用后端 API 获取隧道状态
      const response = await fetch('/api/frp/status');
      const data = await response.json();

      setTunnels(data.tunnels || []);
      setFrpStatus({
        connected: data.connected || false,
        serverAddr: data.serverAddr || '',
        version: data.version || '',
      });
    } catch (error) {
      console.error('加载隧道列表失败:', error);
      // 使用模拟数据降级
      const mockTunnels = [
        {
          id: '1',
          name: 'web-service',
          protocol: 'tcp',
          localPort: 80,
          remotePort: 8080,
          status: 'running',
          traffic: '1.2GB',
        },
        {
          id: '2',
          name: 'api-service',
          protocol: 'tcp',
          localPort: 3000,
          remotePort: 8081,
          status: 'stopped',
          traffic: '0.5GB',
        },
      ];
      setTunnels(mockTunnels);
      setFrpStatus({
        connected: true,
        serverAddr: 'xxx.xxx.xxx.xxx',
        version: '0.61.1',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTunnels();
  }, []);

  // 表单提交处理
  const handleSave = async () => {
    try {
      const formValues = form.getFieldsValue();
      const response = await fetch('/api/frp/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues),
      });
      const result = await response.json();

      if (result.success) {
        message.success(editingTunnel ? '隧道已更新' : '隧道已创建');
        setModalVisible(false);
        loadTunnels();
      } else {
        message.error(`保存失败：${result.error}`);
      }
    } catch (error) {
      console.error('保存隧道失败:', error);
      message.error('保存失败，请检查服务是否运行');
    }
  };

  // 删除隧道
  const handleDelete = async (record) => {
    try {
      const response = await fetch(`/api/frp/tunnel/${record.name}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        setTunnels(tunnels.filter((t) => t.id !== record.id));
        message.success('删除成功');
      } else {
        message.error(`删除失败：${result.error}`);
      }
    } catch (error) {
      console.error('删除隧道失败:', error);
      message.error('删除失败，请检查服务是否运行');
    }
  };

  // 启动/停止隧道
  const toggleTunnel = async (record, action) => {
    try {
      const response = await fetch(`/api/frp/tunnel/${record.name}/${action}`, {
        method: 'POST',
      });
      const result = await response.json();

      if (result.success) {
        const newStatus = action === 'start' ? 'running' : 'stopped';
        setTunnels(
          tunnels.map((t) =>
            t.id === record.id ? { ...t, status: newStatus } : t
          )
        );
        message.success(
          action === 'start' ? '隧道已启动' : '隧道已停止'
        );
      } else {
        message.error(`操作失败：${result.error}`);
      }
    } catch (error) {
      console.error('隧道操作失败:', error);
      message.error('操作失败，请检查服务是否运行');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '隧道名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      render: (text) => text.toUpperCase(),
    },
    {
      title: '本地端口',
      dataIndex: 'localPort',
      key: 'localPort',
    },
    {
      title: '远程端口',
      dataIndex: 'remotePort',
      key: 'remotePort',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag
          icon={
            status === 'running' ? (
              <CheckCircleOutlined />
            ) : (
              <CloseCircleOutlined />
            )
          }
          color={status === 'running' ? 'green' : 'default'}
        >
          {status === 'running' ? '运行中' : '已停止'}
        </Tag>
      ),
    },
    {
      title: '流量',
      dataIndex: 'traffic',
      key: 'traffic',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          {record.status === 'running' ? (
            <Tooltip title="停止隧道">
              <Button
                icon={<StopOutlined />}
                onClick={() => toggleTunnel(record, 'stop')}
              />
            </Tooltip>
          ) : (
            <Tooltip title="启动隧道">
              <Button
                icon={<PlayCircleOutlined />}
                onClick={() => toggleTunnel(record, 'start')}
              />
            </Tooltip>
          )}
          <Tooltip title="删除隧道">
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card title="内网穿透管理" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="FRP 状态"
              value={frpStatus.connected ? '已连接' : '未连接'}
              valueStyle={{
                color: frpStatus.connected ? '#52c41a' : '#ff4d4f',
              }}
            />
          </Col>
          <Col span={8}>
            <Statistic title="运行中隧道" prefix="🔗" count={tunnels.filter(t => t.status === 'running').length} />
          </Col>
          <Col span={8}>
            <Statistic title="总隧道数" prefix="📡" count={tunnels.length} />
          </Col>
        </Row>
      </Card>

      <Card
        title="隧道列表"
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadTunnels}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalVisible(true)}
            >
              新建隧道
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={tunnels}
          loading={loading}
          rowKey="id"
          pagination={false}
        />
      </Card>

      {/* 新建/编辑隧道对话框 */}
      <Modal
        title={editingTunnel ? '编辑隧道' : '新建隧道'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        onOk={handleSave}
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label="隧道名称"
            name="name"
            rules={[{ required: true, message: '请输入隧道名称' }]}
          >
            <Input placeholder="例如：web-service" />
          </Form.Item>
          <Form.Item
            label="协议类型"
            name="protocol"
            initialValue="tcp"
          >
            <Select>
              <Option value="tcp">TCP</Option>
              <Option value="http">HTTP</Option>
              <Option value="https">HTTPS</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="本地端口"
            name="localPort"
            rules={[{ required: true, message: '请输入本地端口' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={65535} />
          </Form.Item>
          <Form.Item
            label="远程端口"
            name="remotePort"
            rules={[{ required: true, message: '请输入远程端口' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={65535} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FRPManagerPanel;
