import React, { useEffect, useState } from "react";
import axios from "axios";
import { config } from "../config/env";
import YachtCharterForm from "./YachtCharterForm";

interface MatchedShow {
  Creator_App_Name: string;
  Event_Heading: string;
  Boat_Show_Name: string;
  Event_Start_Date: string;
  Event_End_Date: string;
  Model_Interested_In: string[];
  Country?: { display_value?: string; ID?: string } | string;
  Sunreef_Yacht_Campaign_ID?: string;
  Charter_Campaign_ID?: string;
  _raw?: any;
}

const API_BASE_URL = config.API_BASE_URL;

const SESSION_KEY_APP = "creator.selectedAppName";
const SESSION_KEY_SHOW = "creator.selectedShowData";

const styles = {
  page: { maxWidth: 860, margin: "56px auto", padding: "0 16px" },
  card: {
    background: "#ffffff",
    color: "#111111",
    border: "1px solid #e6e6e6",
    borderRadius: 24,
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    padding: 36
  } as React.CSSProperties,
  logoWrap: { display: "flex", justifyContent: "center", marginTop: -48, marginBottom: 16 },
  logo: { maxWidth: 220, height: "auto", maxHeight: 70, objectFit: "contain" as const, borderRadius: 16, boxShadow: "0 8px 16px rgba(0,0,0,0.2)", backgroundColor: "#ffffff", padding: "12px 24px" },
  title: { margin: 0, fontSize: 36, fontWeight: 800, color: "#111111", letterSpacing: 0.3, textAlign: "center" as const },
  subtitle: { marginTop: 8, color: "#666", lineHeight: 1.7, fontSize: 16, textAlign: "center" as const },
  rowLabel: { marginTop: 18, marginBottom: 8, color: "#111", fontWeight: 700 },
  row: { marginTop: 4, display: "flex", gap: 16, alignItems: "center" },
  cardsGrid: {
    marginTop: 8,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 14
  } as React.CSSProperties,
  cardOption: {
    cursor: "pointer",
    borderRadius: 14,
    border: "1px solid #e5e7eb",
    padding: 14,
    background: "#fff",
    transition: "transform .08s ease, box-shadow .12s ease",
  } as React.CSSProperties,
  cardSelected: {
    boxShadow: "0 8px 20px rgba(11,92,255,0.25)",
    transform: "translateY(-2px)",
    background: "#fff",
    color: "#111",
    borderColor: "#0b5cff"
  } as React.CSSProperties,
  cardTitle: { fontWeight: 800, marginBottom: 6 },
  cardMeta: { fontSize: 13, color: "#555" },
  select: {
    flex: 1,
    height: 54,
    padding: "14px 16px",
    borderRadius: 14,
    border: "2px solid #111",
    background: "#fff",
    color: "#111",
    outline: "none",
    fontSize: 15
  } as React.CSSProperties,
  btn: {
    height: 54,
    padding: "0 22px",
    borderRadius: 14,
    border: "2px solid #111",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed"
  },
  helper: { marginTop: 14, fontSize: 13, color: "#666", textAlign: "center" as const },
  error: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    background: "#fff4f3",
    border: "1px solid #ffdad5",
    color: "#b42318"
  },
  loading: { marginTop: 12, color: "#111" }
};

