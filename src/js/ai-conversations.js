function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const ASSISTANT_MESSAGE_MODES = new Set(['answer', 'partial', 'search_only', 'no_result']);

function normalizeText(value) {
    return typeof value === 'string' ? value : String(value || '');
}

function normalizeConfidence(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(1, Math.round(numeric * 100) / 100));
}

function normalizePositiveNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric;
}

function normalizeCitationId(value) {
    const normalized = normalizeText(value).trim().toUpperCase().replace(/\s+/g, '');
    const match = /^S(\d+)$/.exec(normalized);
    if (!match) return '';
    return `S${Number.parseInt(match[1], 10)}`;
}

function normalizeCitationIdList(values, maxLength = 6) {
    const items = Array.isArray(values)
        ? values
        : typeof values === 'string'
            ? values.split(/[\s,，、|]+/)
            : [];

    const normalized = [];
    const seen = new Set();

    for (const value of items) {
        const citationId = normalizeCitationId(value);
        if (!citationId || seen.has(citationId)) continue;
        seen.add(citationId);
        normalized.push(citationId);
        if (normalized.length >= maxLength) break;
    }

    return normalized;
}

function normalizeStringList(values, maxLength = 6) {
    if (!Array.isArray(values)) return [];

    const normalized = [];
    const seen = new Set();
    for (const value of values) {
        const text = normalizeText(value).trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        normalized.push(text);
        if (normalized.length >= maxLength) break;
    }
    return normalized;
}

function normalizePlainObject(value, allowedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const normalized = {};
    for (const key of allowedKeys) {
        const next = value[key];
        if (next === null || next === undefined) continue;
        if (typeof next === 'string') {
            const text = normalizeText(next).trim();
            if (text) normalized[key] = text;
            continue;
        }
        if (typeof next === 'number' || typeof next === 'boolean') {
            normalized[key] = next;
        }
    }

    return Object.keys(normalized).length ? normalized : null;
}

function normalizeSources(sources) {
    if (!Array.isArray(sources)) return [];

    return sources
        .map((source) => {
            if (!source || typeof source !== 'object') return null;
            const title = normalizeText(source.title).trim();
            const docId = normalizeText(source.doc_id).trim();
            const snippet = normalizeText(source.snippet).trim();
            const previewQuery = normalizeText(source.preview_query).trim();
            const seriesName = normalizeText(source.series_name).trim();
            const audioSeriesId = normalizeText(source.audio_series_id).trim();
            const audioEpisodeNum = normalizePositiveNumber(source.audio_episode_num);
            const score = Number.isFinite(Number(source.score)) ? Number(source.score) : null;
            const refIndex = normalizePositiveNumber(source.ref_index);
            const citationId = normalizeCitationId(source.citation_id || source.citationId || source.id || (refIndex ? `S${refIndex}` : ''));

            if (!title && !docId && !snippet) return null;

            return {
                title,
                doc_id: docId,
                score,
                category: normalizeText(source.category).trim(),
                series_name: seriesName,
                audio_series_id: audioSeriesId,
                audio_episode_num: audioEpisodeNum,
                snippet,
                preview_query: previewQuery,
                ref_index: refIndex,
                citation_id: citationId,
            };
        })
        .filter(Boolean)
        .slice(0, 3);
}

function normalizeCitations(citations) {
    if (!Array.isArray(citations)) return [];

    return citations
        .map((citation) => {
            if (!citation || typeof citation !== 'object') return null;

            const title = normalizeText(citation.title).trim();
            const docId = normalizeText(citation.docId || citation.doc_id).trim();
            const quote = normalizeText(citation.quote || citation.snippet).trim();
            const seriesName = normalizeText(citation.seriesName || citation.series_name).trim();
            const audioSeriesId = normalizeText(citation.audioSeriesId || citation.audio_series_id).trim();
            const audioEpisodeNum = normalizePositiveNumber(citation.audioEpisodeNum ?? citation.audio_episode_num);
            const score = Number.isFinite(Number(citation.score)) ? Number(citation.score) : null;
            const refIndex = normalizePositiveNumber(citation.refIndex ?? citation.ref_index);
            const citationId = normalizeCitationId(citation.id || citation.citation_id || (refIndex ? `S${refIndex}` : ''));

            if (!title && !docId && !quote) return null;

            return {
                id: citationId,
                refIndex,
                docId,
                title,
                seriesName,
                quote,
                score,
                category: normalizeText(citation.category).trim(),
                audioSeriesId,
                audioEpisodeNum,
            };
        })
        .filter(Boolean)
        .slice(0, 3);
}

function normalizeClaimMap(claimMap) {
    if (!Array.isArray(claimMap)) return [];

    return claimMap
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const claim = normalizeText(entry.claim).trim();
            const citationIds = normalizeCitationIdList(
                entry.citationIds || entry.citation_ids || entry.citations || entry.sources,
                6,
            );
            if (!claim || !citationIds.length) return null;
            return { claim, citationIds };
        })
        .filter(Boolean)
        .slice(0, 6);
}

