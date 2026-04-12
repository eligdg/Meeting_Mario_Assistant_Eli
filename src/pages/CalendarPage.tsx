import { useState, useMemo, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock, RefreshCw, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface CalEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  sync_direction: string;
  google_event_id: string | null;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const { connected, loading, syncing, connect, sync } = useGoogleCalendar();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    fetchEvents();
  }, [user, currentMonth]);

  async function fetchEvents() {
    const start = startOfMonth(subMonths(currentMonth, 1)).toISOString();
    const end = endOfMonth(addMonths(currentMonth, 1)).toISOString();

    const { data } = await supabase
      .from("calendar_events")
      .select("id, title, description, start_time, end_time, location, sync_direction, google_event_id")
      .gte("start_time", start)
      .lte("start_time", end)
      .order("start_time", { ascending: true });

    setEvents((data as CalEvent[]) || []);
    setLoadingEvents(false);
  }

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const result: Date[] = [];
    let day = start;
    while (day <= end) {
      result.push(day);
      day = addDays(day, 1);
    }
    return result;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach((e) => {
      const dateStr = e.start_time.split("T")[0];
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(e);
    });
    return map;
  }, [events]);

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const dayEvents = eventsByDate[selectedDateStr] || [];

  const handleSync = async () => {
    try {
      const result = await sync();
      toast({
        title: "Sincronización completada",
        description: `${result?.synced || 0} eventos importados`,
      });
      fetchEvents();
    } catch {
      toast({ title: "Error al sincronizar", variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Calendario">
      <div className="animate-fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <h2 className="text-lg font-bold text-foreground capitalize">
                  {format(currentMonth, "MMMM yyyy", { locale: es })}
                </h2>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day, i) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isToday = isSameDay(day, new Date());
                  const isSelected = isSameDay(day, selectedDate);
                  const dayEvts = eventsByDate[dateStr] || [];

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "relative min-h-[72px] sm:min-h-[80px] p-1.5 rounded-lg text-left transition-all border",
                        !isCurrentMonth && "text-muted-foreground/30 border-transparent",
                        isCurrentMonth && !isSelected && "border-transparent hover:bg-secondary/50",
                        isToday && !isSelected && "border-primary/30 bg-primary/5",
                        isSelected && "border-primary bg-primary/10"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isToday && "text-primary font-bold",
                          isSelected && "text-primary font-bold"
                        )}
                      >
                        {format(day, "d")}
                      </span>

                      {isCurrentMonth && dayEvts.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {dayEvts.slice(0, 2).map((e, j) => (
                            <div
                              key={j}
                              className={cn(
                                "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                                e.sync_direction === "from_google"
                                  ? "bg-info/10 text-info"
                                  : "bg-primary/10 text-primary"
                              )}
                            >
                              {format(new Date(e.start_time), "HH:mm")} {e.title.substring(0, 10)}
                            </div>
                          ))}
                          {dayEvts.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">+{dayEvts.length - 2} más</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Daily agenda */}
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-5">
              <h3 className="text-base font-semibold text-foreground mb-1">
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
              </h3>
              <p className="text-xs text-muted-foreground mb-4 capitalize">
                {format(selectedDate, "yyyy")}
              </p>

              {loadingEvents ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : dayEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No hay eventos este día
                </p>
              ) : (
                <div className="space-y-3">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className="block p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{e.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(e.start_time), "HH:mm")} - {format(new Date(e.end_time), "HH:mm")}
                          </div>
                          {e.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>
                          )}
                          {e.location && (
                            <p className="text-xs text-muted-foreground mt-0.5">📍 {e.location}</p>
                          )}
                        </div>
                        <Badge variant="outline" className={cn("text-[10px] ml-2",
                          e.sync_direction === "from_google" ? "bg-info/10 text-info border-info/20" : "bg-primary/10 text-primary border-primary/20"
                        )}>
                          {e.sync_direction === "from_google" ? "Google" : "IA"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Google Calendar sync */}
            <div className="glass-card rounded-xl p-4 text-center">
              {connected ? (
                <div className="space-y-2">
                  <p className="text-sm text-success font-medium">✓ Google Calendar conectado</p>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {syncing ? "Sincronizando..." : "Sincronizar ahora"}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-2">Sincroniza con tu agenda</p>
                  <button
                    onClick={connect}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Conectar Google Calendar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
