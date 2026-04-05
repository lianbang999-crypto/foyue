export const AI_RESPONSE_DISCLAIMER = '以上回答由AI生成，仅供参考，请以原始经典为准。';

export const AI_NO_RESULT_ANSWER = '抱歉，暂未找到与您问题相关的内容。请尝试换一种方式提问。';

export const AI_INVALID_CITATION_ANSWER = '抱歉，这次没能稳定生成带资料编号的原文引用。请换个问法，或让我重新查找文库原文。';

export const AI_TEMPORARY_UNAVAILABLE_ANSWER = '抱歉，AI 服务暂时不可用，请稍后再试。';

export const AI_EMPTY_ANSWER = '抱歉，AI 暂时无法生成回答，请稍后再试。';

// 匹配 [FOLLOWUP]...[/FOLLOWUP]，容错：允许闭合标签缺失、标签前有杂散数字
const FOLLOWUP_BLOCK_RE = /\s*\d*\s*\[FOLLOWUP\]([\s\S]*?)(?:\[\/FOLLOWUP\]|$)/i;
// 过滤模型原样输出的模板占位符文字
const FOLLOWUP_PLACEHOLDER_RE = /^相关问题[一二三四五六]$|^问题[一二三四五六]$/;
export const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|一下|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

const PURELAND_FOLLOWUP_POOL = [
    { keywords: ['妄念', '散乱', '摄心', '昏沉'], questions: ['妄念很多时，法师教人怎样把心收回到佛号上', '昏沉散乱时，还有哪些相关原文可以继续引用'] },
    { keywords: ['信愿行', '三资粮', '信愿', '发愿'], questions: ['什么是信愿行三资粮，文库原文是怎么说的', '发愿求生净土时，法师特别强调哪些关键处'] },
    { keywords: ['带业往生', '业障', '忏悔', '罪业'], questions: ['带业往生的边界在哪里，法师原文怎样开示', '业障深重的人应怎样忏悔并安住在佛号上'] },
    { keywords: ['临终', '助念', '往生'], questions: ['临终助念最重要的准备是什么，能继续引用原文吗', '关于临终正念，法师还有哪些相关开示'] },
    { keywords: ['一心不乱', '功夫', '念佛', '持名'], questions: ['一心不乱到底指什么，文库原文怎么讲', '持名念佛时，应怎样理解功夫成片与一心不乱'] },
    { keywords: ['极乐', '阿弥陀佛', '四十八愿', '愿'], questions: ['阿弥陀佛四十八愿里，和这个问题最相关的是哪几愿', '关于极乐世界依正庄严，法师有哪些直接开示'] },
    { keywords: ['回向', '发心', '出离心', '菩提心'], questions: ['回向发愿心应怎样建立，法师原文有哪些提醒', '真实出离心和求生净土之间是什么关系'] },
    { keywords: ['在家', '工作', '家庭', '居士'], questions: ['在家居士忙碌时，法师建议怎样安排日常念佛', '面对家庭和工作牵缠，净土行人应怎样保持不退'] },
];

export function normalizeHistoryMessages(history, options = {}) {
    const { maxItems = 4, maxChars = 300 } = options;
    return (Array.isArray(history) ? history : [])
        .slice(-maxItems)
        .filter(item => item?.role === 'user' || item?.role === 'assistant')
        .map(item => ({
            role: item.role,
            content: String(item.content || '').slice(0, maxChars),
        }));
}

export function buildRagSystemPrompt(context) {
    return `/no_think
你是净土法音的问答助手。根据下方资料回答用户问题。

规则：
1. 从资料中选出最相关的原文，用 > 完整引用，不改写不截断
2. 每段引用后标注来源：（资料N）
3. 引用之间用一两句话自然过渡即可
4. 如果资料中没有相关内容，直接说"暂无相关内容"
5. 不要加"总之""综上""我认为"等主观话语
6. 不要编造资料中没有的内容

${context}`;
}

export function buildSummaryMessages(title, content) {
    return [
        {
            role: 'system',
            content: `你是一位佛学内容编辑。请为以下佛法开示内容生成一段简洁的摘要（100-200字）。
摘要应概括主要的佛法要点，使用简体中文，语言简洁明了。
不要添加个人观点，忠实于原文。`,
        },
        {
            role: 'user',
            content: `标题：${title}\n\n内容：${content}`,
        },
    ];
}

