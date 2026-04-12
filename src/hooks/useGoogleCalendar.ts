import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useGoogleCalendar() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setConnected(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "status" },
      });

      setConnected(!error && data?.connected === true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Check URL for callback result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_calendar") === "connected") {
      setConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { redirect_uri: window.location.origin },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Connect error:", err);
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "disconnect" },
      });
      setConnected(false);
    } catch (err) {
      console.error("Disconnect error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action: "sync" },
      });
      if (error) throw error;
      await checkStatus();
      return data;
    } catch (err) {
      console.error("Sync error:", err);
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [checkStatus]);

  return { connected, loading, syncing, connect, disconnect, sync, checkStatus };
}
