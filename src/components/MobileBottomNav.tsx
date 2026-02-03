import React from 'react';

export type MobileTabKey = 'map' | 'list' | 'management' | 'messages' | 'profile';

export interface MobileBottomNavProps {
  activeTab: MobileTabKey;
  onSelectTab: (tab: MobileTabKey) => void;
  showMessagesTab: boolean;
  unreadMessagesCount?: number;
}

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  badge?: number;
}> = ({ label, active, onClick, icon, badge }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-all ' +
        (active
          ? 'text-blue-700 bg-blue-50 shadow-sm'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
      }
      aria-current={active ? 'page' : undefined}
    >
      <span
        className={
          'relative inline-flex h-6 w-6 items-center justify-center transition-transform ' +
          (active ? 'scale-[1.05]' : 'scale-100')
        }
      >
        {icon}
        {typeof badge === 'number' && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className={active ? '' : 'opacity-90'}>{label}</span>
    </button>
  );
};

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  showMessagesTab,
  unreadMessagesCount,
}) => {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[1200]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-3xl px-3">
        <div className="mb-3 rounded-3xl border border-gray-200 bg-white/90 backdrop-blur shadow-lg">
          <div className="grid grid-cols-5 gap-1 p-2">
            <TabButton
              label="Harita"
              active={activeTab === 'map'}
              onClick={() => onSelectTab('map')}
              icon={
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
                  <path d="M9 3v15" />
                  <path d="M15 6v15" />
                </svg>
              }
            />
            <TabButton
              label="Liste"
              active={activeTab === 'list'}
              onClick={() => onSelectTab('list')}
              icon={
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              }
            />
            <TabButton
              label="Yönetim"
              active={activeTab === 'management'}
              onClick={() => onSelectTab('management')}
              icon={
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.2l5-.7L12 2Z" />
                  <path d="M6 22h12" />
                </svg>
              }
            />
            {showMessagesTab ? (
              <TabButton
                label="Mesaj"
                active={activeTab === 'messages'}
                onClick={() => onSelectTab('messages')}
                badge={unreadMessagesCount}
                icon={
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
                  </svg>
                }
              />
            ) : (
              <div />
            )}
            <TabButton
              label="Hesap"
              active={activeTab === 'profile'}
              onClick={() => onSelectTab('profile')}
              icon={
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
