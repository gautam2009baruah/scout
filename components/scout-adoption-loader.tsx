"use client";

import { useEffect } from "react";

const SCOUT_PLAYER_VERSION = "20260701-tooltip-rect-guard";

declare global {
  interface Window {
    ScoutAdoptionPlayer?: {
      smartRuntime?: boolean;
      version?: string;
      init(config: { scoutBaseUrl?: string; targetAppId: string; apiKey?: string; autoShowLauncher?: boolean }): Promise<{
        version?: string;
        guides: unknown[];
        play(guideId?: string): void;
      }>;
    };
    ScoutAdoptionPlayerConfig?: {
      scoutBaseUrl: string;
      targetAppId: string;
    };
  }
}

const config = {
  scoutBaseUrl: "http://localhost:3000",
  targetAppId: "6141a508-4fea-48c0-a92f-7a7064164209"
};

export function ScoutAdoptionLoader() {
  useEffect(() => {
    window.ScoutAdoptionPlayerConfig = config;

    if (window.ScoutAdoptionPlayer?.version === SCOUT_PLAYER_VERSION) {
      void window.ScoutAdoptionPlayer.init(config);
      return;
    }

    if (document.querySelector<HTMLScriptElement>(`script[data-scout-player-version="${SCOUT_PLAYER_VERSION}"]`)) {
      return;
    }

    const script = document.createElement("script");
    script.src = `http://localhost:3000/scout-smart-adoption-player.js?v=${SCOUT_PLAYER_VERSION}`;
    script.async = true;
    script.dataset.scoutPlayerVersion = SCOUT_PLAYER_VERSION;
    document.body.appendChild(script);
  }, []);

  return null;
}
