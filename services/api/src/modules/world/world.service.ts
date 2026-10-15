import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorldService {
  constructor(private readonly db: DatabaseService) {}

  async getWorld() {
    const [scenesRows, intentsRows, linksRows] = await Promise.all([
      this.db.query(
        `SELECT code, name, en, theme, icon, pos_x AS "posX", pos_y AS "posY", sort_order AS "sortOrder", status
         FROM ontology.life_scene
         WHERE status = 'active'
         ORDER BY sort_order`,
      ),
      this.db.query(
        `SELECT scene_code AS "sceneCode", code, label, description, sort_order AS "sortOrder"
         FROM ontology.life_intent
         ORDER BY scene_code, sort_order`,
      ),
      this.db.query(
        `SELECT scene_code AS "sceneCode", intent_code AS "intentCode", module_code AS "moduleCode", sort_order AS "sortOrder", requires_opt_in AS "requiresOptIn"
         FROM ontology.scene_module_link
         ORDER BY scene_code, COALESCE(intent_code, ''), sort_order`,
      ),
    ]);

    const scenesMap = new Map<string, any>();
    for (const row of scenesRows.rows) {
      const posX = row.posX ?? row.pos_x;
      const posY = row.posY ?? row.pos_y;
      const sortOrder = row.sortOrder ?? row.sort_order;
      scenesMap.set(row.code, {
        code: row.code,
        name: row.name,
        en: row.en,
        theme: row.theme,
        icon: row.icon,
        posX: Number(posX),
        posY: Number(posY),
        sortOrder: Number(sortOrder),
        status: row.status,
        modules: [],
        intents: [],
      });
    }

    for (const row of intentsRows.rows) {
      const sceneCode = row.sceneCode ?? row.scene_code;
      const scene = scenesMap.get(sceneCode);
      if (!scene) continue;
      const sortOrder = row.sortOrder ?? row.sort_order;
      scene.intents.push({
        code: row.code,
        label: row.label,
        description: row.description,
        sortOrder: Number(sortOrder),
        modules: [],
      });
    }

    for (const row of linksRows.rows) {
      const sceneCode = row.sceneCode ?? row.scene_code;
      const intentCode = row.intentCode ?? row.intent_code;
      const moduleCode = row.moduleCode ?? row.module_code;
      const sortOrder = row.sortOrder ?? row.sort_order;
      const requiresOptIn = row.requiresOptIn ?? row.requires_opt_in;
      const scene = scenesMap.get(sceneCode);
      if (!scene) continue;
      const target = intentCode
        ? scene.intents.find((i: any) => i.code === intentCode)?.modules
        : scene.modules;
      if (target === undefined) continue;
      target.push({
        moduleCode,
        sortOrder: Number(sortOrder),
        requiresOptIn: Boolean(requiresOptIn),
      });
    }

    const scenes = Array.from(scenesMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    return { scenes, generatedAt: new Date().toISOString() };
  }

  async getOrganizationsMine(userId: string) {
    const res = await this.db.query(
      `SELECT o.id, o.name, o.type_code AS "type", om.role, om.tags, o.parent_id AS "parentId"
       FROM ontology.org_member om
       JOIN ontology.organization o ON om.org_id = o.id
       WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'`,
      [userId],
    );

    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type ?? r.type_code,
      role: r.role,
      tags: r.tags as string[],
      parentId: r.parentId ?? r.parent_id ?? null,
    }));
  }
}
