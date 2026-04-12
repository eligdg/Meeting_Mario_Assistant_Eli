import { useState, useMemo, useEffect } from "react";
import { Search, SlidersHorizontal, FileAudio, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { MeetingCard } from "@/components/MeetingCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { mockMeetings } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const statusFilters = [
  { value: "all", label: "Todas" },
  { value: "completed", label: "Completadas" },
  { value: "pending", label: "Pendientes" },
  { value: "scheduled", label: "Programadas" },
];

const allTags = [...new Set(mockMeetings.flatMap((m) => m.tags))];

interface DbMeeting {
  id: string;
  title: string;
  recording_type: string;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  mime_type: string | null;
}

export default function MeetingsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [dbMeetings, setDbMeetings] = useState<DbMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchMeetings() {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("meetings")
        .select("id, title, recording_type, duration_seconds, status, created_at, mime_type")
        .order("created_at", { ascending: false });
      setDbMeetings((data as DbMeeting[]) || []);
      setLoading(false);
    }
    fetchMeetings();
  }, [user]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const filtered = useMemo(() => {
    return mockMeetings
      .filter((m) => {
        if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== "all" && statusFilter !== "pending" && m.status !== statusFilter) return false;
        if (selectedTags.length > 0 && !selectedTags.some((t) => m.tags.includes(t))) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [search, statusFilter, selectedTags]);

  const filteredDb = useMemo(() => {
    return dbMeetings.filter((m) => {
      if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && m.status !== statusFilter && statusFilter !== "completed") return false;
      return true;
    });
  }, [dbMeetings, search, statusFilter]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <AppLayout title="Reuniones">
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por título..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card" />
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className={cn(showFilters && "border-primary text-primary")}>
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filtros
          </Button>
        </div>

        {showFilters && (
          <div className="glass-card rounded-xl p-4 space-y-3 animate-slide-up">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estado</p>
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((s) => (
                  <button key={s.value} onClick={() => setStatusFilter(s.value)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", statusFilter === s.value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <button key={tag} onClick={() => toggleTag(tag)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", selectedTags.includes(tag) ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            {(statusFilter !== "all" || selectedTags.length > 0) && (
              <button onClick={() => { setStatusFilter("all"); setSelectedTags([]); }} className="text-xs text-primary hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Real meetings from DB */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {filteredDb.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tus grabaciones ({filteredDb.length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredDb.map((m) => (
                    <Link to={`/meeting/${m.id}`} key={m.id} className="glass-card glass-float rounded-xl p-4 hover:border-primary/20 transition-colors border border-transparent">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileAudio className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{m.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(m.created_at), "dd/MM/yyyy HH:mm")} · {formatDuration(m.duration_seconds)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium",
                              m.status === "pending" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                            )}>
                              {m.status === "pending" ? "Pendiente IA" : "Analizada"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{m.recording_type === "screen" ? "Pantalla" : m.recording_type === "mic" ? "Micrófono" : "Importado"}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Mock meetings */}
            <div className="space-y-3">
              {filteredDb.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">
                  Ejemplo ({filtered.length})
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {filtered.length + filteredDb.length} reunión{(filtered.length + filteredDb.length) !== 1 ? "es" : ""}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filtered.map((m) => (
                  <MeetingCard
                    key={m.id}
                    meeting={{
                      id: m.id,
                      title: m.title,
                      date: `${m.date}, ${m.time}`,
                      duration: m.duration || "Por definir",
                      participants: m.participants.length,
                      status: m.status,
                      tasksCount: m.tasks.length,
                      risksCount: m.risks.length,
                      tags: m.tags,
                    }}
                  />
                ))}
              </div>
            </div>

            {filtered.length === 0 && filteredDb.length === 0 && (
              <div className="text-center py-16">
                <p className="text-muted-foreground">No se encontraron reuniones</p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
