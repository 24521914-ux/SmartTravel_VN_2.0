import { useEffect } from 'react';

/** Progressive enhancement: content stays visible if observation/animation fails. */
export function CinematicMotion() {
  useEffect(() => {
    const root = document.querySelector('.travel-landing');
    if (!root) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const running = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (preference.matches) return;
        const animation = entry.target.animate([
          { opacity: .25, transform: 'translateY(28px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)' });
        running.add(animation);
        void animation.finished.then(() => running.delete(animation)).catch(() => {});
      });
    }, { threshold: .12 });
    const observe = () => root.querySelectorAll('.journey-section-heading, .journey-story, .place-card, .journey-plan, .journey-collections, .cinematic-showcase, .cinematic-finale').forEach(el => { if (!seen.has(el)) { seen.add(el); observer.observe(el); } });
    observe();
    const mutations = new MutationObserver(observe);
    mutations.observe(root, { childList: true, subtree: true });
    const stop = () => { if (preference.matches) running.forEach(a => a.cancel()); };
    preference.addEventListener('change', stop);
    return () => { observer.disconnect(); mutations.disconnect(); running.forEach(a => a.cancel()); preference.removeEventListener('change', stop); };
  }, []);
  return null;
}
