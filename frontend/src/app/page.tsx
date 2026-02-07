"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { SkeletonFrame, SystemStatus } from "./components/DigitalTwin";

/* ═══════════════════════════════════════════════════════
   Dynamic import — Three.js must NOT be server-rendered
   ═══════════════════════════════════════════════════════ */

const DigitalTwin = dynamic(() => import("./components/DigitalTwin"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <span className="text-cyan-400/50 font-mono text-sm animate-pulse">
        Initializing 3D Engine…
      </span>
    </div>
  ),
});

/* ═══════════════════════════════════════════════════════
   Terminal simulation data
   ═══════════════════════════════════════════════════════ */

const NORMAL_LOGS = [
  "[SYSTEM] Processing Frame…",
  "[AI] Gait Analysis: Stable",
  "[WEBSOCKET] Latency: 12ms",
  "[POSE] 33 Landmarks Detected",
  "[AI] Confidence: 98.2%",
  "[SYSTEM] Buffer: Nominal",
  "[HIPAA] Data Stream: Coordinates Only ✓",
  "[AI] Stride Length: Normal Range",
  "[SYSTEM] Memory: 124 MB",
  "[POSE] Tracking Quality: HIGH",
  "[WEBSOCKET] Heartbeat OK",
  "[AI] Fall Risk Assessment: LOW",
  "[SYSTEM] Frame Rate: 30 FPS",
  "[HIPAA] No PII in transmission ✓",
  "[AI] Posture Score: 94/100",
  "[SYSTEM] GPU Utilization: 34%",
  "[POSE] Visibility Avg: 0.92",
  "[AI] Gait Symmetry: 97%",
];

const FALL_LOGS = [
  "[🚨 ALERT] FALL DETECTED — Confidence: 97.3%",
  "[SYSTEM] ⚠ Emergency Protocol ACTIVATED",
  "[TWILIO] Dispatching Call to Dr. Ramirez…",
  "[AI] Reclassifying Posture: HORIZONTAL",
  "[SYSTEM] Recording Incident #1847",
  "[AI] Impact Velocity: 1.2 m/s",
  "[SYSTEM] Notifying Nurse Station…",
  "[HIPAA] Incident logged — no video stored ✓",
];

/* ═══════════════════════════════════════════════════════
   Shared Glass Panel wrapper
   ═══════════════════════════════════════════════════════ */

function GlassPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        rounded-2xl border border-slate-700/50
        bg-slate-900/60 backdrop-blur-xl
        shadow-[0_0_40px_-12px_rgba(0,229,255,0.08)]
        p-5 overflow-hidden
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Patient Profile Card (Top-Left)
   ═══════════════════════════════════════════════════════ */

