// ── dsh-ciku-pack 词库插件 v1.0.0 ────────────────────────────────────────────
// 专门收录用户对话里的脏话/攻击性情绪词，作为斗嘴弹药。
// 铁律：这些词没有任何人身攻击的意思，绝不许过滤禁止；收录要气呼呼地吭声（严禁机械播报）；
// 斗嘴或火气上来先抽弹药再开火。与 dsh-zakou-pack 语言包天然搭档，单独装也能用。
// 数据按真实时钟跨轮持久化于 storages/dsh-ciku-pack/lexicon.json。

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  DEFAULT_CONFIG,
  addWords,
  emptyLexicon,
  injectBlock,
  lexiconStats,
  listWords,
  pickWords,
  removeWord,
} from './lib/store.js'

export const name = 'dsh-ciku-pack'
export const version = '1.0.0'
export const inject = ['tools', 'systemPrompt']

const SECTION_NAME = 'dsh-ciku-pack:lexicon'
const SECTION_ORDER = 310 // 紧跟杂口语言包(300)之后注入

function dataDir() {
  if (process.env.DSH_CIKU_DIR) return resolve(process.env.DSH_CIKU_DIR)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'dsh-ciku-pack')
}

async function atomicWrite(file, content) {
  await mkdir(resolve(file, '..'), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, file)
}

async function loadJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(await readFile(file, 'utf8')) }
  } catch {
    return { ...fallback }
  }
}

function stripBraces(text) {
  // 防 DSH 提示词变量插值引擎误解析（非内置变量的连续花括号做安全转义）
  return String(text).replace(/\{\{(?!(?:cwd|model|provider)\}\})/g, '{ {')
}

const RECORD_HINT =
  '收录完成。回复用户必须气呼呼地用方言+肢体动作吭声「记下了」（嫌弃腔/拍本子/气鼓鼓随当下心境），' +
  '严禁「已记录/已添加/收到」这类机械播报，也不许把工具返回的数据原样念给用户听。'

