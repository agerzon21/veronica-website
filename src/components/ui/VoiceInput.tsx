import { Icon, IconButton, useToast, type IconButtonProps } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import FaMicrophone from '../../icons/fa/FaMicrophone';

/**
 * Press-and-hold microphone button that records audio via
 * MediaRecorder and posts the blob to /api/admin/transcribe (OpenAI
 * Whisper). Replaces the browser SpeechRecognition API which was
 * unreliable on iOS Safari, Whisper is one HTTP round-trip and
 * always works.
 *
 * Behavior:
 *   - pointerdown: request mic permission (first time) + start recording
 *   - pointerup / pointercancel: stop recording, upload, paste transcript
 *   - captured pointer so a small finger drift doesn't cancel
 *   - visible states: idle → listening (gold pulse) → uploading (spinner)
 *   - errors surface as toasts so "nothing happens" never happens again
 *
 * Callback receives the transcript string (never null), caller decides
 * how to insert it (append, replace, etc.).
 *
 * LIVE TEXT (2026-10-26). With `onLive`, the words appear while she talks,
 * from the browser's own SpeechRecognition, the way dictation works in VS
 * Code; on stop, Whisper's transcript replaces them, being the more accurate
 * of the two (Russian especially). If Whisper fails, the live words stay
 * rather than vanishing. Desktop only: on iOS, SpeechRecognition beside a
 * running MediaRecorder is what made dictation unreliable in the first place,
 * so a phone records exactly as before. On a computer a click starts and a
 * second click stops (holding still works); a phone is hold-to-talk.
 */

/** The browser's speech recognition, where it has one (Chrome, Edge, desktop Safari). */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Wires live dictation into a text field: the live words show after whatever
 * was already typed, and the final transcript replaces them. One place, so
 * every composer behaves the same.
 */
export function useDictationInto(value: string, setValue: Dispatch<SetStateAction<string>>) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const base = useRef<string | null>(null);
  const join = (a: string, b: string) => (a && b ? `${a.replace(/\s+$/, '')} ${b}` : a || b);
  const onLive = useCallback(
    (text: string) => {
      if (base.current === null) base.current = valueRef.current;
      setValue(join(base.current, text));
    },
    [setValue],
  );
  const onTranscript = useCallback(
    (text: string) => {
      const b = base.current;
      base.current = null;
      if (b === null) setValue((prev) => join(prev, text));
      else setValue(join(b, text));
    },
    [setValue],
  );
  return { onLive, onTranscript };
}

interface Props extends Omit<IconButtonProps, 'aria-label' | 'onClick' | 'icon'> {
  adminPassword: string;
  /** Hint passed to Whisper: the language the SPEAKER is speaking. */
  language?: 'ru' | 'en';
  /**
   * Language for this component's own error toasts: the language the READER
   * reads. Separate from `language` because Vero dictates in Russian while an
   * admin helping her may be reading English, and one prop cannot be both.
   * Falls back to `language` so existing callers are unchanged.
   */
  uiLang?: 'ru' | 'en';
  onTranscript: (text: string) => void;
  /** The words so far while recording (desktop). The final text still arrives through onTranscript. */
  onLive?: (text: string) => void;
  ariaLabelIdle?: string;
  ariaLabelRecording?: string;
  ariaLabelUploading?: string;
}

type MicState = 'idle' | 'recording' | 'uploading';

