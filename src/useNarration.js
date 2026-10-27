import { useEffect, useRef, useState } from 'react';

// Voice-to-text via the Web Speech API (Chrome/Edge/Safari). Where it is unavailable the typed note box still works.
export function useNarration(enabled, onText) {
  const recognizer = useRef(null);
  const callback = useRef(onText);
  callback.current = onText;
  const supported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !supported) return undefined;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Recognition();
    let wanted = true;
    rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
    rec.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) { const text = event.results[i][0].transcript.trim(); if (text) callback.current(text); }
      }
    };
    rec.onerror = event => { if (event.error === 'not-allowed' || event.error === 'service-not-allowed') { wanted = false; setError('Microphone access was blocked. Type notes instead.'); } };
    rec.onend = () => { if (wanted) { try { rec.start(); } catch { /* already started */ } } };
    try { rec.start(); setError(''); } catch { /* ignore */ }
    recognizer.current = rec;
    return () => { wanted = false; rec.onend = null; try { rec.stop(); } catch { /* ignore */ } };
  }, [enabled, supported]);

  return { supported, error };
}
