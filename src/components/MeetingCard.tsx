import { Link } from "react-router-dom";
import { Clock, Users, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  participants: number;
  status: "completed" | "in-progress" | "scheduled";
  tasksCount: number;
  risksCount: number;
  tags: string[];
}

const statusConfig = {
  completed: { label: "Completada", className: "bg-success/10 text-success border-success/20" },
  "in-progress": { label: "En curso", className: "bg-warning/10 text-warning border-warning/20" },
  scheduled: { label: "Programada", className: "bg-info/10 text-info border-info/20" },
};

export function MeetingCard({ meeting }: { meeting: Meeting }) {
  const status = statusConfig[meeting.status];

  return (
    <Link
      to={`/meeting/${meeting.id}`}
      className="block glass-card glass-float rounded-xl p-5 animate-slide-up group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
            {meeting.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">{meeting.date}</p>
        </div>
        <Badge variant="outline" className={cn("ml-2 text-xs", status.className)}>
          {status.label}
        </Badge>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {meeting.duration}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {meeting.participants}
        </span>
        {meeting.tasksCount > 0 && (
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            {meeting.tasksCount}
          </span>
        )}
        {meeting.risksCount > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            {meeting.risksCount}
          </span>
        )}
      </div>

      {meeting.tags.length > 0 && (
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {meeting.tags.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