const BoatShowSelector: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shows, setShows] = useState<MatchedShow[]>([]);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(
    sessionStorage.getItem(SESSION_KEY_APP)
  );
  const [draftAppName, setDraftAppName] = useState<string>("");
  const [autoSelecting, setAutoSelecting] = useState<boolean>(false);
  // Bumping this remounts YachtCharterForm (fresh internal state) without a full page reload
  const [formKey, setFormKey] = useState(0);

  const selectedShow: MatchedShow | null = (() => {
    const raw = sessionStorage.getItem(SESSION_KEY_SHOW);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  })();

  useEffect(() => {
    if (selectedAppName) return; // already selected, skip fetch for speed
    const fetchShows = async () => {
      try {
        setLoading(true);
        setError(null);
        const client = axios.create({ 
          baseURL: API_BASE_URL, 
          headers: { 
            "Content-Type": "application/json",
            "X-API-Secret": config.API_SECRET
          } 
        });
        const res = await client.get("/creator/reports/event-configurations", { params: { _t: Date.now() } });
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        setShows(data);
      } catch (e: any) {
        setError(e?.response?.data?.error?.message || e?.message || "Failed to load shows");
      } finally {
        setLoading(false);
      }
    };
    fetchShows();
  }, [selectedAppName]);

  // Auto-select if only one show is available
  useEffect(() => {
    if (selectedAppName || loading) return;
    if (shows.length === 1) {
      const only = shows[0];
      setAutoSelecting(true);
      try {
        sessionStorage.setItem(SESSION_KEY_APP, only.Creator_App_Name);
        sessionStorage.setItem(SESSION_KEY_SHOW, JSON.stringify(only));
        setSelectedAppName(only.Creator_App_Name);
      } finally {
        setAutoSelecting(false);
      }
    }
  }, [shows, selectedAppName, loading]);

  const onSelect = (appName: string) => {
    setDraftAppName(appName);
  };

  const onNext = () => {
    if (!draftAppName) return;
    const found = shows.find(s => s.Creator_App_Name === draftAppName) || null;
    sessionStorage.setItem(SESSION_KEY_APP, draftAppName);
    sessionStorage.setItem(SESSION_KEY_SHOW, JSON.stringify(found));
    setSelectedAppName(draftAppName);
  };

  if (selectedAppName && selectedShow) {
    // Directly render the main form without a header/banner
    return (
      <YachtCharterForm
        key={formKey}
        onRefresh={() => setFormKey((k) => k + 1)}
      />
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <img
            src="https://res.cloudinary.com/vy23hatk/image/upload/v1787650219/Sunreef_Black.png"
            alt="Sunreef Yachts"
            style={styles.logo}
          />
        </div>
        <h2 style={styles.title}>Select Yacht Show</h2>
        <p style={styles.subtitle}>Choose a show to continue. Your selection will be saved for this session.</p>

        {loading && <div style={styles.loading}>Loading shows…</div>}
        {autoSelecting && <div style={styles.loading}>Preparing your show…</div>}
        {error && <div style={styles.error}>{error}</div>}

        {!loading && !autoSelecting && !error && (
          <>
            {shows.length === 0 && (
              <div style={styles.helper}>No shows available right now. Please refresh to try again.</div>
            )}
            {shows.length > 1 && (
              <>
                <div style={styles.rowLabel}>Yacht Show</div>
                <div style={styles.cardsGrid} role="list">
                  {shows.map((s) => {
                    const app = s.Creator_App_Name;
                    const selected = draftAppName === app;
                    return (
                      <div
                        key={app}
                        role="button"
                        aria-pressed={selected}
                        tabIndex={0}
                        onClick={() => onSelect(app)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(app); }}
                        style={{
                          ...styles.cardOption,
                          ...(selected ? styles.cardSelected : {}),
                        }}
                      >
                        <div style={styles.cardTitle}>{s.Boat_Show_Name || s.Event_Heading}</div>
                        {(s.Event_Start_Date || s.Event_End_Date) && (
                          <div style={styles.cardMeta}>{s.Event_Start_Date} to {s.Event_End_Date}</div>
                        )}
                        {typeof s.Country === 'object' && s.Country?.display_value && (
                          <div style={styles.cardMeta}>Country: {s.Country.display_value}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <button
                    onClick={onNext}
                    disabled={!draftAppName}
                    style={{ ...styles.btn, ...(draftAppName ? {} : styles.btnDisabled) }}
                  >
                    Next
                  </button>
                </div>
                
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BoatShowSelector;


