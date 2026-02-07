"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { 
    Heart, Moon, Activity, Phone, Shield, 
    CheckCircle, Bell, ChevronDown, Send, 
    Sparkles, User
} from 'lucide-react';

// --- TYPES ---
type WellnessData = {
    room_id: string;
    patient_name: string;
    date: string;
    sleep_hours: number;
    rest_periods: number;
    assisted_walks: number;
    wellness_score: number;
    wellness_status: string;
    last_updated: string | null;
    has_concerns: boolean;
};

type RoomInfo = {
    room_id: string;
    patient_name: string;
    condition: string;
};

export default function FamilyPortal() {
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string>("302-B"); // Default to Elena (Resting)
    const [wellness, setWellness] = useState<WellnessData | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [sentSuccess, setSentSuccess] = useState(false);

    // Fetch room list
    useEffect(() => {
        fetch('http://localhost:8000/api/family/rooms')
            .then(res => res.json())
            .then(data => setRooms(data.rooms || []))
            .catch(err => console.error(err));
    }, []);

    // Fetch wellness data
    const fetchWellness = useCallback(async () => {
        if (!selectedRoom) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:8000/api/family/wellness/${selectedRoom}`);
            const data = await res.json();
            setWellness(data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, [selectedRoom]);

    useEffect(() => {
        fetchWellness();
        const interval = setInterval(fetchWellness, 5000); // Live updates
        return () => clearInterval(interval);
    }, [fetchWellness]);

    // THE DEMO FLEX: Instant SMS Trigger
    const handleInstantUpdate = async () => {
        setSending(true);
        try {
            await fetch(`http://localhost:8000/api/family/send-summary/${selectedRoom}`, { method: 'POST' });
            setSentSuccess(true);
            setTimeout(() => setSentSuccess(false), 5000); // Reset after 5s
        } catch (e) { console.error(e); }
        setSending(false);
    };

    // Helper for visual status
    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-emerald-500";
        if (score >= 50) return "text-amber-500";
        return "text-rose-500";
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 max-w-md mx-auto shadow-2xl overflow-hidden relative border-x border-slate-200">
            
            {/* 1. APP HEADER (Curved) */}
            <div className="bg-indigo-600 pt-12 pb-24 px-8 rounded-b-[3rem] text-white relative shadow-xl z-10">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                
                {/* Room Selector (Hidden as a simple dropdown for demo) */}
                <div className="relative z-20 mb-6">
                    <div className="flex items-center gap-2 opacity-80 text-xs font-bold tracking-widest uppercase mb-1">
                        <Shield size={12} /> Family Connect Safe View
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedRoom}
                            onChange={(e) => setSelectedRoom(e.target.value)}
                            className="appearance-none bg-transparent text-3xl font-bold w-full outline-none cursor-pointer"
                        >
                            {rooms.map(r => <option key={r.room_id} value={r.room_id} className="text-black">{r.patient_name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                    </div>
                    <p className="text-indigo-200 text-sm">Room {selectedRoom} • Mosaic Ward</p>
                </div>
            </div>

            {/* 2. MAIN CONTENT CARD (Overlapping) */}
            <div className="px-6 -mt-16 relative z-20">
                
                {/* Wellness Score Card */}
                <div className="bg-white p-6 rounded-3xl shadow-lg mb-6 flex items-center justify-between border border-slate-100">
                   <div>
                     <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Wellness Score</p>
                     <div className={`text-6xl font-black ${getScoreColor(wellness?.wellness_score || 0)}`}>
                       {wellness?.wellness_score || "--"}
                     </div>
                     <p className="text-xs text-slate-400 font-medium mt-1">Based on sleep & mobility</p>
                   </div>
                   <div className="h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center relative">
                      <Heart className="text-rose-500 fill-rose-500 animate-pulse" size={32} />
                      <div className="absolute inset-0 border-4 border-rose-100 rounded-full animate-ping opacity-20"></div>
                   </div>
                </div>

                {/* Status Pills */}
                <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 min-w-[100px]">
                        <div className="bg-indigo-100 w-8 h-8 rounded-full flex items-center justify-center mb-2">
                            <Moon size={16} className="text-indigo-600" />
                        </div>
                        <div className="text-xl font-bold text-slate-700">{wellness?.sleep_hours}h</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Sleep</div>
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 min-w-[100px]">
                        <div className="bg-emerald-100 w-8 h-8 rounded-full flex items-center justify-center mb-2">
                            <Activity size={16} className="text-emerald-600" />
                        </div>
                        <div className="text-xl font-bold text-slate-700">{wellness?.assisted_walks}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Activity</div>
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-slate-100 min-w-[100px]">
                        <div className="bg-amber-100 w-8 h-8 rounded-full flex items-center justify-center mb-2">
                            <User size={16} className="text-amber-600" />
                        </div>
                        <div className="text-xl font-bold text-slate-700">{wellness?.rest_periods}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Visits</div>
                    </div>
                </div>

                {/* 3. DEMO ACTION: Instant Text */}
                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150"></div>
                    
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="bg-white/10 p-2 rounded-lg"><Phone size={20} /></div>
                            <div>
                                <h3 className="font-bold text-lg">Peace of Mind</h3>
                                <p className="text-indigo-200 text-xs">Get a real-time summary sent to your phone.</p>
                            </div>
                        </div>

                        <button 
                            onClick={handleInstantUpdate}
                            disabled={sending || sentSuccess}
                            className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                                sentSuccess 
                                ? "bg-emerald-500 text-white" 
                                : "bg-white text-indigo-900 hover:bg-indigo-50"
                            }`}
                        >
                            {sending ? (
                                <span className="animate-pulse">Sending...</span>
                            ) : sentSuccess ? (
                                <><CheckCircle size={16} /> Update Sent!</>
                            ) : (
                                <><Send size={16} /> Text Me Now</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Privacy Footer */}
                <div className="mt-8 text-center px-4">
                    <div className="inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full mb-3">
                        <Shield size={12} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Privacy Protected</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                        Mosaic uses skeletal analysis only. No video, images, or identifiable biometric data is ever stored or shared.
                    </p>
                </div>

            </div>
        </div>
    );
}