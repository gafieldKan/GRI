/**
 * 餐厅相关 API 接口
 * 提供餐厅列表、详情、菜单等接口
 */

import { Router } from 'express'
import { getTenant } from '../core/tenant.js'

const router = Router()

/**
 * @api GET /api/restaurants
 * @desc 获取餐厅列表
 * @param {string} cuisine 菜系筛选
 * @param {string} status 营业状态筛选
 * @param {number} page 页码
 * @param {number} pageSize 每页数量
 * @param {string} keyword 搜索关键词
 */
router.get('/restaurants', async (req, res) => {
  try {
    const { cuisine, status, page = 1, pageSize = 10, keyword } = req.query

    const query = {}
    if (cuisine) query.cuisine = cuisine
    if (status) query.status = status
    if (keyword) {
      query.$text = { $search: keyword }
    }

    const restaurants = await find('Restaurant', query, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sort: { rating: -1, monthlyOrders: -1 },
    })

    res.json({
      success: true,
      data: restaurants,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: restaurants.total,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/restaurants/:id
 * @desc 获取餐厅详情
 */
router.get('/restaurants/:id', async (req, res) => {
  try {
    const { id } = req.params
    const restaurant = await findOne('Restaurant', { _id: id })

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: '餐厅不存在',
      })
    }

    res.json({
      success: true,
      data: restaurant,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/restaurants/:id/menu
 * @desc 获取餐厅菜单（菜品列表）
 * @param {string} id 餐厅 ID
 * @param {string} category 分类筛选
 * @param {string} status 状态筛选
 */
router.get('/restaurants/:id/menu', async (req, res) => {
  try {
    const { id } = req.params
    const { category, status } = req.query

    // 验证餐厅是否存在
    const restaurant = await findOne('Restaurant', { _id: id })
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        error: '餐厅不存在',
      })
    }

    // 查询菜品
    const query = { restaurantId: id }
    if (category) query.categoryId = category
    if (status) query.status = status

    const dishes = await find('Dish', query, {
      sort: { sortOrder: 1, createdAt: -1 },
    })

    // 按分类组织菜品
    const categories = await find('DishCategory', { restaurantId: id })

    res.json({
      success: true,
      data: {
        restaurant,
        categories,
        dishes,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/restaurants/:id/dishes
 * @desc 获取餐厅菜品列表
 */
router.get('/restaurants/:id/dishes', async (req, res) => {
  try {
    const { id } = req.params
    const { category, status = 'onsale' } = req.query

    const query = { restaurantId: id }
    if (category) query.categoryId = category
    if (status) query.status = status

    const dishes = await find('Dish', query, {
      sort: { sortOrder: 1, isSignature: -1, monthlyOrders: -1 },
    })

    res.json({
      success: true,
      data: dishes,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/dishes/:id
 * @desc 获取菜品详情
 */
router.get('/dishes/:id', async (req, res) => {
  try {
    const { id } = req.params
    const dish = await findOne('Dish', { _id: id })

    if (!dish) {
      return res.status(404).json({
        success: false,
        error: '菜品不存在',
      })
    }

    res.json({
      success: true,
      data: dish,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/dish-categories
 * @desc 获取菜品分类列表
 */
router.get('/dish-categories', async (req, res) => {
  try {
    const { restaurantId } = req.query

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: '缺少餐厅 ID 参数',
      })
    }

    const categories = await find(
      'DishCategory',
      { restaurantId },
      {
        sort: { sortOrder: 1 },
      }
    )

    res.json({
      success: true,
      data: categories,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

export default router
