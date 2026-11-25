import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface TypeRevealTextProps {
  text: string;
  speedMs?: number;
  startDelayMs?: number;
  caretColor?: 'coral' | 'sky';
  className?: string;
}

/**
 * Progressively reveals text character-by-character once scrolled into view,
 * using an invisible sizer span so layout height stays fixed (zero CLS).
 */
export function TypeRevealText({
  text,
  speedMs = 22,
  startDelayMs = 120,
  caretColor = 'coral',
  className = '',
}: TypeRevealTextProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(() => prefersReducedMotion());
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setStarted(true);
      setCount(text.length);
      return;
    }

    setCount(0);
    setStarted(false);

    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    if (!started) return;

    let intervalId = 0;
    const delayTimer = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setCount(prev => {
          if (prev + 1 >= text.length) {
            window.clearInterval(intervalId);
            return text.length;
          }
          return prev + 1;
        });
      }, speedMs);
    }, startDelayMs);

    return () => {
      window.clearTimeout(delayTimer);
      window.clearInterval(intervalId);
    };
  }, [started, text, speedMs, startDelayMs]);

  const done = count >= text.length;

  return (
    <span ref={wrapRef} className={`ev-type-wrap ${className}`.trim()}>
      <span className="ev-sr-only">{text}</span>
      <span className="ev-type-sizer" aria-hidden="true">
        {text}
      </span>
      <span className="ev-type-live" aria-hidden="true">
        {text.slice(0, count)}
        {!done && <span className={`ev-type-caret is-${caretColor}`} />}
      </span>
    </span>
  );
}

export interface TypeCycleTextProps {
  phrases: string[];
  typeMs?: number;
  deleteMs?: number;
  pauseMs?: number;
  className?: string;
}

/**
 * Cycles through editorial highlights with smooth forward typing and backspacing.
 */
export function TypeCycleText({
  phrases,
  typeMs = 46,
  deleteMs = 24,
  pauseMs = 2100,
  className = '',
}: TypeCycleTextProps) {
  const phrasesKey = phrases.join('\u0000');
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charCount, setCharCount] = useState(() => (prefersReducedMotion() ? (phrases[0]?.length ?? 0) : 1));
  const [phase, setPhase] = useState<'typing' | 'pause' | 'deleting'>('typing');

  useEffect(() => {
    setPhraseIdx(0);
    setCharCount(prefersReducedMotion() ? (phrases[0]?.length ?? 0) : 1);
    setPhase('typing');
  }, [phrasesKey]);

  useEffect(() => {
    if (!phrases.length || prefersReducedMotion()) return;
    const current = phrases[phraseIdx % phrases.length] ?? '';

    if (phase === 'typing') {
      if (charCount >= current.length) {
        const pauseTimer = window.setTimeout(() => setPhase('pause'), 60);
        return () => window.clearTimeout(pauseTimer);
      }
      const timer = window.setTimeout(() => setCharCount(c => c + 1), typeMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'pause') {
      const timer = window.setTimeout(() => setPhase('deleting'), pauseMs);
      return () => window.clearTimeout(timer);
    }

    if (charCount <= 0) {
      setPhraseIdx(idx => (idx + 1) % phrases.length);
      setPhase('typing');
      return;
    }

    const timer = window.setTimeout(() => setCharCount(c => Math.max(0, c - 1)), deleteMs);
    return () => window.clearTimeout(timer);
  }, [phrases, phrasesKey, phraseIdx, charCount, phase, typeMs, deleteMs, pauseMs]);

  const currentPhrase = phrases[phraseIdx % Math.max(1, phrases.length)] ?? '';
  const visibleText = prefersReducedMotion() ? currentPhrase : currentPhrase.slice(0, charCount);

  return (
    <span className={`ev-type-cycle ${className}`.trim()}>
      <span>{visibleText}</span>
      {!prefersReducedMotion() && <span className="ev-type-caret is-coral" aria-hidden="true" />}
    </span>
  );
}
