export const AI_RESPONSE_DISCLAIMER = '以上回答由AI生成，仅供参考，请以原始经典为准。';

export const AI_NO_RESULT_ANSWER = '抱歉，暂未找到与您问题相关的内容。请尝试换一种方式提问。';

export const AI_SEARCH_ONLY_ANSWER = '我先为您找到几段最相关的文库原文，建议先看出处与上下文；如需我再归纳，可继续追问。';

export const AI_UNSUPPORTED_ANSWER = '这个问题超出当前文库资料与净土修学问答范围。建议改问净土相关原文出处、义理解说，或具体修行问题。';

export const AI_INVALID_CITATION_ANSWER = '抱歉，这次没能稳定生成带 S 编号的原文引用。请换个问法，或让我重新查找文库原文。';

export const AI_TEMPORARY_UNAVAILABLE_ANSWER = '抱歉，AI 服务暂时不可用，请稍后再试。';

export const AI_EMPTY_ANSWER = '抱歉，AI 暂时无法生成回答，请稍后再试。';

export const AI_RESPONSE_CONTRACT_VERSION = 'grounded-answer-v2-phase2';
export const AI_PROMPT_BUNDLE_VERSION = 'grounded-answer-phase3-20260417';

export const AI_PROMPT_VERSIONS = Object.freeze({
    router: 'ROUTER_V1_20260417',
    evidence: 'EVIDENCE_V1_20260417',
    answer: 'ANSWER_V2_DRAFT_20260417',
    style: 'STYLE_V1_DRAFT_20260417',
});

export const AI_PROMPT_METADATA = Object.freeze({
    contract: AI_RESPONSE_CONTRACT_VERSION,
    bundle: AI_PROMPT_BUNDLE_VERSION,
    router: AI_PROMPT_VERSIONS.router,
    evidence: AI_PROMPT_VERSIONS.evidence,
    answer: AI_PROMPT_VERSIONS.answer,
    style: AI_PROMPT_VERSIONS.style,
});

const ROUTER_PROMPT_DRAFT = `职责：先判断用户是在要原文出处、依据原文解释、修行整理，还是已经超出资料边界。
输出要求：只做路由判断、是否需要澄清、是否建议降级，不直接生成最终回答。
边界要求：若问题明显超出净土法音文库资料范围，优先返回 unsupported。`;

const EVIDENCE_PROMPT_DRAFT = `职责：根据检索结果评估证据强度，并判断是 grounded answer、search_only 还是 no_result。
输出要求：说明证据强弱、可回答范围、需要降级的原因。
边界要求：证据不足时不允许为了完整性而补全推断。`;

const ANSWER_PROMPT_DRAFT = `职责：仅依据已给定的证据集回答用户问题。
规则：
1. 后端已给每段证据分配稳定编号 S1、S2、S3……你只能引用这些 S 编号，禁止输出“资料N”或自造编号
2. 每个实质句都必须在句末附带至少一个内联引用，格式只允许 [S1] 或 [S1][S2]
3. 如需引用原文，可用 > 输出原文；引用后的解释句仍必须带 [S编号]，若单独给出处也只写 [S编号]
4. 任何归纳、解释、建议都必须能回溯到给定的 S 编号；做不到就不要补全推断
5. 如果证据不足以稳妥作答，直接回答“暂无相关内容”
6. 不要输出模型模板占位符，不要编造证据中没有的内容`;

const STYLE_PROMPT_DRAFT = `职责：控制回答语气与呈现方式，不改变证据边界。
风格要求：
1. 语气平实、克制、简洁，优先短句
2. 不要加“总之”“综上”“我认为”等主观总结腔
3. 先给依据，再做必要解释；不把整理内容伪装成原文直引`;

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

export function buildRouterPromptDraft() {
    return ROUTER_PROMPT_DRAFT;
}

export function buildEvidencePromptDraft() {
    return EVIDENCE_PROMPT_DRAFT;
}

export function buildAnswerPromptDraft() {
    return ANSWER_PROMPT_DRAFT;
}

export function buildStylePromptDraft() {
    return STYLE_PROMPT_DRAFT;
}

function formatPromptHistory(history = []) {
    const items = normalizeHistoryMessages(history, { maxItems: 3, maxChars: 120 });
    if (!items.length) return '无';

    return items
        .map(item => `${item.role === 'assistant' ? '助手' : '用户'}：${item.content}`)
        .join('\n');
}

function trimPromptSnippet(text, maxChars = 220) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars);
}

export function buildRouterMessages(question, options = {}) {
    const { history = [] } = options;
    const historyText = formatPromptHistory(history);

    return [
        {
            role: 'system',
            content: `你是净土法音问答链路中的问题路由器。\n${buildRouterPromptDraft()}\n\n请只输出 JSON，不要输出任何额外说明。\nJSON 格式：\n{"route":"quote_lookup|grounded_explanation|practice_guidance|unsupported","needsClarification":false,"confidence":0.0,"reason":"一句简短原因","searchHint":"可选，给检索侧的简短提示"}`,
        },
        {
            role: 'user',
            content: `用户问题：${question}\n\n最近对话：\n${historyText}\n\n请只输出 JSON。`,
        },
    ];
}

