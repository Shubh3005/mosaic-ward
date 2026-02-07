"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, Grid } from '@react-three/drei';
import {
  ArrowLeft, Heart, Wind, Brain, History, Clock,
  AlertTriangle, CheckCircle2, FileText, ChevronDown, ChevronUp,
  LayoutGrid, List, RefreshCw, Activity
} from 'lucide-react';
import { API, WS } from '@/lib/api';

// --- TYPES ---
type Landmark = { x: number; y: number; z: number; visibility: number };
type PatientData = {
  room_id: string;
  status: "NORMAL" | "RESTING" | "FALL" | "ACKNOWLEDGED";
  landmarks: Landmark[];
  name?: string;
};

type LogEntry = {
  time: string;
  message: string;
  type: "info" | "alert" | "ai";
};

type Incident = {
  id: number;
  room_id: string;
  patient_name: string;
  incident_type: string;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  ai_report: string | null;
  severity: string;
};

type IncidentStats = {
  total: number;
  active: number;
  resolved: number;
};

// --- CONFIG ---
const ROOM_INFO: Record<string, { name: string; condition: string; age: number }> = {
  "301-A": { name: "James R.", condition: "Cardiac Monitoring", age: 64 },
  "302-B": { name: "Elena K.", condition: "Bed Rest / Recovery", age: 42 },
  "303-C": { name: "Robert M.", condition: "High Fall Risk", age: 78 },
  "304-A": { name: "Shubham G.", condition: "Live Feed (You)", age: 20 },
};

// --- HIGH-PRECISION SKELETON (Medical Look) ---
const Skeleton = ({ landmarks, color, scale = 2 }: { landmarks: Landmark[]; color: string; scale?: number }) => {
  if (!landmarks || landmarks.length === 0) return null;

  // Center the skeleton: (0.5, 0.5) moves to (0,0)
  // Adjusted Y-offset (-0.1) to center it better vertically in the box
  const getVec = (i: number) => [
    (landmarks[i].x - 0.5) * -scale,
    -(landmarks[i].y - 0.5) * scale - 0.1,
    -landmarks[i].z * scale
  ];

  const connections = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Upper Body
    [11, 23], [12, 24], [23, 24], // Torso
    [23, 25], [25, 27], [24, 26], [26, 28] // Legs
  ];

  return (
    <group position={[0, 0, 0]}>
      {/* Joints: Much smaller (0.015) for sleek look */}
      {landmarks.map((lm, i) => lm.visibility > 0.5 && (
        <mesh key={i} position={getVec(i) as any}>
          <sphereGeometry args={[0.015 * scale]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      ))}
      {/* Bones: Thinner lines (1.5) */}
      {connections.map(([s, e], i) => {
        if (!landmarks[s] || !landmarks[e]) return null;
        return <Line key={i} points={[getVec(s) as any, getVec(e) as any]} color={color} lineWidth={1.5 * scale} transparent opacity={0.6} />;
      })}
    </group>
  );
};

