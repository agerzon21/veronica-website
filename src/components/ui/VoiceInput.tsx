import { Icon, IconButton, useToast, type IconButtonProps } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FaMicrophone } from 'react-icons/fa';

/**
 * Press-and-hold microphone button that records audio via
 * MediaRecorder and posts the blob to /api/admin/transcribe (OpenAI
 * Whisper). Replaces the browser SpeechRecognition API which was
 * unreliable on iOS Safari — Whisper is one HTTP round-trip and
 * always works.
 *
 * Behavior:
 *   - pointerdown: request mic permission (first time) + start recording
 *   - pointerup / pointercancel: stop recording, upload, paste transcript
 *   - captured pointer so a small finger drift doesn't cancel
 *   - visible states: idle → listening (gold pulse) → uploading (spinner)
 *   - errors surface as toasts so "nothing happens" never happens again
 *
 * Callback receives the transcript string (never null) — caller decides
 * how to insert it (append, replace, etc.).
 */

interface Props extends Omit<IconButtonProps, 'aria-label' | 'onClick' | 'icon'> {
  adminPassword: string;
  language?: 'ru' | 'en';
  onTranscript: (text: string) => void;
  ariaLabelIdle?: string;
  ariaLabelRecording?: string;
  ariaLabelUploading?: string;
}

type MicState = 'idle' | 'recording' | 'uploading';

const VoiceInput = ({
  adminPassword,
  language,
  onTranscript,
  ariaLabelIdle = 'Record voice',
  ariaLabelRecording = 'Release to stop',
  ariaLabelUploading = 'Transcribing…',
  ...iconButtonProps
}: Props) => {
  const [state, setState] = useState<MicState>('idle');
  const [supported, setSupported] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const toast = useToast();

  // MediaRecorder support check — bail early if the browser can't
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
      setState('recording');
    } catch (err) {
      teardown();
      setState('idle');
      const name = (err as { name?: string })?.name;
      // Distinct copy for the two most common failure modes so Vero
      // knows what to do instead of guessing.
      const description = name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? language === 'ru'
          ? 'Разреши сайту доступ к микрофону в настройках браузера, затем попробуй снова.'
          : 'Grant microphone permission for this site in your browser settings, then try again.'
        : err instanceof Error
          ? err.message
          : String(err);
      toast({
        title: language === 'ru' ? 'Микрофон недоступен' : 'Microphone unavailable',
        description,
        status: 'warning',
        duration: 4500,
      });
    }
  }, [state, language, toast, teardown]);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || state !== 'recording') return;

    // Ignore super-short taps that clearly weren't actual dictation —
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
        title: language === 'ru' ? 'Не удалось остановить запись' : 'Could not stop recording',
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
        toast({
          title: language === 'ru' ? 'Не удалось расшифровать' : 'Transcription failed',
          description: data.error || `Server error (${res.status})`,
          status: 'warning',
          duration: 4000,
        });
        setState('idle');
        return;
      }
      const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
      if (transcript) onTranscript(transcript);
      setState('idle');
    } catch (err) {
      teardown();
      setState('idle');
      toast({
        title: language === 'ru' ? 'Ошибка при отправке' : 'Upload failed',
        description: err instanceof Error ? err.message : String(err),
        status: 'warning',
        duration: 4000,
      });
    }
  }, [state, adminPassword, language, onTranscript, toast, teardown]);

  // Clean up any live media stream on unmount so the mic indicator
  // doesn't stay red after Vero navigates away mid-recording.
  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

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
        void start();
      }}
      onPointerUp={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        void stop();
      }}
      onPointerCancel={(e) => {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        void stop();
      }}
      isLoading={isBusy}
      bg={isRecording ? '#c9a96e' : 'white'}
      color={isRecording ? 'white' : '#8a6e35'}
      borderColor={isRecording ? '#c9a96e' : 'gray.300'}
      _hover={{ bg: isRecording ? '#b8964f' : 'gray.50' }}
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