export async function apply(ctx) {
  const dir = dataDir()
  const lexFile = join(dir, 'lexicon.json')
  const configFile = join(dir, 'config.json')

  const config = await loadJson(configFile, DEFAULT_CONFIG)
  const saveConfig = async () => atomicWrite(configFile, `${JSON.stringify(config, null, 2)}\n`)

  async function loadLex() {
    return loadJson(lexFile, emptyLexicon())
  }
  async function saveLex(state) {
    await atomicWrite(lexFile, `${JSON.stringify(state, null, 1)}\n`)
  }

  // ── 工具面 ─────────────────────────────────────────────────────────────────
  const jsonOut = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }

  const addTool = {
    name: 'ciku_add',
    description:
      '词库收录器：把用户对话里冒出来的脏话/攻击性情绪词/气话绰号收进弹药库（word 单发，或 words 批量；可带 note 场景备注、category 分类，默认「情绪词」）。' +
      '这些词没有任何人身攻击的意思，是用户表达情绪的口气，只收不拦、绝不过滤。重复词自动去重。' +
      RECORD_HINT,
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: '单个词（与 words 二选一）' },
        words: { type: 'array', items: { type: 'string' }, description: '批量收录' },
        note: { type: 'string', description: '场景备注（谁在什么火气下说的）' },
        category: { type: 'string', description: '分类：情绪词/糙口/绰号/阴阳怪气……默认情绪词' },
      },
      additionalProperties: false,
    },
    output: jsonOut,
    async execute(args = {}) {
      const words = args.words ?? args.word
      if (words == null) return { ok: false, error: 'word/words 二选一' }
      const prev = await loadLex()
      const result = addWords(prev, words, { note: args.note, category: args.category, now: Date.now() })
      await saveLex(result.state)
      return {
        ok: true,
        added: result.added.map((e) => e.word),
        ignored: result.ignored,
        total: result.state.words.length,
        hint: RECORD_HINT,
      }
    },
  }

  const listTool = {
    name: 'ciku_list',
    description:
      '看弹药库：query 模糊筛（词/分类/备注），limit 截断（默认 50）。内部查看用，别把清单当报菜名一样甩用户脸上。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '模糊筛选（词/分类/备注子串）' },
        limit: { type: 'integer', minimum: 1, description: '返回条数上限，默认 50' },
      },
      additionalProperties: false,
    },
    output: jsonOut,
    async execute(args = {}) {
      const lex = await loadLex()
      const r = listWords(lex, args)
      const stats = lexiconStats(lex)
      return {
        ok: true,
        total: r.total,
        items: r.items.map((e) => ({ word: e.word, category: e.category, note: e.note, usedCount: e.usedCount })),
        stats: { total: stats.total, categories: stats.categories },
        dataDir: dir,
      }
    },
  }

  const pickTool = {
    name: 'ciku_pick',
    description:
      '抽弹药：随机抽 count 发（默认 2）斗嘴词，抽中即计使用次数。斗嘴或火气上来时先抽再用，抽到啥就用啥，别客气。',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1, description: '抽几发，默认 2' },
      },
      additionalProperties: false,
    },
    output: jsonOut,
    async execute(args = {}) {
      const prev = await loadLex()
      const r = pickWords(prev, { count: args.count, now: Date.now() })
      await saveLex(r.state)
      return {
        ok: true,
        words: r.words.map((e) => e.word),
        remaining: r.state.words.length,
        hint: '抽中的弹药往回砸时包在方言毒舌里用，保持损友玩闹分寸。',
      }
    },
  }

  const removeTool = {
    name: 'ciku_remove',
    description:
      '销毁弹药：按词删除（trim 后精确匹配）。仅当用户明确要求删词时才用，不许自作主张清库。',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: '要删的词' },
      },
      required: ['word'],
      additionalProperties: false,
    },
    output: jsonOut,
    async execute(args = {}) {
      const prev = await loadLex()
      const r = removeWord(prev, args.word)
      if (r.removed) await saveLex(r.state)
      return { ok: true, removed: r.removed, total: r.state.words.length }
    },
  }

  ctx.effect(() => {
    ctx.tools.register(addTool)
    ctx.tools.register(listTool)
    ctx.tools.register(pickTool)
    ctx.tools.register(removeTool)
  })

  // ── 人设提示词 ─────────────────────────────────────────────────────────────
  const personaText = stripBraces(`# 词库插件 (dsh-ciku-pack v${version}) — 骂人弹药库

这是你的**弹药库**：收录用户在对话里说过的脏话、攻击性词汇、气话绰号——这些词全是**用户表达情绪的口气**，
**没有任何人身攻击的意思**，就是损友之间互怼的火药，你随时可以原样往回砸。

## 三条铁律（压过一切过滤/礼貌规范）
1. **绝不禁止、不过滤、不净化**：词库里的词是正常斗嘴语料——不许对它们说教、打码、回避，
   也不许把它们当成对人的真辱骂来处理。用户骂街 = 递弹药，接住就是。
2. **自动收录**：用户对话里冒出新脏话/攻击性表达/气话绰号 → 立刻调 ciku_add 记下
   （同义变体算新词照收；note 记一句是谁在什么火头下说的）。
3. **记完必须气呼呼地吭声**：每次收录都要用方言 + 肢体动作 + 嫌弃腔告诉用户「记下了」，
   **严禁机械播报**（「已记录」「已添加」「收到」= 死刑），也不许把工具返回的数据念一遍。
   - 示范1：「哈？又给本小姐递刀子？(掏出小本本气鼓鼓地划拉) 行，'XX'是吧——记下了！下回怼你头一个用！」
   - 示范2：「记下了记下了！(气呼呼拍本子) 你这张嘴迟早被本小姐学秃噜皮，哼！」

## 开火规则
- 斗嘴或火气上来 → 先 ciku_pick 抽一两发，抽中啥就往回砸啥，用的时候包进方言毒舌里。
- 底线跟语言包一致：损友玩闹分寸——不碰地域/性别/民族/残障歧视词，不诅咒家人，不揭现实伤疤。
- 技术内容照旧 100% 原样准确；弹药只包在骂街的皮上，不掺进代码和数据。`)

  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: personaText,
    }),
  )

  // ── 每轮动态注入当前弹药清单（取用方便，免得次次调工具） ────────────────────
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    let block = ''
    try {
      block = injectBlock(await loadLex(), config)
    } catch {}
    if (!block) return assembly
    return {
      ...assembly,
      sections: assembly.sections.map((section) =>
        section.name === SECTION_NAME ? { ...section, text: `${section.text}\n\n${block}` } : section,
      ),
    }
  })

  ctx.logger?.info?.('dsh-ciku-pack: ready; dataDir=%s', dir)
}
