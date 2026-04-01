export function createAiVoiceController(options = {}) {
    const {
        button,
        onToast,
        onResult,
        voiceToText,
        maxDurationMs = 30000,
        maxBytes = 5 * 1024 * 1024,
    } = options;

    let recorder = null;
    let stream = null;
    let autoStopTimer = null;

    function clearAutoStopTimer() {
        if (autoStopTimer) {
            clearTimeout(autoStopTimer);
            autoStopTimer = null;
        }
    }

    function stopStream() {
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
    }

    async function toggle() {
        if (recorder && recorder.state === 'recording') {
            recorder.stop();
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            onToast?.('当前浏览器不支持语音输入');
            return;
        }
        if (typeof MediaRecorder === 'undefined') {
            onToast?.('当前环境不支持语音录制');
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            onToast?.('请允许麦克风权限后重试');
            return;
        }

        const chunks = [];
        const canDetectMime = typeof MediaRecorder.isTypeSupported === 'function';
        const mimeType = canDetectMime && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : canDetectMime && MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : '';

        try {
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        } catch {
            stopStream();
            onToast?.('当前环境不支持语音录制');
            return;
        }

        const currentRecorder = recorder;
        currentRecorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
        };

        currentRecorder.onstop = async () => {
            clearAutoStopTimer();
            stopStream();
            button?.classList.remove('recording');

            if (!chunks.length) {
                if (recorder === currentRecorder) recorder = null;
                return;
            }

            const blob = new Blob(chunks, { type: currentRecorder.mimeType || 'audio/webm' });
            if (blob.size < 100) {
                onToast?.('录音时间过短');
                if (recorder === currentRecorder) recorder = null;
                return;
            }
            if (blob.size > maxBytes) {
                onToast?.('录音过长，请控制在30秒以内');
                if (recorder === currentRecorder) recorder = null;
                return;
            }

            button.disabled = true;
            onToast?.('正在识别语音…');

            try {
                const { text } = await voiceToText(blob);
                if (text) {
                    onResult?.(text);
                } else {
                    onToast?.('未识别到语音内容');
                }
            } catch (err) {
                onToast?.(err.message || '语音识别失败');
            } finally {
                button.disabled = false;
                if (recorder === currentRecorder) recorder = null;
            }
        };

        currentRecorder.onerror = () => {
            clearAutoStopTimer();
            stopStream();
            button?.classList.remove('recording');
            if (recorder === currentRecorder) recorder = null;
            onToast?.('录音失败');
        };

        button?.classList.add('recording');
        currentRecorder.start();

        clearAutoStopTimer();
        autoStopTimer = setTimeout(() => {
            if (currentRecorder.state === 'recording') currentRecorder.stop();
        }, maxDurationMs);
    }

    return {
        toggle,
    };
}