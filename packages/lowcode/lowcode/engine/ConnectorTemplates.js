/**
 * 第三方服务预置连接器模板
 * 提供常用第三方服务的连接配置模板
 *
 * @author GRI Team
 * @version 1.0
 */

import { ApiType, AuthType } from './ApiConnector.js'

/**
 * 连接器模板定义
 */
export const ConnectorTemplates = {
  // ==================== 钉钉 ====================
  dingtalk: {
    id: 'dingtalk',
    name: '钉钉',
    type: ApiType.REST,
    baseUrl: 'https://oapi.dingtalk.com',
    auth: {
      type: AuthType.API_KEY,
      keyName: 'access_token',
    },
    description: '钉钉开放平台 API',
    endpoints: [
      {
        id: 'get_user_info',
        name: '获取用户信息',
        method: 'GET',
        path: '/user/get',
        params: ['userid'],
      },
      {
        id: 'send_work_notification',
        name: '发送工作通知',
        method: 'POST',
        path: '/topapi/message/corpconversation/send',
        body: {
          agent_id: '{{agentId}}',
          userid_list: '{{userIdList}}',
          msg: {
            msgtype: 'text',
            text: { content: '{{content}}' },
          },
        },
      },
      {
        id: 'get_dept_users',
        name: '获取部门成员',
        method: 'GET',
        path: '/user/getDeptMember',
        params: ['deptId'],
      },
    ],
    docUrl: 'https://open.dingtalk.com/document/orgapp-server/overview',
  },

  // ==================== 企业微信 ====================
  wecom: {
    id: 'wecom',
    name: '企业微信',
    type: ApiType.REST,
    baseUrl: 'https://qyapi.weixin.qq.com',
    auth: {
      type: AuthType.API_KEY,
      keyName: 'access_token',
    },
    description: '企业微信开放平台 API',
    endpoints: [
      {
        id: 'get_user_info',
        name: '获取成员信息',
        method: 'GET',
        path: '/cgiuser/get',
        params: ['userid'],
      },
      {
        id: 'send_app_message',
        name: '发送应用消息',
        method: 'POST',
        path: '/cgi/message/send',
        body: {
          touser: '{{touser}}',
          msgtype: 'text',
          agentid: '{{agentid}}',
          text: { content: '{{content}}' },
        },
      },
      {
        id: 'get_department',
        name: '获取部门',
        method: 'GET',
        path: '/cgi/department/get',
        params: ['id'],
      },
    ],
    docUrl: 'https://work.weixin.qq.com/api/doc',
  },

  // ==================== 飞书 ====================
  feishu: {
    id: 'feishu',
    name: '飞书',
    type: ApiType.REST,
    baseUrl: 'https://open.feishu.cn/open-apis',
    auth: {
      type: AuthType.BEARER,
    },
    description: '飞书开放平台 API',
    endpoints: [
      {
        id: 'get_user_info',
        name: '获取用户信息',
        method: 'GET',
        path: '/contact/v3/users/:user_id',
        params: ['user_id'],
      },
      {
        id: 'send_message',
        name: '发送消息',
        method: 'POST',
        path: '/im/v1/messages',
        body: {
          receive_id: '{{receive_id}}',
          msg_type: 'text',
          content: JSON.stringify({ text: '{{content}}' }),
        },
      },
      {
        id: 'get_department_users',
        name: '获取部门成员',
        method: 'GET',
        path: '/contact/v3/department/:department_id/children',
        params: ['department_id'],
      },
    ],
    docUrl: 'https://open.feishu.cn/document/home/index',
  },

  // ==================== 阿里云 ====================
  aliyun: {
    id: 'aliyun',
    name: '阿里云',
    type: ApiType.REST,
    baseUrl: 'https://api.aliyun.com',
    auth: {
      type: AuthType.API_KEY,
    },
    description: '阿里云 OpenAPI',
    endpoints: [
      {
        id: 'list_instances',
        name: '查看 ECS 实例',
        method: 'GET',
        path: '/ecs/instances',
      },
      {
        id: 'create_oss_object',
        name: '创建 OSS 对象',
        method: 'PUT',
        path: '/oss/:bucket/:object',
      },
    ],
    docUrl: 'https://help.aliyun.com',
  },

  // ==================== 腾讯云 ====================
  tencentcloud: {
    id: 'tencentcloud',
    name: '腾讯云',
    type: ApiType.REST,
    baseUrl: 'https://api.tencentcloudapi.com',
    auth: {
      type: AuthType.API_KEY,
    },
    description: '腾讯云 API',
    endpoints: [
      {
        id: 'list_cvm_instances',
        name: '查看 CVM 实例',
        method: 'POST',
        path: '/',
        body: {
          Action: 'DescribeInstances',
          Version: '2017-03-12',
        },
      },
    ],
    docUrl: 'https://cloud.tencent.com/document/api',
  },

  // ==================== Salesforce ====================
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    type: ApiType.REST,
    baseUrl: 'https://{{instance}}.salesforce.com/services/data/v58.0',
    auth: {
      type: AuthType.BEARER,
    },
    description: 'Salesforce CRM API',
    endpoints: [
      {
        id: 'query_accounts',
        name: '查询账户',
        method: 'GET',
        path: '/query',
        params: ['q'],
      },
      {
        id: 'create_contact',
        name: '创建联系人',
        method: 'POST',
        path: '/sobjects/Contact',
        body: {
          FirstName: '{{firstName}}',
          LastName: '{{lastName}}',
          Email: '{{email}}',
        },
      },
      {
        id: 'get_opportunity',
        name: '获取商机',
        method: 'GET',
        path: '/sobjects/Opportunity/:id',
      },
    ],
    docUrl: 'https://developer.salesforce.com/docs',
  },

  // ==================== SAP ====================
  sap: {
    id: 'sap',
    name: 'SAP',
    type: ApiType.REST,
    baseUrl: 'https://{{host}}.hana.ondemand.com',
    auth: {
      type: AuthType.BASIC,
    },
    description: 'SAP S/4HANA Cloud API',
    endpoints: [
      {
        id: 'get_materials',
        name: '获取物料清单',
        method: 'GET',
        path: '/sap/opu/odata/sap/API_MATERIAL_SRV/A_Material',
      },
      {
        id: 'create_sales_order',
        name: '创建销售订单',
        method: 'POST',
        path: '/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder',
        body: {
          SalesOrder: '{{salesOrder}}',
          OrganizationDivision: '{{division}}',
        },
      },
    ],
    docUrl: 'https://api.sap.com/package/SAPS4HANACloud',
  },

  // ==================== Slack ====================
  slack: {
    id: 'slack',
    name: 'Slack',
    type: ApiType.REST,
    baseUrl: 'https://slack.com/api',
    auth: {
      type: AuthType.BEARER,
    },
    description: 'Slack API',
    endpoints: [
      {
        id: 'post_message',
        name: '发送消息',
        method: 'POST',
        path: '/chat.postMessage',
        body: {
          channel: '{{channel}}',
          text: '{{text}}',
        },
      },
      {
        id: 'get_channels',
        name: '获取频道列表',
        method: 'GET',
        path: '/conversations.list',
      },
    ],
    docUrl: 'https://api.slack.com/',
  },

  // ==================== Google ====================
  google: {
    id: 'google',
    name: 'Google',
    type: ApiType.REST,
    baseUrl: 'https://www.googleapis.com',
    auth: {
      type: AuthType.BEARER,
    },
    description: 'Google API',
    endpoints: [
      {
        id: 'list_sheets',
        name: '列出 Google Sheets',
        method: 'GET',
        path: '/sheets/v4/spreadsheets',
      },
      {
        id: 'get_sheet_data',
        name: '获取表格数据',
        method: 'GET',
        path: '/sheets/v4/spreadsheets/:spreadsheetId/values/:range',
      },
    ],
    docUrl: 'https://developers.google.com/',
  },

  // ==================== Microsoft 365 ====================
  microsoft365: {
    id: 'microsoft365',
    name: 'Microsoft 365',
    type: ApiType.REST,
    baseUrl: 'https://graph.microsoft.com/v1.0',
    auth: {
      type: AuthType.BEARER,
    },
    description: 'Microsoft Graph API',
    endpoints: [
      {
        id: 'get_user',
        name: '获取用户信息',
        method: 'GET',
        path: '/users/:id',
      },
      {
        id: 'send_email',
        name: '发送邮件',
        method: 'POST',
        path: '/users/:id/sendMail',
        body: {
          message: {
            subject: '{{subject}}',
            body: {
              contentType: 'Text',
              content: '{{content}}',
            },
            toRecipients: [
              {
                emailAddress: {
                  address: '{{to}}',
                },
              },
            ],
          },
        },
      },
      {
        id: 'list_files',
        name: '列出 OneDrive 文件',
        method: 'GET',
        path: '/users/:id/drive/root/children',
      },
    ],
    docUrl: 'https://learn.microsoft.com/graph/api',
  },

  // ==================== 微信支付 ====================
  wechat_pay: {
    id: 'wechat_pay',
    name: '微信支付',
    type: ApiType.REST,
    baseUrl: 'https://api.mch.weixin.qq.com',
    auth: {
      type: AuthType.API_KEY,
    },
    description: '微信支付 API v3',
    endpoints: [
      {
        id: 'create_order',
        name: '创建订单',
        method: 'POST',
        path: '/v3/pay/transactions/jsapi',
        body: {
          appid: '{{appid}}',
          mchid: '{{mchid}}',
          description: '{{description}}',
          amount: {
            total: '{{amount}}',
            currency: 'CNY',
          },
          out_trade_no: '{{out_trade_no}}',
        },
      },
      {
        id: 'query_order',
        name: '查询订单',
        method: 'GET',
        path: '/v3/pay/transactions/out-trade-no/:out_trade_no',
      },
    ],
    docUrl: 'https://pay.weixin.qq.com/wiki/doc/apiv3/',
  },

  // ==================== 支付宝 ====================
  alipay: {
    id: 'alipay',
    name: '支付宝',
    type: ApiType.REST,
    baseUrl: 'https://openapi.alipay.com/gateway.do',
    auth: {
      type: AuthType.API_KEY,
    },
    description: '支付宝开放平台 API',
    endpoints: [
      {
        id: 'create_order',
        name: '创建订单',
        method: 'POST',
        path: '/gateway.do?method=alipay.trade.create',
        body: {
          out_trade_no: '{{out_trade_no}}',
          total_amount: '{{amount}}',
          subject: '{{subject}}',
        },
      },
      {
        id: 'query_order',
        name: '查询订单',
        method: 'POST',
        path: '/gateway.do?method=alipay.trade.query',
        body: {
          out_trade_no: '{{out_trade_no}}',
        },
      },
      {
        id: 'refund',
        name: '订单退款',
        method: 'POST',
        path: '/gateway.do?method=alipay.trade.refund',
        body: {
          out_trade_no: '{{out_trade_no}}',
          refund_amount: '{{refund_amount}}',
        },
      },
    ],
    docUrl: 'https://opendocs.alipay.com/',
  },

  // ==================== 高德地图 ====================
  amap: {
    id: 'amap',
    name: '高德地图',
    type: ApiType.REST,
    baseUrl: 'https://restapi.amap.com/v3',
    auth: {
      type: AuthType.API_KEY,
      keyName: 'key',
    },
    description: '高德开放平台 API',
    endpoints: [
      {
        id: 'geocode',
        name: '地理编码',
        method: 'GET',
        path: '/geocode/geo',
        params: ['address', 'city'],
      },
      {
        id: 'regeocode',
        name: '逆地理编码',
        method: 'GET',
        path: '/geocode/regeo',
        params: ['location'],
      },
      {
        id: 'weather',
        name: '天气查询',
        method: 'GET',
        path: '/weather/weather',
        params: ['city'],
      },
    ],
    docUrl: 'https://lbs.amap.com/',
  },

  // ==================== 百度地图 ====================
  baidu_map: {
    id: 'baidu_map',
    name: '百度地图',
    type: ApiType.REST,
    baseUrl: 'https://api.map.baidu.com',
    auth: {
      type: AuthType.API_KEY,
      keyName: 'ak',
    },
    description: '百度地图开放平台 API',
    endpoints: [
      {
        id: 'geocode',
        name: '地理编码',
        method: 'GET',
        path: '/geocoding/v3/',
        params: ['address'],
      },
      {
        id: 'weather',
        name: '天气查询',
        method: 'GET',
        path: '/telematics/v3/weather',
        params: ['location'],
      },
    ],
    docUrl: 'https://lbsyun.baidu.com/',
  },
}

/**
 * 获取所有连接器模板
 */
export function getAllTemplates() {
  return Object.values(ConnectorTemplates)
}

/**
 * 获取指定模板
 */
export function getTemplate(templateId) {
  return ConnectorTemplates[templateId] || null
}

/**
 * 按类别获取模板
 */
export function getTemplatesByCategory(category) {
  const categories = {
    enterprise: ['dingtalk', 'wecom', 'feishu', 'slack'],
    cloud: ['aliyun', 'tencentcloud', 'sap'],
    crm: ['salesforce'],
    productivity: ['google', 'microsoft365'],
    payment: ['wechat_pay', 'alipay'],
    map: ['amap', 'baidu_map'],
  }

  const templateIds = categories[category] || []
  return templateIds.map((id) => ConnectorTemplates[id]).filter(Boolean)
}

/**
 * 获取模板类别
 */
export function getTemplateCategories() {
  return {
    enterprise: '企业协作',
    cloud: '云服务',
    crm: 'CRM',
    productivity: '生产力',
    payment: '支付',
    map: '地图服务',
  }
}

export default ConnectorTemplates
