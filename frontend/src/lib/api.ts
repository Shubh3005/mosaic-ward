// Config for API endpoints
// In production, set NEXT_PUBLIC_API_URL to your Railway/Render backend URL

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export const API = {
    // Status
    status: `${API_BASE}/api/status`,
    statusRoom: (roomId: string) => `${API_BASE}/api/status/${roomId}`,

    // Actions
    acknowledge: (roomId: string) => `${API_BASE}/api/acknowledge/${roomId}`,
    analyzeFall: `${API_BASE}/api/analyze_fall`,
    directorFall: (roomId: string) => `${API_BASE}/api/director/fall/${roomId}`,
    resetRoom: (roomId: string) => `${API_BASE}/api/reset/${roomId}`,

    // Incidents
    incidents: `${API_BASE}/api/incidents`,
    incidentResolve: (id: number) => `${API_BASE}/api/incidents/${id}/resolve`,

    // Family Portal
    familyRooms: `${API_BASE}/api/family/rooms`,
    familyWellness: (roomId: string) => `${API_BASE}/api/family/wellness/${roomId}`,
    familySendSummary: (roomId: string) => `${API_BASE}/api/family/send-summary/${roomId}`,
};

export const WS = {
    skeleton: `${WS_BASE}/ws/skeleton`,
};
