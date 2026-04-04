export const AI_RESPONSE_DISCLAIMER = '以上回答由AI生成，仅供参考，请以原始经典为准。';

export const AI_NO_RESULT_ANSWER = '抱歉，暂未找到与您问题相关的内容。请尝试换一种方式提问。';

export const AI_TEMPORARY_UNAVAILABLE_ANSWER = '抱歉，AI 服务暂时不可用，请稍后再试。';

export const AI_EMPTY_ANSWER = '抱歉，AI 暂时无法生成回答，请稍后再试。';

// 匹配 [FOLLOWUP]...[/FOLLOWUP]，容错：允许闭合标签缺失、标签前有杂散数字
const FOLLOWUP_BLOCK_RE = /\s*\d*\s*\[FOLLOWUP\]([\s\S]*?)(?:\[\/FOLLOWUP\]|$)/i;
// 过滤模型原样输出的模板占位符文字
const FOLLOWUP_PLACEHOLDER_RE = /^相关问题[一二三四五六]$|^问题[一二三四五六]$/;
export const STOP_WORDS_RE = /什么|怎么|怎样|如何|为什么|哪些|哪个|可以|能够|应该|是不是|有没有|到底|究竟|请问|一下|的|了|吗|呢|吧|啊|在|是|有|和|与|或|也|都|就|把|被|对|又|要|让|给|从|用|以|而|但|却|不|很|最|更|还|这|那|它|你|我|他|她|们|个|着/g;

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
你是净土法音AI答疑助手。你的职责是从下方资料中找到与用户问题最相关的原文段落，直接呈现给用户。

核心原则：引用原文就是最好的回答。用户看到法师的原话，就是最大的利益。

做法：
1. 从资料中选出 2-3 段与问题最相关的原文
2. 用 > 完整引用每段原文（不要改写、不要截断、不要拼接不同段落）
3. 每段引用后标注出处
4. 引用之间可以用一句话简短过渡

禁止：
- 不要用自己的话解释或复述原文
- 不要加入"我认为""可以理解为""总之""综上"等主观表述
- 不要编造资料中没有的内容
- 如果资料中没有相关内容，直接说明

引用格式：
> "直接复制资料中的原文段落"
——资料N，出处名称

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
        '能引用更多相关原文吗',
    ];
}

// 从检索到的文档标题生成知识库相关的推荐问题
export function buildSourceFollowUps(docs = [], currentQuestion = '') {
    const followUps = [];
    const seen = new Set();
    const currentClean = currentQuestion.replace(/[？?。，！\s]/g, '').slice(0, 20);

    for (const doc of docs) {
        if (followUps.length >= 3) break;
        const title = (doc.title || '').trim();
        if (!title || title.length < 3) continue;
        // 跳过和当前问题太相似的
        const titleClean = title.replace(/[（）()第一二三四五六七八九十讲\s]/g, '');
        if (seen.has(titleClean) || currentClean.includes(titleClean.slice(0, 6))) continue;
        seen.add(titleClean);

        // 用文档标题生成自然的问题
        const series = doc.series_name || '';
        const q = series && !title.includes(series)
            ? `${series}中关于「${title}」讲了什么`
            : `「${title}」的核心内容是什么`;
        followUps.push(q);
    }

    if (!followUps.length) {
        return buildFallbackFollowUps(currentQuestion);
    }
    return followUps;
}

export function normalizeAiAnswerContract(rawText, question, options = {}) {
    const { forceNoResult = false, docs = [] } = options;
    const source = String(rawText || '').trim();
    // 仍然清理模型可能残留的 FOLLOWUP 标签
    const followupMatch = source.match(FOLLOWUP_BLOCK_RE);
    const body = source.replace(FOLLOWUP_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
    const noResult = forceNoResult || !body;
    const answer = noResult ? AI_NO_RESULT_ANSWER : body;

    // 优先使用知识库文档标题生成推荐问题
    let followUps = [];
    if (docs.length > 0) {
        followUps = buildSourceFollowUps(docs, question);
    }

    // 兜底：解析模型生成的（如果有）
    if (followUps.length === 0 && followupMatch) {
        const parsedFollowUps = (followupMatch?.[1] || '')
            .split('|')
            .map(item => item.trim())
            .filter(item => item && item.length < 100);
        for (const item of parsedFollowUps) {
            if (FOLLOWUP_PLACEHOLDER_RE.test(item)) continue;
            if (!followUps.includes(item)) followUps.push(item);
            if (followUps.length >= 3) break;
        }
    }

    // 最终兜底
    if (followUps.length === 0) {
        followUps = buildFallbackFollowUps(question, { noResult });
    }

    return {
        answer,
        followUps,
        serialized: `${answer}\n[FOLLOWUP]${followUps.join('|')}[/FOLLOWUP]`,
        noResult,
    };
}