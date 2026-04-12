import { useState, useMemo } from "react";
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  date: string;
  title: string;
  type?: string;
}

interface MiniCalendarProps {
  events?: CalendarEvent[];
  onDateSelect?: (date: Date) => void;
  selectedDate?: Date;
}

export function MiniCalendar({ events = [], onDateSelect, selectedDate }: MiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

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

  const hasEvent = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return events.some((e) => e.date === dateStr);
  };

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded hover:bg-secondary">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-semibold text-foreground capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </span>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded hover:bg-secondary">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const hasEvt = hasEvent(day);

          return (
            <button
              key={i}
              onClick={() => onDateSelect?.(day)}
              className={cn(
                "relative w-8 h-8 mx-auto rounded-lg text-xs font-medium transition-all",
                !isCurrentMonth && "text-muted-foreground/40",
                isCurrentMonth && !isToday && !isSelected && "text-foreground hover:bg-secondary",
                isToday && !isSelected && "bg-primary/10 text-primary font-bold",
                isSelected && "bg-primary text-primary-foreground"
              )}
            >
              {format(day, "d")}
              {hasEvt && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
