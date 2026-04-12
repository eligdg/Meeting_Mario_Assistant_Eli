import { useState } from "react";
import { Bell, FileAudio, CheckCircle2, AlertTriangle, Calendar } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mockNotifications, Notification } from "@/data/mockData";
import { cn } from "@/lib/utils";

const typeIcons: Record<Notification["type"], typeof Bell> = {
  meeting: FileAudio,
  task: CheckCircle2,
  event: Calendar,
  risk: AlertTriangle,
};

const typeColors: Record<Notification["type"], string> = {
  meeting: "text-primary",
  task: "text-success",
  event: "text-info",
  risk: "text-warning",
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState(mockNotifications);
  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Marcar todas como leídas
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.map((n) => {
            const Icon = typeIcons[n.type];
            return (
              <div
                key={n.id}
                className={cn(
                  "flex gap-3 p-3 border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer",
                  !n.read && "bg-primary/5"
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", typeColors[n.type])} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", !n.read ? "font-semibold text-foreground" : "text-foreground")}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.description}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{n.time}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
