function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function createAiConversationStore(options = {}) {
    const {
        storageKey,
        legacyKey,
        maxPersist,
        maxConversations,
    } = options;

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
                if (Array.isArray(arr)) return arr.slice(0, maxConversations);
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
                    conv.messages = msgs.slice(-maxPersist);
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
            localStorage.setItem(storageKey, JSON.stringify(conversations.slice(0, maxConversations)));
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
    };
}