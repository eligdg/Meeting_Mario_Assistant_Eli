import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useGoogleDrive } from "@/hooks/useGoogleDrive";
import { RefreshCw, Check, Loader2, Save, HardDrive, FolderPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function SettingsPage() {
  const { connected: calConnected, loading: calLoading, syncing, connect: calConnect, disconnect: calDisconnect, sync } = useGoogleCalendar();
  const drive = useGoogleDrive();
  const { toast } = useToast();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
        else setDisplayName(user.user_metadata?.full_name || user.email?.split("@")[0] || "");
      });
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Perfil actualizado" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSync = async () => {
    try {
      const result = await sync();
      toast({
        title: "Sincronización completada",
        description: `${result?.synced || 0} eventos importados, ${result?.pushed || 0} enviados a Google`,
      });
    } catch {
      toast({ title: "Error al sincronizar", variant: "destructive" });
    }
  };

  const handleCreateDriveFolder = async () => {
    setCreatingFolder(true);
    try {
      const folder = await drive.createFolder("Meeting Mario Assistant");
      await drive.updateSettings({
        drive_folder_id: folder.id,
        drive_folder_name: folder.name,
      });
      toast({ title: "Carpeta creada en Google Drive", description: folder.name });
    } catch {
      toast({ title: "Error al crear carpeta", variant: "destructive" });
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleToggleDriveSetting = async (key: string, value: boolean) => {
    try {
      await drive.updateSettings({ [key]: value });
    } catch {
      toast({ title: "Error al guardar configuración", variant: "destructive" });
    }
  };

  return (
    <AppLayout title="Ajustes">
      <div className="max-w-2xl space-y-6 animate-fade-in">
        {/* Profile */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Perfil</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nombre</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="bg-background" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Email</label>
              <Input value={user?.email || ""} className="bg-background" readOnly />
            </div>
            <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar perfil
            </Button>
          </div>
        </div>

        {/* Integrations */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Integraciones</h2>
          <div className="space-y-4">
            {/* Google Calendar */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Google Calendar</p>
                <p className="text-xs text-muted-foreground">Sincroniza reuniones y eventos sugeridos</p>
              </div>
              <div className="flex items-center gap-2">
                {calConnected && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                    {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span className="ml-1">Sincronizar</span>
                  </Button>
                )}
                {calConnected ? (
                  <Button variant="outline" size="sm" onClick={calDisconnect} disabled={calLoading}>
                    <Check className="h-3 w-3 mr-1 text-success" />Conectado
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={calConnect} disabled={calLoading}>
                    {calLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Conectar
                  </Button>
                )}
              </div>
            </div>

            {/* Google Drive */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Google Drive</p>
                    <p className="text-xs text-muted-foreground">Almacena grabaciones y resúmenes en tu nube</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {drive.connected ? (
                    <Button variant="outline" size="sm" onClick={drive.disconnect} disabled={drive.loading}>
                      <Check className="h-3 w-3 mr-1 text-success" />Conectado
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={drive.connect} disabled={drive.loading}>
                      {drive.loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Conectar
                    </Button>
                  )}
                </div>
              </div>

              {/* Drive settings when connected */}
              {drive.connected && (
                <div className="border-t border-border p-3 space-y-3 bg-secondary/20">
                  {/* Folder */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Carpeta de destino</p>
                      <p className="text-xs text-muted-foreground">
                        {drive.settings?.drive_folder_name || "No configurada"}
                      </p>
                    </div>
                    {!drive.settings?.drive_folder_id && (
                      <Button variant="outline" size="sm" onClick={handleCreateDriveFolder} disabled={creatingFolder} className="gap-1">
                        {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderPlus className="h-3 w-3" />}
                        Crear carpeta
                      </Button>
                    )}
                  </div>

                  {/* Auto export recordings */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Exportar grabaciones automáticamente</p>
                      <p className="text-xs text-muted-foreground">Sube las grabaciones a Drive al guardar</p>
                    </div>
                    <Switch
                      checked={drive.settings?.auto_export_recordings || false}
                      onCheckedChange={(v) => handleToggleDriveSetting("auto_export_recordings", v)}
                    />
                  </div>

                  {/* Auto export summaries */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Exportar resúmenes automáticamente</p>
                      <p className="text-xs text-muted-foreground">Guarda los resúmenes como documentos en Drive</p>
                    </div>
                    <Switch
                      checked={drive.settings?.auto_export_summaries || false}
                      onCheckedChange={(v) => handleToggleDriveSetting("auto_export_summaries", v)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Notificaciones</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Reunión completada</p>
                <p className="text-xs text-muted-foreground">Aviso cuando el análisis IA termine</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Nuevas tareas</p>
                <p className="text-xs text-muted-foreground">Cuando se extraigan tareas de una reunión</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Riesgos detectados</p>
                <p className="text-xs text-muted-foreground">Alertas de riesgos identificados por IA</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        {/* AI Settings */}
        <div className="glass-card rounded-xl p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Configuración IA</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Idioma de transcripción</label>
              <Input defaultValue="Español (automático)" className="bg-background" readOnly />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Análisis automático</p>
                <p className="text-xs text-muted-foreground">Ejecutar análisis IA al terminar grabación</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