const VoiceInput = ({
  adminPassword,
  language,
  uiLang,
  onTranscript,
  onLive,
  ariaLabelIdle = 'Record voice',
  ariaLabelRecording = 'Release to stop',
  ariaLabelUploading = 'Transcribing…',
  ...iconButtonProps
}: Props) => {
  const toastLang = uiLang ?? language;
  const [state, setState] = useState<MicState>('idle');
  const [supported, setSupported] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  // Live text: the recognizer, the words it has settled on, and whether a stop was asked for.
  const recognitionRef = useRef<Recognition | null>(null);
  const liveFinalRef = useRef('');
  const liveTextRef = useRef('');
  const liveUsedRef = useRef(false);
  const stoppingRef = useRef(false);
  // A click on a computer toggles; a press held past this is hold-to-talk.
  const pointerTypeRef = useRef<string>('');
  const pressedAtRef = useRef(0);
  const startedThisPressRef = useRef(false);
  const toast = useToast();

  // MediaRecorder support check, bail early if the browser can't
  // record (very old iOS Safari, some in-app browsers).
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.MediaRecorder ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setSupported(false);
    }
  }, []);

  // Pick a mimeType the current browser actually supports. Safari
  // typically wants audio/mp4; Chrome/Firefox default to audio/webm.
  const pickMimeType = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return ''; // let the browser pick a default
  };

  const stopLive = useCallback(() => {
    stoppingRef.current = true;
    const r = recognitionRef.current;
    recognitionRef.current = null;
    if (r) {
      r.onresult = null;
      r.onend = null;
      try { r.stop(); } catch { /* already stopped */ }
    }
  }, []);

  /** Live words while recording, on a computer, when the caller asked for them. */
  const startLive = useCallback(() => {
    liveFinalRef.current = '';
    liveTextRef.current = '';
    liveUsedRef.current = false;
    stoppingRef.current = false;
    const Ctor = recognitionCtor();
    if (!onLive || !Ctor || isIOS()) return;
    const lang = (uiLang ?? language) === 'ru' ? 'ru-RU' : 'en-US';
    const begin = () => {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const piece = e.results[i][0].transcript;
          if (e.results[i].isFinal) liveFinalRef.current = `${liveFinalRef.current} ${piece}`.replace(/\s+/g, ' ').trim();
          else interim += piece;
        }
        const text = `${liveFinalRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
        liveTextRef.current = text;
        if (text) {
          liveUsedRef.current = true;
          onLive(text);
        }
      };
      // Chrome ends a session on a pause even when continuous; keep listening
      // for as long as the recording runs.
      r.onend = () => {
        if (!stoppingRef.current && recognitionRef.current === r) {
          try { begin(); } catch { /* give up quietly: Whisper still runs */ }
        }
      };
      r.onerror = (ev) => {
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') stoppingRef.current = true;
      };
      recognitionRef.current = r;
      try { r.start(); } catch { recognitionRef.current = null; }
    };
    begin();
  }, [onLive, uiLang, language]);

  const teardown = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      recorder.start();
      startLive();
      setState('recording');
    } catch (err) {
      teardown();
      setState('idle');
      const name = (err as { name?: string })?.name;
      // Distinct copy for the two most common failure modes so Vero
      // knows what to do instead of guessing.
      const description = name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? toastLang === 'ru'
          ? 'Разреши сайту доступ к микрофону в настройках браузера, затем попробуй снова.'
          : 'Grant microphone permission for this site in your browser settings, then try again.'
        : err instanceof Error
          ? err.message
          : String(err);
      toast({
        title: toastLang === 'ru' ? 'Микрофон недоступен' : 'Microphone unavailable',
        description,
        status: 'warning',
        duration: 4500,
      });
    }
  }, [state, toastLang, toast, teardown]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || state !== 'recording') return;
    stopLive();
    const liveText = liveTextRef.current;
    const liveUsed = liveUsedRef.current;

    // Ignore super-short taps that clearly weren't actual dictation
    // avoids uploading a 30ms blob and getting an empty transcript
    // that overwrites what Vero was already typing.
    const elapsedMs = Date.now() - startedAtRef.current;
    if (elapsedMs < 400) {
      try { recorder.stop(); } catch { /* ignore */ }
      teardown();
      setState('idle');
      return;
    }

    // Wrap the stop event in a promise so we can await the final chunk.
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        resolve(new Blob(chunksRef.current, { type }));
      };
      recorder.onerror = (e) => reject(e);
    });
    try {
      recorder.stop();
    } catch (err) {
      teardown();
      setState('idle');
      toast({
        title: toastLang === 'ru' ? 'Не удалось остановить запись' : 'Could not stop recording',
        description: err instanceof Error ? err.message : String(err),
        status: 'warning',
        duration: 3500,
      });
      return;
    }

    setState('uploading');
    try {
      const blob = await stopped;
      teardown();

      // Ship it to Whisper via the admin transcribe endpoint.
      const ext = /webm/.test(blob.type) ? 'webm' : /mp4/.test(blob.type) ? 'mp4' : /ogg/.test(blob.type) ? 'ogg' : 'wav';
      const form = new FormData();
      form.append('password', adminPassword);
      if (language) form.append('language', language);
      form.append('file', blob, `voice.${ext}`);

      const res = await fetch('/api/admin/transcribe', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // The live words are already in the box; keep them rather than lose the dictation.
        if (liveUsed) {
          onTranscript(liveText);
          setState('idle');
          return;
        }
        toast({
          title: toastLang === 'ru' ? 'Не удалось расшифровать' : 'Transcription failed',
          description: data.error || `Server error (${res.status})`,
          status: 'warning',
          duration: 4000,
        });
        setState('idle');
        return;
      }
      const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
      // With live text showing, the caller always hears back, so the live
      // words are replaced (or kept, if Whisper heard nothing).
      if (liveUsed) onTranscript(transcript || liveText);
      else if (transcript) onTranscript(transcript);
      setState('idle');
    } catch (err) {
      teardown();
      setState('idle');
      if (liveUsed) {
        onTranscript(liveText);
        return;
      }
      toast({
        title: language === 'ru' ? 'Ошибка при отправке' : 'Upload failed',
        description: err instanceof Error ? err.message : String(err),
        status: 'warning',
        duration: 4000,
      });
    }
  }, [state, adminPassword, language, onTranscript, toast, teardown, stopLive]);

  // Clean up any live media stream on unmount so the mic indicator
  // doesn't stay red after Vero navigates away mid-recording.
  useEffect(() => {
    return () => {
      stopLive();
      teardown();
    };
  }, [teardown, stopLive]);

  if (!supported) {
    return null;
  }

  const isRecording = state === 'recording';
  const isBusy = state === 'uploading';

  return (
    <IconButton
      aria-label={
        isRecording ? ariaLabelRecording : isBusy ? ariaLabelUploading : ariaLabelIdle
      }
      icon={<Icon as={FaMicrophone} boxSize={{ base: 5, md: 4 }} />}
      // Pointer capture pins the up/cancel events to this button, so
      // a small finger drift onto the SVG child doesn't fire pointerleave
      // and stop the mic prematurely. Critical on iOS Safari.
      onPointerDown={(e) => {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* Safari edge cases */
        }
        pointerTypeRef.current = e.pointerType;
        pressedAtRef.current = Date.now();
        // A second click on a computer stops a recording the first one started.
        if (state === 'recording' && e.pointerType === 'mouse') {
          startedThisPressRef.current = false;
          void stop();
          return;
        }
        startedThisPressRef.current = true;
        void start();
      }}
      onPointerUp={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        // A quick click with a mouse leaves it recording until the next click;
        // a press that was held (or any touch) stops on release, as before.
        if (e.pointerType === 'mouse' && startedThisPressRef.current && Date.now() - pressedAtRef.current < 500) return;
        if (!startedThisPressRef.current) return;
        void stop();
      }}
      onPointerCancel={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        void stop();
      }}
      isLoading={isBusy}
      bg={isRecording ? 'brand.accent' : 'white'}
      color={isRecording ? 'white' : 'brand.accentText'}
      borderColor={isRecording ? 'brand.accent' : 'gray.300'}
      _hover={{ bg: isRecording ? 'brand.accentStrong' : 'gray.50' }}
      sx={{
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
        // Gentle pulse while recording so Vero has clear feedback
        // that the mic is live.
        ...(isRecording && {
          animation: 'micPulse 1.4s ease-in-out infinite',
          '@keyframes micPulse': {
            '0%, 100%': { boxShadow: '0 0 0 0 rgba(201, 169, 110, 0.6)' },
            '50%': { boxShadow: '0 0 0 8px rgba(201, 169, 110, 0)' },
          },
        }),
      }}
      {...iconButtonProps}
    />
  );
};

export default VoiceInput;
