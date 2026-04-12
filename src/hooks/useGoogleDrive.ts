import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webContentLink?: string;
  iconLink?: string;
}

interface DriveSettings {
  auto_export_recordings: boolean;
  auto_export_summaries: boolean;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
}

export function useGoogleDrive() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<DriveSettings | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setConnected(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("google-drive-sync", {
        body: { action: "status" },
      });

      setConnected(!error && data?.connected === true);

      if (!error && data?.connected) {
        const { data: settingsData } = await supabase.functions.invoke("google-drive-sync", {
          body: { action: "get_settings" },
        });
        if (settingsData?.settings) setSettings(settingsData.settings);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_drive") === "connected") {
      setConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
      checkStatus();
    }
  }, [checkStatus]);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-auth", {
        body: { redirect_uri: window.location.origin },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error("Drive connect error:", err);
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke("google-drive-sync", {
        body: { action: "disconnect" },
      });
      setConnected(false);
      setSettings(null);
    } catch (err) {
      console.error("Drive disconnect error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const listFiles = useCallback(async (folderId?: string, audioOnly?: boolean, query?: string): Promise<DriveFile[]> => {
    const { data, error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action: "list", folder_id: folderId, audio_only: audioOnly, query },
    });
    if (error) throw error;
    return data?.files || [];
  }, []);

  const downloadFile = useCallback(async (fileId: string) => {
    const { data, error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action: "download", file_id: fileId },
    });
    if (error) throw error;
    return data;
  }, []);

  const uploadFile = useCallback(async (fileName: string, mimeType: string, base64Data: string, folderId?: string) => {
    const { data, error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action: "upload", file_name: fileName, mime_type: mimeType, file_data: base64Data, folder_id: folderId },
    });
    if (error) throw error;
    return data?.file;
  }, []);

  const createFolder = useCallback(async (folderName?: string) => {
    const { data, error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action: "create_folder", folder_name: folderName },
    });
    if (error) throw error;
    return data?.folder;
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<DriveSettings>) => {
    const { error } = await supabase.functions.invoke("google-drive-sync", {
      body: { action: "update_settings", settings: newSettings },
    });
    if (error) throw error;
    setSettings((prev) => prev ? { ...prev, ...newSettings } : null);
  }, []);

  return {
    connected, loading, settings,
    connect, disconnect, checkStatus,
    listFiles, downloadFile, uploadFile, createFolder, updateSettings,
  };
}