// --- VITALS MONITOR ---
const VitalsMonitor = ({ status }: { status: string }) => {
  const [hr, setHr] = useState(72);
  const [spo2, setSpo2] = useState(98);

  useEffect(() => {
    const interval = setInterval(() => {
      if (status === "FALL") {
        setHr(prev => Math.min(140, prev + Math.floor(Math.random() * 5)));
      } else if (status === "RESTING") {
        setHr(60 + Math.floor(Math.random() * 5));
      } else {
        setHr(70 + Math.floor(Math.random() * 10));
      }
      setSpo2(95 + Math.floor(Math.random() * 4));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
        <div className="flex items-center gap-2 text-rose-500 mb-2">
          <Heart className="animate-pulse" size={20} /> <span className="text-xs font-bold">HEART RATE</span>
        </div>
        <div className="text-4xl font-mono font-black text-white">{hr} <span className="text-sm text-slate-500">BPM</span></div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500/20">
          <div className="h-full bg-rose-500 animate-pulse" style={{ width: `${(hr / 140) * 100}%` }}></div>
        </div>
      </div>
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
        <div className="flex items-center gap-2 text-cyan-500 mb-2">
          <Wind size={20} /> <span className="text-xs font-bold">SpO2</span>
        </div>
        <div className="text-4xl font-mono font-black text-white">{spo2}%</div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500/20">
          <div className="h-full bg-cyan-500" style={{ width: `${spo2}%` }}></div>
        </div>
      </div>
    </div>
  );
};

// --- EVENT LOG ---
const EventLog = ({ logs }: { logs: LogEntry[] }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  return (
    <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 overflow-hidden flex flex-col">
      <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-2">
        <History size={14} /> LIVE INCIDENT LOG
      </h4>
      <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
        {logs.length === 0 && <div className="text-slate-600 italic">System initialized. Monitoring...</div>}
        {logs.map((log, i) => (
          <div key={i} className={`p-2 rounded border-l-2 ${log.type === 'alert' ? 'border-red-500 bg-red-900/10' : log.type === 'ai' ? 'border-purple-500 bg-purple-900/10' : 'border-slate-500 bg-slate-900'}`}>
            <span className="text-slate-500 mr-2">[{log.time}]</span>
            <span className={log.type === 'alert' ? 'text-red-400 font-bold' : log.type === 'ai' ? 'text-purple-300' : 'text-slate-300'}>
              {log.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

// --- INCIDENT CARD ---
const IncidentCard = ({ incident, onResolve }: { incident: Incident; onResolve: (id: number) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const getStatusBadge = () => {
    switch (incident.status) {
      case "ACTIVE": return <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded animate-pulse flex items-center gap-1"><AlertTriangle size={12} /> ACTIVE</span>;
      case "ACKNOWLEDGED": return <span className="px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded flex items-center gap-1"><Clock size={12} /> ACKNOWLEDGED</span>;
      case "RESOLVED": return <span className="px-2 py-1 bg-emerald-600 text-white text-xs font-bold rounded flex items-center gap-1"><CheckCircle2 size={12} /> RESOLVED</span>;
    }
  };

  return (
    <div className={`relative border-l-4 ${incident.status === "ACTIVE" ? "border-red-500" : incident.status === "ACKNOWLEDGED" ? "border-orange-500" : "border-emerald-500"} bg-slate-900/80 rounded-r-xl p-4 mb-4 transition-all hover:bg-slate-900`}>
      <div className={`absolute -left-2 top-5 w-4 h-4 rounded-full ${incident.status === "ACTIVE" ? "bg-red-500 animate-pulse" : incident.status === "ACKNOWLEDGED" ? "bg-orange-500" : "bg-emerald-500"} border-2 border-slate-950`}></div>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-bold text-white">Room {incident.room_id}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{incident.patient_name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={12} /> {formatDate(incident.detected_at)}
            {incident.severity === "HIGH" && <span className="px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded text-[10px] font-bold">HIGH SEVERITY</span>}
          </div>
        </div>
        {getStatusBadge()}
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500 my-3">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><span>Detected</span></div>
        {incident.acknowledged_at && <><div className="flex-1 h-px bg-slate-700"></div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div><span>Acknowledged {formatDate(incident.acknowledged_at)}</span></div></>}
        {incident.resolved_at && <><div className="flex-1 h-px bg-slate-700"></div><div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span>Resolved {formatDate(incident.resolved_at)}</span></div></>}
      </div>
      {incident.ai_report ? (
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-purple-400 text-xs font-bold hover:text-purple-300 transition">
          <FileText size={14} /> AI Clinical Report {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      ) : incident.status !== "RESOLVED" ? (
        <div className="flex items-center gap-2 text-purple-400/60 text-xs font-bold">
          <Brain size={14} className="animate-pulse" /> <span className="animate-pulse">AI Nurse analyzing fall...</span>
        </div>
      ) : null}
      {expanded && incident.ai_report && (
        <div className="mt-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
          <pre className="text-xs text-purple-200/80 whitespace-pre-wrap font-mono leading-relaxed">{incident.ai_report}</pre>
        </div>
      )}
      {incident.status !== "RESOLVED" && (
        <div className="mt-4 flex gap-2">
          <button onClick={() => onResolve(incident.id)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded transition">Mark Resolved</button>
        </div>
      )}
    </div>
  );
};

// --- INCIDENT HISTORY VIEW ---
const IncidentHistory = ({ onBack }: { onBack: () => void }) => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<IncidentStats>({ total: 0, active: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "RESOLVED">("ALL");

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API.incidents);
      const data = await res.json();
      setIncidents(data.incidents || []);
      setStats(data.stats || { total: 0, active: 0, resolved: 0 });
    } catch (err) { console.error('Failed to fetch incidents:', err); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIncidents(); const interval = setInterval(fetchIncidents, 5000); return () => clearInterval(interval); }, [fetchIncidents]);

  const handleResolve = async (id: number) => {
    await fetch(API.incidentResolve(id), { method: 'POST' });
    fetchIncidents();
  };

  const filteredIncidents = incidents.filter(inc => {
    if (filter === "ALL") return true;
    if (filter === "ACTIVE") return inc.status === "ACTIVE" || inc.status === "ACKNOWLEDGED";
    return inc.status === "RESOLVED";
  });

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 flex flex-col p-4 overflow-hidden">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition"><ArrowLeft /></button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-3"><History className="text-purple-400" /> Incident History</h1>
          <p className="text-slate-400 text-sm">Complete record of all fall events for compliance and care tracking</p>
        </div>
        <button onClick={fetchIncidents} className="p-2 hover:bg-slate-800 rounded-full transition"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800"><div className="text-3xl font-black text-white">{stats.total}</div><div className="text-xs text-slate-500 font-bold">TOTAL INCIDENTS</div></div>
        <div className="bg-red-900/20 p-4 rounded-xl border border-red-500/30"><div className="text-3xl font-black text-red-400">{stats.active}</div><div className="text-xs text-red-400/70 font-bold">ACTIVE</div></div>
        <div className="bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30"><div className="text-3xl font-black text-emerald-400">{stats.resolved}</div><div className="text-xs text-emerald-400/70 font-bold">RESOLVED</div></div>
      </div>
      <div className="flex gap-2 mb-6">
        {(["ALL", "ACTIVE", "RESOLVED"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${filter === f ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{f}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto pl-4">
        {loading && incidents.length === 0 ? <div className="flex items-center justify-center h-full text-slate-500">Loading...</div> :
          filteredIncidents.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-slate-500"><CheckCircle2 size={48} className="mb-4 opacity-50" /><div>No incidents found</div></div> :
            <div className="relative"><div className="absolute left-0 top-0 bottom-0 w-px bg-slate-700"></div>{filteredIncidents.map(inc => <IncidentCard key={inc.id} incident={inc} onResolve={handleResolve} />)}</div>}
      </div>
    </div>
  );
};

// --- MAIN DASHBOARD COMPONENT ---
export default function WardDashboard() {
  const [patients, setPatients] = useState<Record<string, PatientData>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"command" | "history">("command");
  const [aiGenerating, setAiGenerating] = useState<Record<string, boolean>>({});

  const addLog = useCallback((msg: string, type: "info" | "alert" | "ai") => {
    setLogs(prev => [...prev.slice(-20), { time: new Date().toLocaleTimeString(), message: msg, type }]);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS.skeleton);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'incident_report') {
        addLog(`AI NURSE: ${data.text}`, 'ai');
        setAiGenerating(prev => ({ ...prev, [data.room_id]: false }));
      } else if (data.room_id || data.landmarks) {
        const id = data.room_id || "304-A";
        setPatients(prev => {
          const oldStatus = prev[id]?.status;
          if (oldStatus !== data.status && data.status === "FALL") {
            addLog(`FALL DETECTED IN ROOM ${id}`, 'alert');
            setAiGenerating(g => ({ ...g, [id]: true }));
          }
          return { ...prev, [id]: { ...data, room_id: id } };
        });
      }
    };
    return () => ws.close();
  }, [addLog]);

  const handleAcknowledge = async (id: string) => {
    await fetch(API.acknowledge(id), { method: 'POST' });
    addLog(`Nurse acknowledged alert for Room ${id}`, 'info');
    fetch(API.analyzeFall, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: id })
    });
  };

  // --- RENDER INCIDENT HISTORY ---
  if (activeTab === "history") {
    return <IncidentHistory onBack={() => setActiveTab("command")} />;
  }

  // --- RENDER DETAIL VIEW ---
  if (selectedId) {
    const data = patients[selectedId];
    const info = ROOM_INFO[selectedId];
    const status = data?.status || "NORMAL";

    return (
      <div className="w-full h-screen bg-slate-950 text-slate-100 flex flex-col p-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-slate-800 rounded-full transition"><ArrowLeft /></button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">ROOM {selectedId} <span className="text-slate-600">|</span> {info?.name}</h1>
            <p className="text-slate-400 text-sm">Age: {info?.age} • Condition: {info?.condition}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <button className="px-4 py-2 bg-slate-800 rounded text-sm hover:bg-slate-700">Call Doctor</button>
            <button className="px-4 py-2 bg-slate-800 rounded text-sm hover:bg-slate-700">Medical History</button>
          </div>
        </div>

        {/* Content Split */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
          <div className="lg:col-span-2 bg-slate-900/50 rounded-3xl border border-slate-800 relative overflow-hidden">
            <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
              <ambientLight intensity={0.5} /><pointLight position={[10, 10, 10]} />
              <Grid position={[0, -1, 0]} infiniteGrid fadeDistance={20} sectionColor="#1e293b" cellColor="#0f172a" />
              {data?.landmarks && <Skeleton landmarks={data.landmarks} color={status === "FALL" ? "#ef4444" : status === "RESTING" ? "#10b981" : "#22d3ee"} scale={2.5} />}
            </Canvas>
            <div className="absolute top-6 left-6">
              <div className={`text-4xl font-black tracking-tighter ${status === "FALL" ? "text-red-500 animate-pulse" : status === "ACKNOWLEDGED" ? "text-orange-400" : status === "RESTING" ? "text-emerald-400" : "text-cyan-400"}`}>{status.replace("_", " ")}</div>
              {status === "FALL" && <div className="text-red-400 font-mono mt-1">GEOFENCE BREACH DETECTED</div>}
            </div>
            {status === "FALL" && (
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
                <button onClick={() => handleAcknowledge(selectedId)} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xl py-4 px-12 rounded-full shadow-[0_0_40px_rgba(220,38,38,0.6)] animate-bounce">ACKNOWLEDGE EMERGENCY</button>
              </div>
            )}
          </div>
          <div className="flex flex-col h-full">
            <VitalsMonitor status={status} />
            <div className={`bg-purple-900/10 border p-4 rounded-xl mb-4 transition-all ${selectedId && aiGenerating[selectedId] ? "border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "border-purple-500/30"}`}>
              <div className="flex items-center gap-2 text-purple-400 mb-2 font-bold text-sm">
                <Brain size={16} className={selectedId && aiGenerating[selectedId] ? "animate-pulse" : ""} /> MOSAIC AI ANALYSIS
                {selectedId && aiGenerating[selectedId] && <span className="ml-auto text-[10px] text-purple-400/70 font-mono animate-pulse">GENERATING...</span>}
              </div>
              {selectedId && aiGenerating[selectedId] ? (
                <div className="min-h-[60px] flex flex-col gap-2">
                  <div className="h-2 bg-purple-500/20 rounded animate-pulse w-full"></div>
                  <div className="h-2 bg-purple-500/20 rounded animate-pulse w-4/5"></div>
                  <div className="h-2 bg-purple-500/20 rounded animate-pulse w-3/5"></div>
                  <p className="text-[10px] text-purple-400/50 font-mono mt-1">AI Nurse analyzing fall mechanics...</p>
                </div>
              ) : (
                <p className="text-xs text-purple-200/80 leading-relaxed min-h-[60px]">{logs.filter(l => l.type === 'ai').slice(-1)[0]?.message || "Waiting for incident trigger..."}</p>
              )}
            </div>
            <EventLog logs={logs} />
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER GRID VIEW (Command Center) ---
  return (
    <div className="w-full h-screen bg-slate-950 p-4 font-sans text-slate-100 overflow-hidden flex flex-col relative">
      <div className="flex justify-between items-center mb-6 px-2">
        <div className="flex items-center gap-4">
          <div className="grid grid-cols-2 gap-1 rotate-45">
            <div className="w-3 h-3 bg-cyan-500 rounded-sm"></div>
            <div className="w-3 h-3 bg-blue-600 rounded-sm opacity-50"></div>
            <div className="w-3 h-3 bg-purple-600 rounded-sm opacity-30"></div>
            <div className="w-3 h-3 bg-indigo-500 rounded-sm"></div>
          </div>
          <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-500">
            MOSAIC<span className="text-slate-500 font-light">WARD</span> COMMAND
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setActiveTab("command")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition bg-cyan-600 text-white"><LayoutGrid size={16} /> Command Center</button>
          <button onClick={() => setActiveTab("history")} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition bg-slate-800 text-slate-400 hover:bg-slate-700"><List size={16} /> Incident History</button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4">
        {['301-A', '302-B', '303-C', '304-A'].map(id => {
          const d = patients[id];
          const info = ROOM_INFO[id];
          const isCritical = d?.status === "FALL";
          return (
            <div
              key={id}
              onClick={() => setSelectedId(id)}
              className={`relative border-2 transition-all duration-500 rounded-xl cursor-pointer overflow-hidden group
                ${isCritical
                  ? 'border-red-500 bg-red-950/20 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                  : d?.status === "RESTING" ? 'border-emerald-800 bg-emerald-950/20'
                    : 'border-slate-800 bg-slate-900/40 hover:border-cyan-500'}`}
            >
              <div className="absolute top-4 left-4 z-10 pointer-events-none">
                <h3 className="font-bold text-lg">{id}</h3>
                <p className="text-xs text-slate-400">{info?.name}</p>
              </div>
              <div className="absolute top-4 right-4 z-10 pointer-events-none">
                <span className={`px-2 py-1 rounded text-xs font-bold ${d?.status === "FALL" ? "bg-red-600 text-white" : d?.status === "RESTING" ? "bg-emerald-900 text-emerald-400" : "bg-cyan-900 text-cyan-400"}`}>{d?.status || "SEARCHING..."}</span>
              </div>
              <div className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity">
                {d?.landmarks ? (
                  <Canvas camera={{ position: [0, 0, 2], fov: 60 }}>
                    <Skeleton landmarks={d.landmarks} color={isCritical ? "#ef4444" : "#22d3ee"} scale={2.5} />
                  </Canvas>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600 animate-pulse">
                    <Activity size={32} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GOD MODE DIRECTOR PANEL */}
      <div className="fixed bottom-6 right-6 flex gap-2 opacity-10 hover:opacity-100 transition-opacity z-50">
        <button onClick={() => fetch(API.directorFall('303-C'), { method: 'POST' })} className="bg-red-900/40 border border-red-500/50 text-[10px] px-3 py-1 rounded text-red-400 font-mono hover:bg-red-900">[DEMO: TRIGGER FALL 303]</button>
        <button onClick={() => fetch(API.resetRoom('303-C'), { method: 'POST' })} className="bg-slate-800 border border-slate-700 text-[10px] px-3 py-1 rounded text-slate-400 font-mono hover:bg-slate-700">[DEMO: RESET]</button>
      </div>
    </div>
  );
}