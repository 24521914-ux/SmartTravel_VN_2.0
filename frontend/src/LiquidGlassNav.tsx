import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type FocusEvent } from 'react';

export interface TabItem {
  id: string;
  label: string;
  href: string;
  isExternal?: boolean;
}

const TABS: TabItem[] = [
  { id: 'destinations', label: 'Khám phá', href: '#destinations' },
  { id: 'journeys', label: 'Lịch trình', href: '#journeys' },
  { id: 'stories', label: 'Câu chuyện', href: '#stories' },
  { id: 'app', label: 'Ứng dụng', href: '/app', isExternal: true },
];

interface IndicatorRect {
  left: number;
  top: number;
  width: number;
  height: number;
  ready: boolean;
}

export function LiquidGlassNav({
  isMenuOpen = false,
  onCloseMenu,
}: {
  isMenuOpen?: boolean;
  onCloseMenu?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('destinations');
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [movementPhase, setMovementPhase] = useState<'none' | 'right' | 'left'>('none');
  const [indicatorRect, setIndicatorRect] = useState<IndicatorRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    ready: false,
  });

  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const prevTargetRef = useRef<string>('destinations');
  const movementTimerRef = useRef<number | null>(null);

  const currentTargetId = hoveredTab ?? activeTab;

  // Sync active tab with URL hash on load & hashchange
  useEffect(() => {
    function syncHash() {
      const hash = window.location.hash.replace(/^#/, '');
      if (hash && TABS.some(t => t.id === hash)) {
        setActiveTab(hash);
      } else if (window.location.pathname.startsWith('/app')) {
        setActiveTab('app');
      }
    }
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  // Scroll spy to dynamically update active tab when user scrolls into sections
  useEffect(() => {
    if (window.location.pathname.startsWith('/app')) return;

    const sectionIds = ['destinations', 'journeys', 'stories'];
    const sections = sectionIds
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        // Find visible section with highest intersection ratio
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible.length > 0 && visible[0].target.id) {
          setActiveTab(visible[0].target.id);
        }
      },
      {
        root: null,
        rootMargin: '-20% 0px -40% 0px',
        threshold: [0.1, 0.3, 0.6],
      }
    );

    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Compute position of the indicator relative to nav container
  const updateIndicator = () => {
    const navEl = navRef.current;
    const tabEl = tabRefs.current[currentTargetId];
    if (!navEl || !tabEl) return;

    const navRect = navEl.getBoundingClientRect();
    const tabRect = tabEl.getBoundingClientRect();

    setIndicatorRect({
      left: tabRect.left - navRect.left,
      top: tabRect.top - navRect.top,
      width: tabRect.width,
      height: tabRect.height,
      ready: true,
    });
  };

  useLayoutEffect(() => {
    updateIndicator();
  }, [currentTargetId, isMenuOpen]);

  // Recalculate on window resize or DOM layout changes
  useEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    const resizeObserver = new ResizeObserver(() => {
      updateIndicator();
    });

    resizeObserver.observe(navEl);
    Object.values(tabRefs.current).forEach(el => {
      if (el) resizeObserver.observe(el);
    });

    window.addEventListener('resize', updateIndicator);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [currentTargetId]);

  // Detect stretch direction (moving right vs moving left) for 4-phase animation
  useEffect(() => {
    const prevId = prevTargetRef.current;
    if (prevId && prevId !== currentTargetId && indicatorRect.ready) {
      const prevIndex = TABS.findIndex(t => t.id === prevId);
      const nextIndex = TABS.findIndex(t => t.id === currentTargetId);

      if (nextIndex > prevIndex) {
        setMovementPhase('right');
      } else if (nextIndex < prevIndex) {
        setMovementPhase('left');
      }

      if (movementTimerRef.current) {
        window.clearTimeout(movementTimerRef.current);
      }
      movementTimerRef.current = window.setTimeout(() => {
        setMovementPhase('none');
      }, 520);
    }
    prevTargetRef.current = currentTargetId;
  }, [currentTargetId, indicatorRect.ready]);

  const handleTabClick = (e: MouseEvent<HTMLAnchorElement>, tab: TabItem) => {
    setActiveTab(tab.id);
    onCloseMenu?.();

    if (!tab.isExternal && tab.href.startsWith('#')) {
      const targetElement = document.getElementById(tab.id);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
        history.pushState(null, '', tab.href);
      }
    }
  };

  const handleMouseEnter = (tabId: string) => {
    setHoveredTab(tabId);
  };

  const handleMouseLeave = () => {
    setHoveredTab(null);
  };

  const handleFocus = (tabId: string) => {
    setHoveredTab(tabId);
  };

  const handleBlur = (e: FocusEvent<HTMLElement>) => {
    // If focus leaves the nav entirely, reset preview
    if (!navRef.current?.contains(e.relatedTarget as Node)) {
      setHoveredTab(null);
    }
  };

  const isHoverPreview = hoveredTab !== null && hoveredTab !== activeTab;

  return (
    <nav
      ref={navRef}
      className={`liquid-glass-nav ${isMenuOpen ? 'open' : ''}`}
      aria-label="Điều hướng chính"
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
    >
      {/* 
        Single continuous Liquid Glass Indicator
        Elastic 4-phase physics: Stretch -> Slide -> Compress -> Settle
      */}
      <div
        className={`liquid-glass-indicator ${
          movementPhase !== 'none' ? `is-moving-${movementPhase}` : ''
        } ${isHoverPreview ? 'is-hover-preview' : 'is-active-tab'}`}
        style={{
          transform: `translate3d(${indicatorRect.left}px, ${indicatorRect.top}px, 0)`,
          width: `${indicatorRect.width}px`,
          height: `${indicatorRect.height}px`,
          opacity: indicatorRect.ready ? 1 : 0,
        }}
        aria-hidden="true"
      >
        <div className="liquid-glass-body">
          {/* Specular highlight reflecting along top curved edge */}
          <div className="liquid-glass-specular" />
          {/* Refraction edge border with dynamic prismatic shimmer */}
          <div className="liquid-glass-refraction" />
          {/* Light sheen beam sweep across surface */}
          <div className="liquid-glass-sheen" />
          {/* Ambient warm peach inner glow matching SmartTravel VN */}
          <div className="liquid-glass-glow" />
        </div>
      </div>

      {/* Navigation Tab Links (Crisp text above the liquid glass indicator) */}
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        const isHovered = hoveredTab === tab.id;

        return (
          <a
            key={tab.id}
            ref={el => {
              tabRefs.current[tab.id] = el;
            }}
            href={tab.href}
            className={`liquid-nav-link ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={e => handleTabClick(e, tab)}
            onMouseEnter={() => handleMouseEnter(tab.id)}
            onFocus={() => handleFocus(tab.id)}
          >
            <span className="liquid-nav-label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
