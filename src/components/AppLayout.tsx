import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { NotificationBell } from "./NotificationBell";

export function AppLayout({ children, title, actions }: { children: ReactNode; title?: string; actions?: ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppSidebar />
      <main className="lg:pl-[260px] transition-all duration-300">
        {/* Glass top bar */}
        <header className="sticky top-0 z-30 backdrop-blur-xl border-b px-4 lg:px-8 h-14 flex items-center justify-between"
          style={{
            background: 'hsla(0, 0%, 100%, 0.45)',
            borderColor: 'hsla(0, 0%, 100%, 0.3)',
            boxShadow: '0 1px 12px 0 hsla(220, 20%, 10%, 0.05)',
          }}
        >
          <div className="pl-10 lg:pl-0">
            {title && <h1 className="text-lg font-semibold text-foreground">{title}</h1>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <NotificationBell />
          </div>
        </header>
        <div className="p-4 lg:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