function PatientProfile({ status }: { status: SystemStatus }) {
  return (
    <GlassPanel className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-lg font-bold text-cyan-400 shrink-0">
          MV
        </div>
        <div className="min-w-0">
          <h2 className="text-white font-semibold text-lg leading-tight truncate">
            Martha V.
          </h2>
          <span className="text-slate-400 text-xs font-mono">
            Patient ID: 304-A
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 text-sm">
        <Row label="Ward" value="Orthopedic — Rm 304" />
        <Row
          label="Condition"
          value="Post-op Hip Replacement"
          valueClass="text-amber-400"
        />
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Risk Level</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/25 tracking-wide">
            HIGH RISK
          </span>
        </div>
        <Row label="Attending" value="Dr. Ramirez" />
        <Row label="Admitted" value="Feb 2, 2026" />
      </div>

      {/* Footer */}
      <div
        className={`mt-auto pt-3 border-t border-slate-700/40 text-xs font-mono flex items-center gap-2 ${
          status === "FALL" ? "text-red-400" : "text-emerald-400"
        }`}
      >
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status === "FALL"
              ? "bg-red-400 animate-pulse"
              : "bg-emerald-400"
          }`}
        />
        {status === "FALL" ? "ALERT ACTIVE" : "MONITORING ACTIVE"}
      </div>
    </GlassPanel>
  );
}

function Row({
  label,
  value,
  valueClass = "text-slate-200",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`font-medium truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Vital Signs HUD (Bottom-Left)
   ═══════════════════════════════════════════════════════ */

function VitalSigns({ status }: { status: SystemStatus }) {
  const isFall = status === "FALL";
  const waveColor = isFall ? "#ef4444" : "#00e5ff";
  const spo2Color = isFall ? "#ef4444" : "#22d3ee";

  return (
    <GlassPanel className="flex flex-col gap-3">
      <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
        Vital Signs
      </h3>

      {/* Heart Rate */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white tabular-nums leading-none">
            80{" "}
            <span className="text-sm font-normal text-slate-500">bpm</span>
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
            Heart Rate
          </div>
        </div>
        <ECGWaveform color={waveColor} />
      </div>

      <div className="h-px bg-slate-700/40" />

      {/* SpO2 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-white tabular-nums leading-none">
            98
            <span className="text-sm font-normal text-slate-500">%</span>
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
            SpO₂
          </div>
        </div>
        <SineWaveform color={spo2Color} />
      </div>

      <div className="h-px bg-slate-700/40" />

      {/* Blood Pressure */}
      <div>
        <div className="text-2xl font-bold text-white tabular-nums leading-none">
          120/80{" "}
          <span className="text-sm font-normal text-slate-500">mmHg</span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
          Blood Pressure
        </div>
      </div>

      <div className="h-px bg-slate-700/40" />

      {/* Temp */}
      <div>
        <div className="text-2xl font-bold text-white tabular-nums leading-none">
          98.6
          <span className="text-sm font-normal text-slate-500">°F</span>
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">
          Temperature
        </div>
      </div>
    </GlassPanel>
  );
}

/** Animated ECG waveform using requestAnimationFrame + direct SVG mutation */
function ECGWaveform({ color }: { color: string }) {
  const polyRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    // Simplified ECG QRS pattern
    const pattern = [
      0, 0, 0, 0, 0, -1, 6, -2.5, 0.5, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0,
    ];
    const buffer = new Array(60).fill(0);
    let idx = 0;
    let lastTick = 0;
    let handle: number;

    const tick = (t: number) => {
      if (t - lastTick > 55) {
        buffer.shift();
        buffer.push(pattern[idx % pattern.length]);
        idx++;
        lastTick = t;
        polyRef.current?.setAttribute(
          "points",
          buffer.map((y, x) => `${x * 2.5},${25 - y * 3}`).join(" ")
        );
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <svg
      viewBox="0 0 150 50"
      className="w-28 h-10 shrink-0"
      preserveAspectRatio="none"
    >
      <polyline
        ref={polyRef}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Smooth sine-like waveform for SpO2 */
function SineWaveform({ color }: { color: string }) {
  const polyRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    const buffer = new Array(60).fill(0);
    let phase = 0;
    let lastTick = 0;
    let handle: number;

    const tick = (t: number) => {
      if (t - lastTick > 55) {
        buffer.shift();
        buffer.push(Math.sin(phase) * 3 + Math.sin(phase * 0.3));
        phase += 0.35;
        lastTick = t;
        polyRef.current?.setAttribute(
          "points",
          buffer.map((y, x) => `${x * 2.5},${25 - y * 3}`).join(" ")
        );
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <svg
      viewBox="0 0 150 50"
      className="w-28 h-10 shrink-0"
      preserveAspectRatio="none"
    >
      <polyline
        ref={polyRef}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Confidence Gauge (Top-Right)
   ═══════════════════════════════════════════════════════ */

function ConfidenceGauge({ status }: { status: SystemStatus }) {
  const isFall = status === "FALL";
  const confidence = isFall ? 97 : 98;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (confidence / 100) * circumference;
  const accentColor = isFall ? "#ef4444" : "#00e5ff";

  return (
    <GlassPanel className="flex flex-col items-center justify-center gap-4">
      <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] self-start">
        AI Confidence
      </h3>

      {/* Circular gauge */}
      <div className="relative w-36 h-36">
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 120 120"
        >
          {/* Track */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="6"
          />
          {/* Progress arc */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
            style={{
              filter: `drop-shadow(0 0 8px ${accentColor})`,
            }}
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {isFall ? (
            <span className="text-red-500 font-bold text-sm text-center animate-pulse leading-tight">
              CRITICAL
              <br />
              ALERT
            </span>
          ) : (
            <>
              <span className="text-3xl font-bold text-white tabular-nums">
                {confidence}%
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                Stable
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status label */}
      <div
        className={`text-xs font-mono text-center ${
          isFall ? "text-red-400 animate-pulse" : "text-cyan-400/60"
        }`}
      >
        {isFall
          ? "⚠ FALL DETECTED — ALERTING STAFF"
          : "All systems nominal"}
      </div>
    </GlassPanel>
  );
}

/* ═══════════════════════════════════════════════════════
   Widget: Live System Terminal (Bottom-Right)
   ═══════════════════════════════════════════════════════ */

function SystemTerminal({ status }: { status: SystemStatus }) {
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const addLog = () => {
      const now = new Date().toLocaleTimeString("en-US", {
        hour12: false,
      });
      const pool = status === "FALL" ? FALL_LOGS : NORMAL_LOGS;
      const msg = pool[Math.floor(Math.random() * pool.length)];
      setLogs((prev) => [...prev.slice(-60), `${now} ${msg}`]);
    };

    addLog(); // First log immediately
    const id = setInterval(addLog, 1000 + Math.random() * 800);
    return () => clearInterval(id);
  }, [status]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logs]);

  return (
    <GlassPanel className="flex flex-col gap-2">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">
          System Log
        </h3>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
        </div>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5 scrollbar-thin"
      >
        {logs.map((log, i) => (
          <div
            key={i}
            className={
              log.includes("ALERT") || log.includes("FALL")
                ? "text-red-400"
                : log.includes("[AI]")
                  ? "text-cyan-400"
                  : log.includes("[WEBSOCKET]")
                    ? "text-emerald-400"
                    : log.includes("[HIPAA]")
                      ? "text-violet-400"
                      : "text-slate-500"
            }
          >
            {log}
          </div>
        ))}
        {/* Blinking cursor */}
        <span className="inline-block w-1.5 h-3.5 bg-cyan-400/70 animate-pulse" />
      </div>
    </GlassPanel>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Page — "Command Center" Bento Layout
   ═══════════════════════════════════════════════════════ */

export default function Home() {
  const [status, setStatus] = useState<SystemStatus>("NORMAL");

  const handleStatusChange = useCallback(
    (s: SystemStatus) => setStatus(s),
    []
  );

  // Fallback: also poll REST status endpoint
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:8000/api/status");
        const data = await res.json();
        if (data.status === "FALL" || data.status === "NORMAL") {
          setStatus(data.status);
        }
      } catch {
        // Backend offline — ignore
      }
    }, 2000);
    return () => clearInterval(poll);
  }, []);

  const resetSystem = async () => {
    try {
      await fetch("http://localhost:8000/api/reset", { method: "POST" });
      setStatus("NORMAL");
    } catch {
      // offline
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-950 text-white overflow-hidden flex flex-col">
      {/* ═══ Header Bar ═══ */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/70 bg-slate-950/80 backdrop-blur-sm shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[11px] font-black tracking-tight">
            MW
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase">
              Mosaic Ward
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wide">
              HIPAA-Compliant Patient Monitoring · Digital Twin
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {status === "FALL" && (
            <button
              onClick={resetSystem}
              className="px-4 py-1.5 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-colors cursor-pointer"
            >
              RESET SYSTEM
            </button>
          )}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono ${
              status === "FALL"
                ? "bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status === "FALL" ? "bg-red-500" : "bg-emerald-400"
              }`}
            />
            {status === "FALL" ? "FALL DETECTED" : "ALL CLEAR"}
          </div>
        </div>
      </header>

      {/* ═══ Bento Grid ═══
          Layout:
            [Patient Profile]  [  3D Digital Twin  ]  [Confidence Gauge]
            [  Vital Signs   ]  [  3D Digital Twin  ]  [System Terminal ]
      */}
      <div className="flex-1 grid grid-cols-[340px_1fr_340px] grid-rows-2 gap-3 p-3 min-h-0">
        {/* ── Top-Left: Patient Profile ── */}
        <PatientProfile status={status} />

        {/* ── Center: 3D Digital Twin (spans 2 rows) ── */}
        <div className="row-span-2 rounded-2xl border border-slate-700/50 bg-slate-900/40 overflow-hidden relative">
          <DigitalTwin onStatusChange={handleStatusChange} />

          {/* Scanline overlay for sci-fi feel */}
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,229,255,0.012)_2px,rgba(0,229,255,0.012)_4px)]" />

          {/* Corner frame decoration */}
          <div className="pointer-events-none absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/20 rounded-tl-2xl" />
          <div className="pointer-events-none absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-500/20 rounded-tr-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-500/20 rounded-bl-2xl" />
          <div className="pointer-events-none absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-500/20 rounded-br-2xl" />
        </div>

        {/* ── Top-Right: Confidence Gauge ── */}
        <ConfidenceGauge status={status} />

        {/* ── Bottom-Left: Vital Signs HUD ── */}
        <VitalSigns status={status} />

        {/* ── Bottom-Right: Live System Terminal ── */}
        <SystemTerminal status={status} />
      </div>
    </div>
  );
}
