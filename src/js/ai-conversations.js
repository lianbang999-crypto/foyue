function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const ASSISTANT_MESSAGE_MODES = new Set(['answer', 'search_only', 'no_result']);

function normalizeText(value) {
    return typeof value === 'string' ? value : String(value || '');
}

function normalizeConfidence(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(1, Math.round(numeric * 100) / 100));
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
            const audioEpisodeNum = Number.isFinite(Number(source.audio_episode_num))
                ? Number(source.audio_episode_num)
                : null;
            const score = Number.isFinite(Number(source.score)) ? Number(source.score) : null;
            const refIndex = Number.isFinite(Number(source.ref_index)) ? Number(source.ref_index) : null;

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
            };
        })
        .filter(Boolean)
        .slice(0, 3);
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

        const confidence = normalizeConfidence(message?.confidence);
        if (confidence !== null) normalized.confidence = confidence;

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