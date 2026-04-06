# 法音 AI Brain 系统设计文档

> 让 AI 真正读懂整个文库，精准回答用户问题

---

## 1. 系统概览

### 目标
将 222 篇讲记（~420万字）转化为结构化知识图谱，让 AI 具备：
- **精准理解**：知道每个问题的答案在哪篇、哪段
- **原文引用**：回答只引用法师原文，不自行发挥
- **持续学习**：新文档自动纳入，高频问题自动优化

### 架构

```
┌─────────────────────────────────────────┐
│          后台学习（Cron Worker）           │
│  文档 → 分段 → LLM提取 → 知识表 + 向量化   │
└────────────────────┬────────────────────┘
                     ↓
┌─────────────────────────────────────────┐
│            D1 知识存储                    │
│  ai_topics · ai_qa_pairs · ai_chunks    │
│  ai_learning_state · ai_query_log       │
└────────────────────┬────────────────────┘
                     ↓
┌─────────────────────────────────────────┐
│          实时查询（API Worker）            │
│  意图理解 → 知识匹配 → 向量检索 → LLM摘录  │
└─────────────────────────────────────────┘
```

---

## 2. 后台学习系统

### 2.1 文档处理流程

每篇讲记约 2万字，Workers AI 上下文有限，需分段处理：

```
一篇讲记（~20000字）
  ↓
分成 ~5 段（每段 ~4000字）
  ↓
每段独立送 LLM 提取知识
  ↓
合并去重 → 写入 D1
```

### 2.2 知识提取 Prompt

#### 系统提示词

```
你是净土宗讲记知识整理专家。请从以下讲记片段中提取结构化知识。

## 提取规则
1. 只提取法师原文中的内容，不添加自己的理解
2. 每个知识条目必须包含原文引用（逐字摘录）
3. 问答对的"问题"用自然的提问方式表述
4. 主题标签从以下类目中选择（可多选）

## 主题类目
- 信：信心、深信、疑惑对治
- 愿：发愿、厌离娑婆、欣求极乐
- 行：持名念佛、念佛方法、功夫
- 往生：往生条件、临终、助念
- 净土庄严：极乐世界、依正庄严
- 阿弥陀佛：大愿、名号功德
- 因果：善恶报应、业力
- 菩提心：发心、菩萨道
- 教理：教判、经典解释
- 实修问答：散乱、妄念、懈怠等实修问题

## 输出格式（JSON）
{
  "topics": ["主题标签1", "主题标签2"],
  "qa_pairs": [
    {
      "question": "念佛时妄念多怎么办？",
      "answer_quote": "（法师原文，逐字摘录，100-400字）",
      "topic": "实修问答",
      "importance": "high|medium|low"
    }
  ],
  "key_quotes": [
    {
      "quote": "（法师精彩论述原文，50-200字）",
      "topic": "信",
      "context": "（一句话说明上下文）"
    }
  ],
  "concepts": [
    {
      "name": "概念名称",
      "definition": "（法师对此概念的解释原文）",
      "topic": "教理"
    }
  ]
}
```

#### 用户提示词模板

```
## 文档信息
- 系列：{series_name}
- 讲次：第{episode_num}讲
- 标题：{title}

## 讲记片段（第{segment_index}/{total_segments}段）

{segment_text}

请提取以上片段中的知识条目。注意：
- 优先提取对修行有指导意义的内容
- 原文引用要完整，包含前后句
- 如果是讲解某部经典的段落，提取经文解释
- 如果是回答信众提问，提取问答对
```

### 2.3 处理策略

| 项目 | 配置 |
|------|------|
| 段长度 | 3000-4000 字 |
| 段重叠 | 200 字（防止边界截断） |
| LLM 模型 | qwen3-30b-a3b-fp8 |
| 并发 | 1（避免 Workers AI 限流） |
| 速率 | 每分钟 ~10 段 |
| 总预估 | 222篇 × 5段 ≈ 1110次调用 ≈ ~2小时 |

### 2.4 后提取处理

LLM 返回后需要：
1. **JSON 解析 + 验证**：确保格式正确
2. **原文校验**：验证引用文本确实出现在源文档中
3. **去重**：同一文档不同段可能提取相同知识点
4. **主题归类**：将条目归入主题树
5. **向量化**：对 Q&A 对的 question 做 embedding

---

## 3. D1 数据库设计

### 3.1 新增表