export function buildRecommendMessages(episodes, contexts) {
    const epDesc = episodes.map((ep, index) => {
        let desc = `${index + 1}. 系列：${ep.series_title}\n`;
        desc += `   系列简介：${ep.series_intro}\n`;
        desc += `   讲者：${ep.speaker}\n`;
        desc += `   本集标题：${ep.episode_title}（第${ep.episode_num}讲，共${ep.total_episodes}讲）\n`;
        if (contexts[index]) desc += `   本集开头内容：${contexts[index].slice(0, 500)}\n`;
        return desc;
    }).join('\n');

    return [
        {
            role: 'system',
            content: `你是净土法音平台的内容编辑，负责每日为用户撰写简短的收听推荐语。
要求：
1. 为每集音频写一段50-80字的推荐语，引导用户想去收听
2. 推荐语应点明该集的核心内容或亮点，用亲切自然的语气
3. 如果有本集内容，应基于实际内容来写；如果没有，则根据系列简介和集数位置推测
4. 不要使用"本集"两字开头，用更自然的表达
5. 严格按JSON数组格式输出，不要输出其他内容
6. 使用简体中文`,
        },
        {
            role: 'user',
            content: `请为以下${episodes.length}集音频各写一段推荐语：

${epDesc}

请按以下JSON格式输出（只输出JSON数组，不要其他文字）：
[{"index":1,"intro":"推荐语..."}${episodes.length >= 2 ? ',{"index":2,"intro":"..."}' : ''}${episodes.length >= 3 ? ',{"index":3,"intro":"..."}' : ''}]`,
        },
    ];
}

function deriveQuestionTopic(question) {
    const cleaned = String(question || '')
        .replace(STOP_WORDS_RE, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.slice(0, 18);
}

function deriveDocTopic(doc = {}) {
    const title = String(doc.title || '').trim();
    const series = String(doc.series_name || '').trim();
    let topic = title
        .replace(series, '')
        .replace(/[《》〈〉【】「」『』]/g, '')
        .replace(/第[一二三四五六七八九十百千万0-9]+讲/g, '')
        .replace(/[（(].*?[)）]/g, '')
        .replace(/[：:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!topic && doc.snippet) {
        topic = String(doc.snippet).slice(0, 16).replace(/\s+/g, ' ').trim();
    }
    return topic.slice(0, 16);
}

function pushUniqueFollowUp(list, seen, question) {
    const value = String(question || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    list.push(value);
}

function buildKnowledgePoolFollowUps(question, docs = []) {
    const haystack = `${question} ${docs.map(doc => `${doc.title || ''} ${doc.series_name || ''} ${doc.snippet || ''}`).join(' ')}`;
    const followUps = [];
    const seen = new Set();

    for (const item of PURELAND_FOLLOWUP_POOL) {
        if (!item.keywords.some(keyword => haystack.includes(keyword))) continue;
        for (const value of item.questions) {
            pushUniqueFollowUp(followUps, seen, value);
            if (followUps.length >= 3) return followUps;
        }
    }

    return followUps;
}

export function buildFallbackFollowUps(question, options = {}) {
    const { noResult = false } = options;
    if (noResult) {
        return [
            '换一个更具体的关键词再问一次',
            '指定某位法师或某部讲记来提问',
        ];
    }

    const topic = deriveQuestionTopic(question);
    return [
        topic ? `${topic}在修行中怎么落实` : '这段开示的重点是什么',
        '能继续引用相关原文吗',
    ];
}

// 从检索到的文档标题生成知识库相关的推荐问题
export function buildSourceFollowUps(docs = [], currentQuestion = '') {
    const followUps = [];
    const seen = new Set();
    const currentClean = currentQuestion.replace(/[？?。，！\s]/g, '').slice(0, 20);

    for (const value of buildKnowledgePoolFollowUps(currentQuestion, docs)) {
        pushUniqueFollowUp(followUps, seen, value);
        if (followUps.length >= 3) return followUps;
    }

    for (const doc of docs) {
        if (followUps.length >= 3) break;
        const title = (doc.title || '').trim();
        const topic = deriveDocTopic(doc);
        if (!title || title.length < 3 || !topic) continue;
        // 跳过和当前问题太相似的
        const titleClean = title.replace(/[（）()第一二三四五六七八九十讲\s]/g, '');
        if (seen.has(titleClean) || currentClean.includes(titleClean.slice(0, 6))) continue;
        seen.add(titleClean);

        const series = doc.series_name || '';
        const questions = series && !title.includes(series)
            ? [
                `${series}里关于「${topic}」还有哪些原文开示`,
                `净土百问里有没有和「${topic}」相近的问题`,
            ]
            : [
                `关于「${topic}」，还能继续引用哪些原文`,
                `「${topic}」在净土百问里通常会怎样发问`,
            ];
        for (const value of questions) {
            pushUniqueFollowUp(followUps, seen, value);
            if (followUps.length >= 3) break;
        }
    }

    if (!followUps.length) {
        const poolFollowUps = buildKnowledgePoolFollowUps(currentQuestion);
        if (poolFollowUps.length) return poolFollowUps;
        return buildFallbackFollowUps(currentQuestion);
    }
    return followUps;
}

export function normalizeAiAnswerContract(rawText, question, options = {}) {
    const { forceNoResult = false } = options;
    const source = String(rawText || '').trim();
    // 清理模型可能残留的 FOLLOWUP 标签
    const body = source.replace(FOLLOWUP_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
    const noResult = forceNoResult || !body;
    const answer = noResult ? AI_NO_RESULT_ANSWER : body;

    // 追问功能已移除，返回空数组
    const followUps = [];

    return {
        answer,
        followUps,
        serialized: answer,
        noResult,
    };
}