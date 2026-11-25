import { useEffect } from 'react';

/** Progressive enhancement: content stays visible if observation/animation fails. */
export function CinematicMotion() {
  useEffect(() => {
    const root = document.querySelector('.travel-landing');
    if (!root) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const running = new Set<Animation>();

    root.classList.add('ev-motion-ready');

    const revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    );

    const cardObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          cardObserver.unobserve(entry.target);
          if (preference.matches) return;
          const animation = entry.target.animate(
            [
              { opacity: 0.25, transform: 'translateY(28px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)' },
          );
          running.add(animation);
          void animation.finished.then(() => running.delete(animation)).catch(() => {});
        });
      },
      { threshold: 0.12 },
    );

    const observe = () => {
      root.querySelectorAll('[data-ev-reveal]').forEach(el => {
        if (!seen.has(el)) {
          seen.add(el);
          if (preference.matches) {
            el.classList.add('is-revealed');
          } else {
            revealObserver.observe(el);
          }
        }
      });

      root
        .querySelectorAll(
          '.journey-section-heading, .journey-story, .place-card, .journey-plan, .journey-collections, .cinematic-showcase, .cinematic-finale',
        )
        .forEach(el => {
          if (!seen.has(el)) {
            seen.add(el);
            cardObserver.observe(el);
          }
        });
    };

    observe();
    const mutations = new MutationObserver(observe);
    mutations.observe(root, { childList: true, subtree: true });

    const stop = () => {
      if (preference.matches) {
        running.forEach(a => a.cancel());
        root.querySelectorAll('[data-ev-reveal]').forEach(el => el.classList.add('is-revealed'));
      }
    };
    preference.addEventListener('change', stop);

    return () => {
      root.classList.remove('ev-motion-ready');
      revealObserver.disconnect();
      cardObserver.disconnect();
      mutations.disconnect();
      running.forEach(a => a.cancel());
      preference.removeEventListener('change', stop);
    };
  }, []);

  return null;
}