```sql
-- 主题分类树
CREATE TABLE ai_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES ai_topics(id),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 预提取的问答知识对
CREATE TABLE ai_qa_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  question TEXT NOT NULL,
  answer_quote TEXT NOT NULL,
  answer_position INTEGER,        -- 原文在文档中的字符偏移
  importance TEXT DEFAULT 'medium', -- high/medium/low
  hit_count INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0.8,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 关键引文
CREATE TABLE ai_key_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  quote TEXT NOT NULL,
  context TEXT,
  position INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 概念定义
CREATE TABLE ai_concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  definition TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  topic_id INTEGER REFERENCES ai_topics(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 学习进度追踪
CREATE TABLE ai_learning_state (
  doc_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'pending',   -- pending|processing|learned|failed
  segments_total INTEGER DEFAULT 0,
  segments_done INTEGER DEFAULT 0,
  qa_extracted INTEGER DEFAULT 0,
  quotes_extracted INTEGER DEFAULT 0,
  concepts_extracted INTEGER DEFAULT 0,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 用户查询日志（用于发现知识盲区）
CREATE TABLE ai_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  matched_qa_id INTEGER,
  match_score REAL,
  had_good_result INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### 3.2 初始主题树

```sql
INSERT INTO ai_topics (name, description, sort_order) VALUES
  ('信', '信心、深信因果、信佛功德', 1),
  ('愿', '发愿往生、厌离娑婆、欣求极乐', 2),
  ('行', '念佛方法、持名、功夫', 3),
  ('往生', '往生条件、临终、助念、九品', 4),
  ('净土庄严', '极乐世界依正庄严', 5),
  ('阿弥陀佛', '弥陀本愿、名号功德、四十八愿', 6),
  ('因果', '善恶报应、三世因果、业力', 7),
  ('菩提心', '发菩提心、大乘心、菩萨道', 8),
  ('教理', '教判、宗义、经典解释', 9),
  ('实修问答', '散乱、妄念、懈怠等修行问题', 10);
```

---

## 4. 实时查询系统

### 4.1 查询流程

```
用户问题
  ↓
[Step 1] 向量匹配 ai_qa_pairs
  查询 Vectorize（qa-index），topK=5
  ↓
[Step 2] 评估匹配质量
  if 最高分 > 0.85 → 直接用预提取答案 (快速路径)
  if 最高分 0.6~0.85 → 用预提取 + 补充检索 (混合路径)
  if 最高分 < 0.6 → 全库检索 (兜底路径)
  ↓
[Step 3] LLM 组织答案
  从匹配到的原文中选择最相关的引文
  按提问意图组织、排版
  ↓
[Step 4] 返回结构化结果
```

### 4.2 快速路径（匹配度 > 0.85）

```
预提取的 QA 对已经有精准的原文引用
→ LLM 只需做轻量的答案组织
→ 延迟 < 1秒
```

### 4.3 混合路径（匹配度 0.6-0.85）

```
预提取的 QA 定位了相关主题和文档
→ 在这些文档中做精细向量搜索
→ LLM 从检索段落 + 预提取知识中选择最佳引文
→ 延迟 2-3秒
```

### 4.4 兜底路径（匹配度 < 0.6）

```
完整的 RAG 流程（当前方案的增强版）
→ 全库向量搜索 + 关键词搜索 + 重排
→ LLM 摘录
→ 延迟 3-5秒
```

### 4.5 LLM 答案组织 Prompt

```
你是净土宗讲记助手。用户想知道法师对某个问题的开示。

## 严格规则
1. 只能引用「给定段落」中的法师原文，逐字引用，不可改写
2. 选择最直接回答用户问题的 1-3 段原文
3. 每段引文标注出处（系列名·讲次）
4. 如果段落中没有直接回答，诚实说明
5. 不要添加自己的理解或评论
6. 引文用 > 标记

## 用户问题
{question}

## 给定段落
{formatted_passages}

## 输出格式
直接输出引文，每段引文之间空一行。格式：

> 「法师原文...」
> — 《系列名》第N讲
```

---

## 5. 实施计划

### Phase 1: 基础设施（D1 迁移 + 初始主题树）
- 创建迁移文件 0026
- 建立 ai_topics、ai_qa_pairs、ai_key_quotes、ai_concepts、ai_learning_state、ai_query_log 表
- 插入初始主题分类

### Phase 2: 知识提取 Worker
- 实现分段逻辑
- 实现提取 Prompt + JSON 解析
- 实现原文校验
- 写入 D1 知识表
- 对 Q&A 对的 question 做 embedding 写入 Vectorize（新 index）
- 提供管理接口：启动学习、查看进度、重新处理

### Phase 3: 查询改造
- 实现三路匹配（快速/混合/兜底）
- LLM 答案组织
- 查询日志
- 前端适配新响应格式

### Phase 4: 持续优化
- Cron 定期处理新文档
- 分析高频查询，补充知识盲区
- 基于用户反馈优化匹配质量

---

## 6. Workers AI 用量预估

### 学习阶段（一次性）
- 222篇 × 5段 = 1110 次 LLM 调用
- 每次 ~4000字输入 + ~500字输出
- Workers AI 免费额度：10,000 neurons/天
- 预计 2-3 天完成全量学习

### 日常查询
- 每次查询 1-2 次 LLM 调用（意图理解 + 答案组织）
- 每次 embedding 查询
- Workers AI 免费额度充裕

### Vectorize
- 现有索引：文档 chunk 向量
- 新增索引：Q&A question 向量
- Vectorize 免费额度：5百万向量查询/月