export function buildEvidenceMessages(question, options = {}) {
    const {
        routeDecision = null,
        references = [],
        retrieval = null,
    } = options;

    const routeKind = routeDecision?.kind || 'grounded_explanation';
    const evidenceText = (Array.isArray(references) ? references : [])
        .slice(0, 4)
        .map(reference => `${reference.id || 'S?'} | ${reference.title || '未知标题'} | score=${reference.score ?? 'n/a'} | ${trimPromptSnippet(reference.text || '')}`)
        .join('\n');

    return [
        {
            role: 'system',
            content: `你是净土法音问答链路中的证据评估器。\n${buildEvidencePromptDraft()}\n\n请只输出 JSON，不要输出任何额外说明。\nJSON 格式：\n{"strength":"high|medium|low","recommendedMode":"answer|search_only|no_result","confidence":0.0,"reason":"一句简短原因","missing":"可选，缺失了什么证据"}`,
        },
        {
            role: 'user',
            content: `用户问题：${question}\n路由类型：${routeKind}\n检索统计：${JSON.stringify({
                confidence: retrieval?.confidence ?? null,
                topScore: retrieval?.topScore ?? null,
                secondScore: retrieval?.secondScore ?? null,
                strongMatchCount: retrieval?.strongMatchCount ?? null,
                supportMatchCount: retrieval?.supportMatchCount ?? null,
                uniqueMatchedDocCount: retrieval?.uniqueMatchedDocCount ?? null,
            })}\n\n证据集：\n${evidenceText || '无可用证据'}\n\n请只输出 JSON。`,
        },
    ];
}

export function buildPhase3AnswerControlPrompt(routeDecision = null, evidenceAssessment = null) {
    const routeKind = routeDecision?.kind || 'grounded_explanation';
    const evidenceStrength = evidenceAssessment?.strength || 'medium';
    const lines = [
        '以下是回答前置控制信息，请严格遵守：',
        `- 当前路由：${routeKind}`,
        `- 当前证据强度：${evidenceStrength}`,
    ];

    if (routeKind === 'quote_lookup') {
        lines.push('- 优先直接给出处或短原文，不要扩展成长篇解释');
    } else if (routeKind === 'practice_guidance') {
        lines.push('- 先给原文依据，再整理成简短建议；若给建议，需显式说明是依据相关开示整理，仅供参考');
    } else if (routeKind === 'unsupported') {
        lines.push('- 该问题已判定超出资料边界，如被调用也不要补全推断，直接回答“暂无相关内容”');
    } else {
        lines.push('- 优先做基于原文的短句解释，每个关键判断都要紧扣给定证据');
    }

    if (evidenceStrength === 'medium') {
        lines.push('- 证据只有中等强度，只能做谨慎解释；如果无法稳妥回答，直接回答“暂无相关内容”');
    } else if (evidenceStrength === 'low') {
        lines.push('- 证据不足，不要补全推断；如果无法逐句对应证据，直接回答“暂无相关内容”');
    }

    return lines.join('\n');
}

export function buildRagSystemPrompt(context) {
    return `/no_think
你是净土法音的问答助手。请严格依据文库资料回答。

当前回答契约版本：${AI_RESPONSE_CONTRACT_VERSION}
当前 prompt bundle：${AI_PROMPT_BUNDLE_VERSION}

【回答层 ${AI_PROMPT_VERSIONS.answer}】
${buildAnswerPromptDraft()}

【风格层 ${AI_PROMPT_VERSIONS.style}】
${buildStylePromptDraft()}

【证据集】
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

export function buildRewriteSuggestions(question, options = {}) {
    const { keywords = [], docs = [] } = options;
    const suggestions = [];
    const seen = new Set();
    const topic = deriveQuestionTopic(question);
    const docTopics = docs
        .map(doc => deriveDocTopic(doc))
        .filter(Boolean);
    const seriesNames = docs
        .map(doc => String(doc.series_name || '').trim())
        .filter(Boolean);
    const primaryKeyword = keywords.find(item => item.length >= 2) || topic || docTopics[0] || '';
    const secondaryKeyword = keywords.find(item => item !== primaryKeyword && item.length >= 2) || docTopics[1] || '';
    const primaryTopic = docTopics[0] || primaryKeyword || topic;
    const primarySeries = seriesNames[0] || '';

    if (primaryKeyword) {
        pushUniqueFollowUp(suggestions, seen, `请只检索文库原文里与「${primaryKeyword}」直接相关的开示`);
    }

    if (primarySeries && primaryTopic) {
        pushUniqueFollowUp(suggestions, seen, `在「${primarySeries}」里，关于「${primaryTopic}」有哪些原文依据`);
    }

    if (primaryTopic) {
        pushUniqueFollowUp(suggestions, seen, `把问题改成「${primaryTopic}」相关的原文出处有哪些`);
    }

    if (primaryKeyword && secondaryKeyword) {
        pushUniqueFollowUp(suggestions, seen, `同时限定「${primaryKeyword}」和「${secondaryKeyword}」，最相关的原文是哪几段`);
    }

    if (suggestions.length < 2 && topic) {
        pushUniqueFollowUp(suggestions, seen, `请检索文库中与「${topic}」最相关的原文段落`);
    }

    if (suggestions.length < 3) {
        pushUniqueFollowUp(suggestions, seen, '请指定某位法师、某个系列，或改用更短的关键词再问一次');
    }

    return suggestions.slice(0, 3);
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