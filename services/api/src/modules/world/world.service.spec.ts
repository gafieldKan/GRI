import { DatabaseService } from '../../database/database.service';
import { WorldService } from './world.service';

function mockDb(query: jest.Mock): DatabaseService {
  return { query, getPool: jest.fn() } as unknown as DatabaseService;
}

describe('WorldService', () => {
  it('getWorld 返回 7 场景并组装意向与场景模块映射', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            code: 'home',
            name: '居所',
            en: 'home',
            theme: '住',
            icon: 'home',
            pos_x: 1,
            pos_y: 2,
            sort_order: 10,
            status: 'active',
          },
          {
            code: 'dining',
            name: '餐饮',
            en: 'dining',
            theme: '食',
            icon: 'utensils',
            pos_x: 3,
            pos_y: 4,
            sort_order: 20,
            status: 'active',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            scene_code: 'dining',
            code: 'hungry',
            label: '我想吃饭',
            description: '找餐厅或点餐',
            sort_order: 10,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            scene_code: 'dining',
            intent_code: null,
            module_code: 'food',
            sort_order: 10,
            requires_opt_in: false,
          },
          {
            scene_code: 'dining',
            intent_code: 'hungry',
            module_code: 'food',
            sort_order: 20,
            requires_opt_in: true,
          },
        ],
      });
    const service = new WorldService(mockDb(query));

    const world = await service.getWorld();

    expect(world.scenes.map((s) => s.code)).toEqual(['home', 'dining']);
    expect(world.scenes[1]).toMatchObject({
      code: 'dining',
      name: '餐饮',
      theme: '食',
      posX: 3,
      posY: 4,
      modules: [
        { moduleCode: 'food', sortOrder: 10, requiresOptIn: false },
      ],
      intents: [
        {
          code: 'hungry',
          label: '我想吃饭',
          modules: [
            { moduleCode: 'food', sortOrder: 20, requiresOptIn: true },
          ],
        },
      ],
    });
  });

  it('getOrganizationsMine 读取 ontology 多归属并按契约映射', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'org-1',
          name: '示例学校',
          type_code: 'school',
          role: 'owner',
          tags: ['教职工'],
          parent_id: null,
        },
        {
          id: 'org-2',
          name: '示例年级组',
          type_code: 'department',
          role: 'member',
          tags: [],
          parent_id: 'org-1',
        },
      ],
    });
    const service = new WorldService(mockDb(query));

    await expect(service.getOrganizationsMine('u1')).resolves.toEqual([
      {
        id: 'org-1',
        name: '示例学校',
        type: 'school',
        role: 'owner',
        tags: ['教职工'],
        parentId: null,
      },
      {
        id: 'org-2',
        name: '示例年级组',
        type: 'department',
        role: 'member',
        tags: [],
        parentId: 'org-1',
      },
    ]);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM ontology.org_member om');
    expect(sql).toContain('JOIN ontology.organization o');
    expect(params).toEqual(['u1']);
  });
});
