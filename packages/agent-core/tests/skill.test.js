import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, makeTool, SkillRegistry, parseSkillMarkdown } from '../src/index.js';

test('tool-registry: 注册/查找/清单/参数校验', async () => {
  const reg = new ToolRegistry();
  reg.register(makeTool({
    name: 'quiz.grade',
    description: '判分',
    inputSchema: { type: 'object', properties: { studentAnswer: { type: 'string' } }, required: ['studentAnswer'] },
    async execute(ctx, args) {
      return { ok: true, answer: args.studentAnswer };
    },
  }));

  assert.equal(reg.has('quiz.grade'), true);
  assert.equal(reg.get('quiz.grade').description, '判分');
  assert.equal(reg.list()[0].name, 'quiz.grade');

  const ok = await reg.call({}, 'quiz.grade', { studentAnswer: 'B' });
  assert.equal(ok.ok, true);
  assert.equal(ok.result.answer, 'B');

  const missing = await reg.call({}, 'quiz.grade', {});
  assert.equal(missing.ok, false);
  assert.match(missing.error, /缺少必填参数/);

  const unknown = await reg.call({}, 'nope', {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /未知工具/);
});

test('tool-exec 抛错被捕获，不崩', async () => {
  const reg = new ToolRegistry();
  reg.register(makeTool({
    name: 'boom',
    async execute() {
      throw new Error('炸了');
    },
  }));
  const r = await reg.call({}, 'boom', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /炸了/);
});

test('tool-registry: onRun 审计钩子', async () => {
  const audits = [];
  const reg = new ToolRegistry();
  reg.register(makeTool({ name: 't', async execute() { return 1; } }));
  await reg.call({}, 't', { a: 1 }, { onRun: (x) => audits.push(x) });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].tool_name, 't');
  assert.ok(typeof audits[0].latency_ms === 'number');
});

test('skill-md: 解析 frontmatter + 指令', () => {
  const md = '---\nname: tutor.diagnose\ndescription: 学情诊断\ntools: [X, quiz.grade]\n---\n# 诊断流程\n先收集学情再下结论。';
  const s = parseSkillMarkdown(md);
  assert.equal(s.name, 'tutor.diagnose');
  assert.equal(s.description, '学情诊断');
  assert.deepEqual(s.tools, ['X', 'quiz.grade']);
  assert.ok(s.instructions.includes('先收集学情'));
});

test('skill-md: 缺 name 抛错', () => {
  assert.throws(() => parseSkillMarkdown('---\ndescription: 没名字\n---\n正文'), /缺 frontmatter name/);
});

test('skill-registry: register + instructionsBlock + mountTools', async () => {
  const skills = new SkillRegistry();
  const tools = new ToolRegistry();
  const heavy = makeTool({ name: 'quiz.grade', description: '判分工具', async execute() { return null; } });
  skills.register({ name: 'tutor', description: '教师', instructions: '耐心讲解。', tools: [heavy] });
  assert.equal(skills.has('tutor'), true);

  const block = skills.instructionsBlock();
  assert.ok(block.includes('## 技能：tutor'));
  assert.ok(block.includes('耐心讲解。'));

  skills.mountTools(tools);
  assert.equal(tools.has('quiz.grade'), true, 'skill 依赖的工具应挂进 registry');
});

test('skill-registry: disabled 技能不进指令块', () => {
  const skills = new SkillRegistry();
  skills.register({ name: 'off', description: '关', instructions: '开', enabled: false });
  skills.register({ name: 'on', description: '开', instructions: '开' });
  assert.ok(!skills.instructionsBlock().includes('## 技能：off'));
  assert.ok(skills.instructionsBlock().includes('## 技能：on'));
});