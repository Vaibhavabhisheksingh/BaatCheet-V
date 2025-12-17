import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
  isUploading: boolean;
}

export default function VoiceRecorder({ onSend, onCancel, isUploading }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onSend(audioBlob, recordingTime);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  }, [audioBlob, recordingTime, onSend]);

  const handleCancel = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    onCancel();
  }, [isRecording, audioUrl, stopRecording, onCancel]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 p-2 bg-muted rounded-lg">
      {isRecording ? (
        <>
          <div className="flex items-center gap-2 flex-1">
            <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
            <span className="text-sm font-medium text-foreground">
              {formatTime(recordingTime)}
            </span>
            <div className="flex-1 h-1 bg-muted-foreground/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary animate-pulse" 
                style={{ width: `${Math.min((recordingTime / 60) * 100, 100)}%` }}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="amber"
            size="icon"
            onClick={stopRecording}
          >
            <Square className="w-4 h-4" />
          </Button>
        </>
      ) : audioBlob ? (
        <>
          <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-muted-foreground">
              Voice message • {formatTime(recordingTime)}
            </span>
            <audio 
              src={audioUrl || undefined} 
              controls 
              className="h-8 flex-1 max-w-[200px]"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="amber"
            size="icon"
            onClick={handleSend}
            disabled={isUploading}
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground flex-1">
            Tap to record voice message
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCancel}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="amber"
            size="icon"
            onClick={startRecording}
          >
            <Mic className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}