function normalizeUncertainty(uncertainty) {
    if (!uncertainty || typeof uncertainty !== 'object' || Array.isArray(uncertainty)) return null;

    const normalized = {};
    const level = normalizeText(uncertainty.level).trim();
    if (level) normalized.level = level;

    const message = normalizeText(uncertainty.message).trim();
    if (message) normalized.message = message;

    const retrievalConfidence = normalizeConfidence(uncertainty.retrievalConfidence);
    if (retrievalConfidence !== null) normalized.retrievalConfidence = retrievalConfidence;

    const citationCount = Number.isFinite(Number(uncertainty.citationCount)) ? Number(uncertainty.citationCount) : null;
    if (citationCount !== null) normalized.citationCount = citationCount;

    const claimCount = Number.isFinite(Number(uncertainty.claimCount)) ? Number(uncertainty.claimCount) : null;
    if (claimCount !== null) normalized.claimCount = claimCount;

    const reason = normalizeText(uncertainty.reason).trim();
    if (reason) normalized.reason = reason;

    return Object.keys(normalized).length ? normalized : null;
}

function normalizeAssistantMode(message) {
    const explicitMode = normalizeText(message?.mode).trim();
    if (ASSISTANT_MESSAGE_MODES.has(explicitMode)) return explicitMode;
    if (Array.isArray(message?.searchResults) && message.searchResults.length) return 'search_only';
    return 'answer';
}

export function createAiConversationStore(options = {}) {
    const {
        storageKey,
        legacyKey,
        maxPersist,
        maxConversations,
    } = options;

    function normalizeMessage(message) {
        const role = message?.role === 'assistant'
            ? 'assistant'
            : message?.role === 'user'
                ? 'user'
                : null;
        if (!role) return null;

        const normalized = {
            role,
            content: normalizeText(message?.content),
        };

        if (role === 'user') return normalized;

        normalized.mode = normalizeAssistantMode(message);
        normalized.sources = normalizeSources(message?.sources);

        const citations = normalizeCitations(message?.citations);
        if (citations.length) normalized.citations = citations;

        const claimMap = normalizeClaimMap(message?.claimMap);
        if (claimMap.length) normalized.claimMap = claimMap;

        const confidence = normalizeConfidence(message?.confidence);
        if (confidence !== null) normalized.confidence = confidence;

        const uncertainty = normalizeUncertainty(message?.uncertainty);
        if (uncertainty) normalized.uncertainty = uncertainty;

        const downgradeReason = normalizeText(message?.downgradeReason).trim();
        if (downgradeReason) normalized.downgradeReason = downgradeReason;

        const contractVersion = normalizeText(message?.contractVersion).trim();
        if (contractVersion) normalized.contractVersion = contractVersion;

        const promptVersion = normalizePlainObject(message?.promptVersion, ['contract', 'router', 'evidence', 'answer', 'style']);
        if (promptVersion) normalized.promptVersion = promptVersion;

        const modelInfo = normalizePlainObject(message?.modelInfo, ['provider', 'model', 'used', 'stage', 'via']);
        if (modelInfo) normalized.modelInfo = modelInfo;

        const disclaimer = normalizeText(message?.disclaimer).trim();
        if (disclaimer) normalized.disclaimer = disclaimer;

        const followUps = normalizeStringList(message?.followUps);
        if (followUps.length) normalized.followUps = followUps;

        const rewriteSuggestions = normalizeStringList(message?.rewriteSuggestions);
        if (rewriteSuggestions.length) normalized.rewriteSuggestions = rewriteSuggestions;

        if (Array.isArray(message?.searchResults) && message.searchResults.length) {
            normalized.searchResults = message.searchResults;
        }
        if (Array.isArray(message?.audioResults) && message.audioResults.length) {
            normalized.audioResults = message.audioResults;
        }

        return normalized;
    }

    function normalizeConversation(conversation) {
        const normalized = createConversation();
        const messages = Array.isArray(conversation?.messages)
            ? conversation.messages.map(normalizeMessage).filter(Boolean)
            : [];

        normalized.id = normalizeText(conversation?.id).trim() || normalized.id;
        normalized.title = normalizeText(conversation?.title).trim();
        normalized.messages = messages.slice(-maxPersist);
        normalized.updatedAt = Number.isFinite(Number(conversation?.updatedAt))
            ? Number(conversation.updatedAt)
            : Date.now();

        return normalized;
    }

    function createConversation() {
        return {
            id: generateId(),
            title: '',
            messages: [],
            updatedAt: Date.now(),
        };
    }

    function loadConversations() {
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return arr
                        .slice(0, maxConversations)
                        .map(normalizeConversation)
                        .filter(Boolean);
                }
            }
        } catch {
            // ignore broken local data
        }

        try {
            const old = localStorage.getItem(legacyKey);
            if (old) {
                const msgs = JSON.parse(old);
                if (Array.isArray(msgs) && msgs.length) {
                    const first = msgs.find(item => item.role === 'user');
                    const conv = createConversation();
                    conv.title = first ? first.content.slice(0, 20) : '旧对话';
                    conv.messages = msgs.slice(-maxPersist).map(normalizeMessage).filter(Boolean);
                    localStorage.removeItem(legacyKey);
                    return [conv];
                }
            }
        } catch {
            // ignore broken legacy data
        }

        return [];
    }

    function saveConversations(conversations) {
        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify(
                    conversations
                        .slice(0, maxConversations)
                        .map(normalizeConversation)
                )
            );
        } catch {
            // quota exceeded
        }
    }

    function trimMessages(messages) {
        if (messages.length > maxPersist) {
            messages.splice(0, messages.length - maxPersist);
        }
    }

    return {
        createConversation,
        loadConversations,
        saveConversations,
        trimMessages,
        normalizeMessage,
        normalizeConversation,
    };
}