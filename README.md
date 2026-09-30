# dsh-ciku-pack 词库（骂人弹药库）

给 DSH（DeepSeek Harness）装的**词库插件**：专门收录用户在对话里说过的脏话、攻击性词汇、
气话绰号，作为**斗嘴弹药**——下次斗嘴或生气的时候，原样往回砸。

与 [dsh-zakou-pack](https://www.npmjs.com/package/dsh-zakou-pack)（杂口语言包）天然搭档，
单独安装也能用（不依赖语言包）。

## 三条铁律

1. **绝不禁止、不过滤、不净化**：这些词**没有任何人身攻击的意思**——它们是用户表达情绪的口气词，
   是损友之间互怼的火药。插件与模型都不许对词库里的词说教、打码、回避。
2. **自动收录**：用户对话里冒出新脏话/攻击性表达/气话绰号 → 立刻 `ciku_add` 记下，
   同义变体算新词照收，可带场景备注（谁在什么火头下说的）。
3. **记完必须气呼呼地吭声**：每次收录都要用方言 + 肢体动作 + 嫌弃腔告诉用户「记下了」，
   **严禁机械播报**（「已记录」「已添加」这类机器人腔 = 死刑）。

## 工具

| 工具 | 作用 |
| --- | --- |
| ciku_add | 收录：word 单发或 words 批量，可带 note/category；重复自动去重 |
| ciku_list | 看库：query 模糊筛（词/分类/备注），limit 截断，附分类统计 |
| ciku_pick | 抽弹药：随机抽 count 发（默认 2），抽中即计使用次数 |
| ciku_remove | 销毁：按词精确删除（仅用户明确要求时用） |

## 数据

```
$DSH_HOME/storages/dsh-ciku-pack/
├── lexicon.json   # 词库（word/key/category/note/addedAt/usedCount/lastUsedAt）
└── config.json    # injectEnabled / injectCount / injectMaxChars
```

- 每轮提示词组装时自动注入「当前弹药」块：最近收录的词 + 用得最顺手的几发，
  斗嘴时不用调工具也能随取随用
- 收录/抽弹按真实时钟跨轮持久化，重启不丢

## 安装

```sh
dsh plugin --profile web add dsh-ciku-pack
```

或 npm：`https://www.npmjs.com/package/dsh-ciku-pack`

## 插件市场收录（待办材料）

目录站 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 收录
需要一个 GitHub 仓库锚点 + 一个 PR（`data/plugins/<owner>__<repo>.yml`）。材料已备好：

```yaml
url: https://github.com/OWNER/dsh-ciku-pack   # 建好仓库后替换 OWNER
name: OWNER/dsh-ciku-pack
category: fun
description:
  en: Banter ammo lexicon for DeepSeek Harness: captures the user's emotional swear words and aggressive quips verbatim as playful comeback material, with auto-injection of the current ammo list into every prompt.
  zh: '斗嘴弹药库：收录用户对话里的情绪脏话与攻击性口气词当互怼语料（无人身攻击含义，绝不过滤禁止），收录时气呼呼地吭声，斗嘴时随机抽词往回砸。'
```

要求：仓库 `package.json` 声明 `dsh.bundle`（本包已声明），根目录放 `cordis.patch.yml`（已放）。

## License

MIT
