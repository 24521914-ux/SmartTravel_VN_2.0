import { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Icon } from './Icon';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
}

export const DEFAULT_TABS: TabItem[] = [
  { id: 'Khám phá', label: 'Khám phá', icon: 'compass' },
  { id: 'Bản đồ', label: 'Bản đồ', icon: 'map' },
  { id: 'Bộ sưu tập', label: 'Bộ sưu tập', icon: 'layers' },
  { id: 'Chuyến đi', label: 'Chuyến đi', icon: 'route' },
  { id: 'Thông báo', label: 'Thông báo', icon: 'bell' },
  { id: 'Tài khoản', label: 'Tài khoản', icon: 'user' },
  { id: 'Doanh nghiệp', label: 'Doanh nghiệp', icon: 'building' },
  { id: 'Kiểm duyệt', label: 'Kiểm duyệt', icon: 'shield' },
  { id: 'Quản trị', label: 'Quản trị', icon: 'database' }
];

export interface LiquidGlassNavProps {
  tabs?: TabItem[];
  activeTab?: string;
  onSelectTab?: (id: string) => void;
  isMenuOpen?: boolean;
  onCloseMenu?: () => void;
}

export function LiquidGlassNav({
  tabs = DEFAULT_TABS,
  activeTab = 'Khám phá',
  onSelectTab,
  isMenuOpen = false,
  onCloseMenu
}: LiquidGlassNavProps) {
  const [more, setMore] = useState(false);
  const root = useRef<HTMLElement>(null);
  const primaryContainerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);

  const primary = tabs.filter(t => ['Khám phá', 'Bản đồ', 'Bộ sưu tập', 'Chuyến đi'].includes(t.id));
  const secondary = tabs.filter(t => !primary.some(p => p.id === t.id));

  // Shared active indicator animation on primary tabs
  useLayoutEffect(() => {
    if (!primaryContainerRef.current) return;
    const activeBtn = primaryContainerRef.current.querySelector<HTMLButtonElement>(`[data-tab-id="${activeTab}"]`);
    if (activeBtn) {
      const containerRect = primaryContainerRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicatorStyle({
        left: btnRect.left - containerRect.left,
        width: btnRect.width
      });
    } else {
      setIndicatorStyle(null);
    }
  }, [activeTab]);

  useEffect(() => {
    const container = primaryContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const active = [...container.querySelectorAll<HTMLButtonElement>('[data-tab-id]')].find(b => b.dataset.tabId === activeTab);
      setIndicatorStyle(active ? { left: active.offsetLeft, width: active.offsetWidth } : null);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeTab]);

  useEffect(() => {
    function handleClickOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) {
        setMore(false);
        if (!(event.target as Element).closest('.mobile-menu-btn')) onCloseMenu?.();
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [onCloseMenu]);

  function handleTabClick(id: string) {
    onSelectTab?.(id);
    setMore(false);
    onCloseMenu?.();
  }

  function renderTabButton(tab: TabItem) {
    const isActive = tab.id === activeTab;
    return (
      <button
        type="button"
        key={tab.id}
        data-tab-id={tab.id}
        aria-current={isActive ? 'page' : undefined}
        className={`liquid-nav-link ${isActive ? 'active' : ''}`}
        onClick={() => handleTabClick(tab.id)}
      >
        {tab.icon && <Icon name={tab.icon} size={16} />}
        <span>{tab.label}</span>
      </button>
    );
  }

  return (
    <nav
      id="app-navigation"
      ref={root}
      className={`liquid-nav ${isMenuOpen ? 'open' : ''}`}
      aria-label="Điều hướng ứng dụng"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setMore(false);
          onCloseMenu?.();
          (isMenuOpen
            ? root.current?.closest('header')?.querySelector<HTMLButtonElement>('.mobile-menu-btn')
            : root.current?.querySelector<HTMLButtonElement>('.more-toggle')
          )?.focus();
        }
      }}
    >
      <div ref={primaryContainerRef} className="liquid-nav-primary">
        {indicatorStyle && (
          <div
            className="liquid-nav-indicator"
            style={{
              width: `${indicatorStyle.width}px`,
              transform: `translateX(${indicatorStyle.left}px)`,
              transformOrigin: 'left center'
            }}
            aria-hidden="true"
          />
        )}
        {primary.map(renderTabButton)}
      </div>

      {secondary.length > 0 && (
        <div className="nav-more">
          <button
            type="button"
            className={`liquid-nav-link more-toggle ${secondary.some(t => t.id === activeTab) ? 'active' : ''}`}
            aria-expanded={more || isMenuOpen}
            aria-controls="additional-navigation"
            onClick={() => setMore(!more)}
          >
            <span>{secondary.find(t => t.id === activeTab)?.label ?? 'Thêm'}</span>
            <Icon name="chevronDown" size={14} />
          </button>
          <div
            id="additional-navigation"
            className="nav-dropdown"
            hidden={!more && !isMenuOpen}
          >
            {secondary.map(renderTabButton)}
          </div>
        </div>
      )}
    </nav>
  );
}
