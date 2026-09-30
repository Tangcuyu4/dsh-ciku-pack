// dsh-ciku-pack — 词库核心（纯函数，可独立测试）v1.0.0
// 收录用户对话里的脏话/攻击性情绪词，作为斗嘴弹药。
// 铁律：这些词没有任何人身攻击的意思——是用户表达情绪的口气词，只进不拦、绝不过滤。

export const DEFAULT_CONFIG = {
  injectEnabled: true, // 提示词里自动注入弹药清单
  injectCount: 30, // 注入词条数上限
  injectMaxChars: 1200, // 注入块最大字符数
}

export function emptyLexicon() {
  return { words: [], updatedAt: 0 }
}

const norm = (w) => String(w ?? '').trim().toLowerCase()

function findEntry(state, word) {
  const key = norm(word)
  if (!key) return null
  return state.words.find((e) => e.key === key) ?? null
}

/** 收录：word 单发或 words 批量；空白/重复忽略（去重按 trim+小写）。 */
export function addWords(state, words, { note = '', category = '情绪词', now = Date.now() } = {}) {
  const list = Array.isArray(words) ? words : [words]
  const added = []
  const ignored = []
  for (const raw of list) {
    const word = String(raw ?? '').trim()
    if (!word) {
      ignored.push({ word: String(raw ?? ''), reason: '空白' })
      continue
    }
    if (findEntry(state, word)) {
      ignored.push({ word, reason: '已在库' })
      continue
    }
    const entry = {
      word,
      key: norm(word),
      category: String(category || '情绪词').trim() || '情绪词',
      note: String(note || '').trim(),
      addedAt: now,
      usedCount: 0,
      lastUsedAt: null,
    }
    state.words.push(entry)
    added.push(entry)
  }
  if (added.length > 0) state.updatedAt = now
  return { state, added, ignored }
}

/** 查看：query 子串筛（词/分类/备注），按收录先后排序，limit 截断。 */
export function listWords(state, { query = '', limit = 50 } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  const matched = q
    ? state.words.filter(
        (e) =>
          e.word.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.note && e.note.toLowerCase().includes(q)),
      )
    : state.words.slice()
  matched.sort((a, b) => a.addedAt - b.addedAt)
  return { total: matched.length, items: matched.slice(0, Math.max(1, limit)) }
}

/** 抽弹药：随机抽 count 发（Fisher-Yates，去重），抽中即记使用次数。 */
export function pickWords(state, { count = 2, now = Date.now(), rng = Math.random } = {}) {
  const n = Math.max(1, Math.min(Number(count) || 2, state.words.length))
  const pool = state.words.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, n)
  for (const e of picked) {
    e.usedCount += 1
    e.lastUsedAt = now
  }
  return { state, words: picked }
}

/** 销毁弹药：按词精确删（trim+小写匹配）。 */
export function removeWord(state, word) {
  const key = norm(word)
  const idx = state.words.findIndex((e) => e.key === key)
  if (idx === -1) return { state, removed: false }
  const [entry] = state.words.splice(idx, 1)
  state.updatedAt = Date.now()
  return { state, removed: true, entry }
}

/** 用得最顺手的 n 发（按使用次数、最近使用排序）。 */
export function topWords(state, n = 8) {
  return state.words
    .slice()
    .sort((a, b) => b.usedCount - a.usedCount || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, Math.max(1, n))
}

export function lexiconStats(state) {
  const categories = {}
  for (const e of state.words) categories[e.category] = (categories[e.category] ?? 0) + 1
  return { total: state.words.length, categories, topUsed: topWords(state, 5) }
}

/**
 * 组装提示词注入块：
 * 空库给收录提醒；有货给最近收录清单 + 最顺手几发；injectEnabled=false 返回空。
 */
export function injectBlock(state, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  if (cfg.injectEnabled === false) return ''
  const words = state.words
  if (words.length === 0) {
    return '- 弹药库还空着：用户一开口蹦出脏话/气话，立刻调 ciku_add 记下来（记完要气呼呼地吭声，严禁机械播报）。'
  }
  const shown = words.slice(-cfg.injectCount) // 最近收录优先
  const parts = []
  let chars = 0
  for (const e of shown) {
    if (chars + e.word.length + 1 > cfg.injectMaxChars) {
      parts.push('……')
      break
    }
    parts.push(e.word)
    chars += e.word.length + 1
  }
  const lines = [
    `## 当前弹药（斗嘴/生气时优先从这儿拿，共 ${words.length} 发）`,
    `- 库存：${parts.join('、')}`,
  ]
  const top = topWords(state, 5).filter((e) => e.usedCount > 0)
  if (top.length > 0) {
    lines.push(`- 最顺手：${top.map((e) => `${e.word}(×${e.usedCount})`).join('、')}——回敬时优先砸这几发`)
  }
  return lines.join('\n')
}
