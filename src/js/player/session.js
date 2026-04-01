/* player/session.js - playback session isolation */
'use strict';

export function createPlaybackSessionManager() {
    let currentId = 0;

    function begin() {
        currentId += 1;
        return currentId;
    }

    function current() {
        return currentId;
    }

    function isCurrent(id) {
        return id === currentId;
    }

    function guard(id, fn) {
        if (id !== currentId) return false;
        fn();
        return true;
    }

    return {
        begin,
        current,
        isCurrent,
        guard,
    };
}
