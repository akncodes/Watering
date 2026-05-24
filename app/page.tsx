'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Log item structure
interface SystemLog {
  id: string;
  time: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export default function Home() {
  // Configuration state (Saved in localStorage)
  const [firebaseUrl, setFirebaseUrl] = useState<string>('');
  const [tempUrl, setTempUrl] = useState<string>('');
  
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Device status state
  // "ON" | "OFF" | "ESP32 Offline"
  const [deviceStatus, setDeviceStatus] = useState<string>('ESP32 Offline');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  // System logs state
  const [logs, setLogs] = useState<SystemLog[]>([]);
  
  // Track mock state for Demo Mode
  const demoStateRef = useRef<string>('OFF');

  // Helper to add system logs
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    
    setLogs((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        time: timeStr,
        type,
        message,
      },
      ...prev.slice(0, 49), // Keep last 50 logs
    ]);
  }, []);

  // Load configuration and initialize logs
  useEffect(() => {
    // Prioritize system environment variables (.env) over localStorage
    const envUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    const savedUrl = localStorage.getItem('esp32_firebase_url');
    
    let activeUrl = '';
    if (envUrl) {
      // Sanitize standard https and trailing slashes for visual consistency
      activeUrl = envUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      addLog('Loaded Firebase Realtime Database URL from environment (.env).', 'success');
    } else if (savedUrl) {
      activeUrl = savedUrl;
    }

    if (activeUrl) {
      setFirebaseUrl(activeUrl);
      setTempUrl(activeUrl);
    }
    
    const savedDemo = localStorage.getItem('esp32_demo_mode');
    if (savedDemo === 'true') {
      setIsDemoMode(true);
    } else if (!activeUrl) {
      // If no Firebase URL is set anywhere, enable Demo Mode automatically so the UI works immediately
      setIsDemoMode(true);
      localStorage.setItem('esp32_demo_mode', 'true');
    }

    addLog('System dashboard initialized.', 'info');
  }, [addLog]);

  // Main status poller from Firebase Realtime Database
  const fetchStatus = useCallback(async (isInitial = false, targetUrl = firebaseUrl, demo = isDemoMode) => {
    if (isActionPending) return; // Prevent poll overlap during user interaction

    if (isInitial) {
      setIsLoading(true);
    }

    if (demo) {
      // Simulation mode logic
      setTimeout(() => {
        const currentMockState = demoStateRef.current;
        setDeviceStatus(currentMockState);
        setIsLoading(false);
        if (isInitial) {
          addLog(`[DEMO] Connected to simulated ESP32 node. Status: ${currentMockState}`, 'success');
        }
      }, 300);
      return;
    }

    if (!targetUrl) {
      setIsLoading(false);
      return;
    }

    // Format target database REST URL
    // Ensure URL has https:// and ends with a trailing slash
    let formattedUrl = targetUrl.trim();
    if (!formattedUrl.startsWith('http')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    if (!formattedUrl.endsWith('/')) {
      formattedUrl += '/';
    }
    
    const url = `${formattedUrl}watering.json`;

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000); // 2s timeout for status poll

      const response = await fetch(url, { 
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`Firebase REST HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data) {
        // Database is empty (new setup)
        if (isInitial) {
          addLog('Firebase connected, but database is empty. Waiting for ESP32 to check in...', 'warning');
        }
        setDeviceStatus('ESP32 Offline');
        return;
      }

      const actualState = data.actualState?.toUpperCase() || 'OFF';
      const lastSeen = data.lastSeen || 0;
      
      // Calculate heartbeat delta (Firebase Server Values are in milliseconds)
      const now = Date.now();
      const timeDifference = now - lastSeen;
      const isOffline = lastSeen === 0 || timeDifference > 18000; // Offline if no contact within 18 seconds (ESP32 reports heartbeat)

      const statusText = isOffline ? 'ESP32 Offline' : actualState;
      
      if (deviceStatus !== statusText || isInitial) {
        if (isOffline) {
          addLog(`Node is unreachable. Last seen: ${lastSeen === 0 ? 'Never' : Math.round(timeDifference / 1000) + 's ago'}`, 'warning');
        } else {
          addLog(`Sync successful. Valve physical status is ${actualState} (heartbeat OK)`, 'success');
        }
      }
      
      setDeviceStatus(statusText);
    } catch (error: any) {
      let errorMsg = error?.message || 'Network request failed';
      if (error?.name === 'AbortError') {
        errorMsg = 'Request timed out';
      }
      
      if (deviceStatus !== 'ESP32 Offline' || isInitial) {
        addLog(`Firebase connection failed: ${errorMsg}`, 'error');
      }
      setDeviceStatus('ESP32 Offline');
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUrl, isDemoMode, deviceStatus, isActionPending, addLog]);

  // Handle Poll Interval
  useEffect(() => {
    fetchStatus(true);

    const interval = setInterval(() => {
      fetchStatus(false);
    }, 3000); // Poll Firebase every 3 seconds (very safe for free tier)

    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Save Config handler
  const saveConfiguration = () => {
    let sanitizedUrl = tempUrl.trim();
    
    // Quick sanitization
    if (sanitizedUrl) {
      sanitizedUrl = sanitizedUrl.replace(/^https?:\/\//, ''); // Strip http/https prefix for storage
      sanitizedUrl = sanitizedUrl.replace(/\/$/, ''); // Strip trailing slash
      
      localStorage.setItem('esp32_firebase_url', sanitizedUrl);
      setFirebaseUrl(sanitizedUrl);
      
      // Switch off Demo Mode when actual URL is entered
      setIsDemoMode(false);
      localStorage.setItem('esp32_demo_mode', 'false');
      
      addLog(`Firebase URL saved: https://${sanitizedUrl}/`, 'info');
      setShowConfig(false);
      
      setIsLoading(true);
      fetchStatus(true, sanitizedUrl, false);
    } else {
      addLog('Firebase URL cannot be blank.', 'warning');
    }
  };

  // Toggle demo mode handler
  const toggleDemoMode = (checked: boolean) => {
    setIsDemoMode(checked);
    localStorage.setItem('esp32_demo_mode', String(checked));
    
    if (checked) {
      demoStateRef.current = deviceStatus === 'ESP32 Offline' ? 'OFF' : deviceStatus;
      addLog('Hardware Simulation active.', 'warning');
    } else {
      if (!firebaseUrl) {
        addLog('Cannot disable Demo Mode: No Firebase URL configured.', 'error');
        setIsDemoMode(true);
        localStorage.setItem('esp32_demo_mode', 'true');
        return;
      }
      addLog('Re-connecting to live Firebase endpoint...', 'info');
    }
    
    setIsLoading(true);
    fetchStatus(true, firebaseUrl, checked);
  };

  // Dispatch Command to Firebase REST API
  const sendCommand = async (command: 'on' | 'off') => {
    const cmdUpper = command.toUpperCase();
    setIsActionPending(true);
    addLog(`Sending command: Set Valve ${cmdUpper}...`, 'info');

    if (isDemoMode) {
      setTimeout(() => {
        demoStateRef.current = cmdUpper;
        setDeviceStatus(cmdUpper);
        setIsActionPending(false);
        addLog(`[DEMO] Success: Valve state set to ${cmdUpper}`, 'success');
      }, 400);
      return;
    }

    // Format target database REST URL
    let formattedUrl = firebaseUrl.trim();
    if (!formattedUrl.startsWith('http')) {
      formattedUrl = 'https://' + formattedUrl;
    }
    if (!formattedUrl.endsWith('/')) {
      formattedUrl += '/';
    }
    
    const url = `${formattedUrl}watering/desiredState.json`;

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3500); // 3.5s command timeout

      // Send PUT request to overwrite desiredState
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cmdUpper), // Overwrites with "ON" or "OFF"
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      // Optimistically update status to show responsive click
      setDeviceStatus(cmdUpper);
      addLog(`Valve state updated to ${cmdUpper} in Cloud Database. Switched instantly!`, 'success');
    } catch (error: any) {
      const errorMsg = error?.message || 'Connection failed';
      addLog(`Failed to update Valve state: ${errorMsg}`, 'error');
      fetchStatus(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('System event console logs cleared.', 'info');
  };

  // Helpers
  const isDeviceOn = deviceStatus === 'ON';
  const isOffline = deviceStatus === 'ESP32 Offline';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between font-sans selection:bg-cyan-500 selection:text-slate-900 transition-colors duration-300">
      
      {/* Decorative Top Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-cyan-900/10 via-transparent to-transparent blur-3xl pointer-events-none rounded-full" />

      {/* Main Container */}
      <main className="w-full max-w-4xl px-4 md:px-8 py-8 flex flex-col gap-6 z-10 flex-1 justify-center">
        
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-6 w-full">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isOffline ? 'bg-rose-500' : isDeviceOn ? 'bg-cyan-400' : 'bg-amber-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isOffline ? 'bg-rose-500' : isDeviceOn ? 'bg-cyan-500' : 'bg-amber-500'
                }`} />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                24/7 Smart Watering Station
              </h1>
            </div>
            
            <p className="text-xs text-slate-400 mt-1.5 flex flex-wrap items-center gap-1.5">
              Cloud Broker: 
              <span className="font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded border bg-indigo-950/40 border-indigo-900/30 text-indigo-400">
                Firebase RTDB
              </span>
              {firebaseUrl ? (
                <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">
                  https://{firebaseUrl}/
                </span>
              ) : (
                <span className="text-rose-400 font-medium font-mono text-[10px]">
                  [Credentials Needed]
                </span>
              )}
              {isDemoMode && (
                <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px] bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">
                  Simulating
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            
            {/* Simulation toggle */}
            <label className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={isDemoMode}
                onChange={(e) => toggleDemoMode(e.target.checked)}
                className="rounded border-slate-800 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-950 bg-slate-950"
              />
              <span className="text-slate-300 select-none">Simulate Device</span>
            </label>

            {/* Config Toggle button */}
            <button
              onClick={() => {
                setShowConfig(!showConfig);
                if (!showConfig) {
                  setTempUrl(firebaseUrl);
                }
              }}
              id="btn-settings-toggle"
              className="flex items-center justify-center p-2 h-[34px] w-[34px] rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 hover:border-slate-700 transition-all active:scale-95"
              aria-label="Toggle database settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

          </div>
        </header>

        {/* Database Configurator Panel */}
        {showConfig && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="w-full">
              <label htmlFor="firebase-url-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Firebase Realtime Database URL
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 font-mono text-sm">
                  https://
                </span>
                <input
                  id="firebase-url-input"
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="your-watering-rtdb.firebaseio.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-[74px] pr-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
              </div>
            </div>
            
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-950 text-slate-400 hover:text-white border border-slate-850 hover:bg-slate-900 rounded-lg transition-colors active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={saveConfiguration}
                id="btn-save-ip"
                className="px-5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg transition-all shadow-md shadow-cyan-950/20 active:scale-95"
              >
                Apply & Connect
              </button>
            </div>
          </section>
        )}

        {/* Credentials Wizard Landing (if no Firebase configured and not in simulation) */}
        {!firebaseUrl && !isDemoMode && (
          <section className="bg-gradient-to-br from-indigo-950/30 via-slate-900/40 to-slate-900/50 backdrop-blur-xl border border-indigo-900/30 rounded-2xl p-6 text-center animate-in zoom-in-95 duration-300">
            <svg className="w-12 h-12 text-indigo-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className="text-lg font-bold text-white mb-2">Connect Your Firebase Database</h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed mb-4">
              To trigger the watering valve physically from anywhere in the world, enter your free **Firebase Realtime Database URL** in the field below:
            </p>
            <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto items-stretch">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 font-mono text-xs">https://</span>
                <input
                  type="text"
                  placeholder="your-watering-rtdb.firebaseio.com"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-[62px] pr-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={saveConfiguration}
                className="bg-indigo-650 hover:bg-indigo-500 text-white font-semibold text-xs px-5 py-2 rounded-lg transition-all active:scale-95"
              >
                Connect Node
              </button>
            </div>
            <button
              onClick={() => {
                setIsDemoMode(true);
                localStorage.setItem('esp32_demo_mode', 'true');
                addLog('Simulation Mode enabled to browse UI.', 'warning');
              }}
              className="text-[10px] text-slate-500 hover:text-indigo-400 mt-4 uppercase font-bold tracking-wider transition-colors inline-block"
            >
              Or Browse UI in Simulated Demo Mode
            </button>
          </section>
        )}

        {/* Center Control Panel */}
        <section className="grid grid-cols-1 md:grid-cols-5 gap-6">
          
          {/* Main Status Glowing Card */}
          <div className="md:col-span-3 bg-slate-900/40 backdrop-blur-xl border border-slate-850 rounded-2xl p-6 md:p-8 flex flex-col justify-between items-center text-center relative overflow-hidden group min-h-[350px]">
            
            {/* Ambient Background Light based on status */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none transition-all duration-700 ${
              isOffline ? 'bg-rose-600' : isDeviceOn ? 'bg-cyan-500' : 'bg-amber-600'
            }`} />

            {/* Top Indicator */}
            <div className="w-full flex justify-between items-center text-xs text-slate-400 border-b border-slate-850/60 pb-4 mb-4">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Watering Valve Status</span>
              <span className="flex items-center gap-1.5 font-mono">
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    {isOffline ? 'Offline' : 'Connected'}
                  </>
                )}
              </span>
            </div>

            {/* Giant Glowing Orb Status */}
            <div className="flex flex-col items-center justify-center my-auto py-4">
              
              {/* Outer Pulsing Container */}
              <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 relative border ${
                isOffline 
                  ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_40px_rgba(239,68,68,0.25)]' 
                  : isDeviceOn 
                    ? 'bg-cyan-950/30 border-cyan-400/50 shadow-[0_0_50px_rgba(34,211,238,0.35)] scale-105 animate-pulse' 
                    : 'bg-slate-900/60 border-slate-750 shadow-[0_0_30px_rgba(100,116,139,0.05)]'
              }`}>
                
                {/* Status Indicator Icon */}
                {isOffline ? (
                  <svg className="w-12 h-12 text-rose-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-3.536 4.978 4.978 0 011.414-3.536m0 0L4 8.464m1.414 8.464l-2.828 2.828M12 12V9m0 6h.01" />
                  </svg>
                ) : isDeviceOn ? (
                  <svg className="w-14 h-14 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l-.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                )}
              </div>

              {/* Status Text Description */}
              <div className="mt-5">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold font-mono">Valve State</span>
                <h2 className={`text-3xl font-extrabold tracking-wide mt-1 transition-all duration-300 ${
                  isOffline 
                    ? 'text-rose-500 drop-shadow-[0_0_12px_rgba(239,68,68,0.25)]' 
                    : isDeviceOn 
                      ? 'text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]' 
                      : 'text-slate-400'
                }`}>
                  {deviceStatus}
                </h2>
              </div>
            </div>

            {/* Bottom State Explanation */}
            <div className="text-xs text-slate-450 border-t border-slate-850/60 pt-4 w-full">
              {isOffline ? (
                <span className="text-rose-450/80">
                  {firebaseUrl 
                    ? 'No heartbeat from ESP32. Ensure the board is powered, connected to local Wi-Fi, and streaming Firebase.' 
                    : 'Awaiting your database URL to establish real-time connections.'}
                </span>
              ) : isDeviceOn ? (
                <span className="text-cyan-400/90 font-medium">Flowing (GPIO2 HIGH). Watering active. Real-time push stream synced.</span>
              ) : (
                <span className="text-slate-400">Closed (GPIO2 LOW). Watering dormant. Low-power standby active.</span>
              )}
            </div>

          </div>

          {/* Quick Command Control Card */}
          <div className="md:col-span-2 flex flex-col justify-between gap-4">
            
            {/* Controller Instructions panel */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 rounded-2xl p-5 flex flex-col justify-center flex-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cloud Broker Sync
              </h3>
              <p className="text-xs text-slate-450 leading-relaxed">
                Toggling commands updates your Firebase Realtime database instantly. The 24/7 ESP32 stream client intercepts this change within milliseconds.
              </p>
              
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                <span className="text-[10px] bg-indigo-950/30 border border-indigo-900/30 text-indigo-400 px-2 py-0.5 rounded font-mono">
                  PUT /watering/desiredState.json
                </span>
                <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">SSE Stream</span>
              </div>
            </div>

            {/* Tactile Control Buttons Container */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 rounded-2xl p-5 flex flex-col gap-3.5">
              
              {/* ON BUTTON */}
              <button
                onClick={() => sendCommand('on')}
                disabled={isActionPending}
                id="btn-relay-on"
                className={`w-full py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-97 cursor-pointer ${
                  isActionPending
                    ? 'bg-slate-850 text-slate-500 border border-slate-800 shadow-none cursor-not-allowed'
                    : isDeviceOn
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-950/30 font-extrabold'
                      : 'bg-slate-900 border border-slate-800 text-cyan-400 hover:text-cyan-300 hover:bg-slate-850 hover:border-cyan-900/40 shadow-slate-950/20'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isDeviceOn ? 'bg-slate-950 animate-ping' : 'bg-cyan-400'}`} />
                {isActionPending && deviceStatus !== 'ON' ? 'Executing...' : 'OPEN VALVE'}
              </button>

              {/* OFF BUTTON */}
              <button
                onClick={() => sendCommand('off')}
                disabled={isActionPending}
                id="btn-relay-off"
                className={`w-full py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all shadow-md active:scale-97 cursor-pointer ${
                  isActionPending
                    ? 'bg-slate-850 text-slate-500 border border-slate-800 shadow-none cursor-not-allowed'
                    : !isDeviceOn && !isOffline
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-950/30 font-extrabold'
                      : 'bg-slate-900 border border-slate-800 text-slate-450 hover:text-rose-450 hover:bg-slate-850 hover:border-rose-900/30 shadow-slate-950/20'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${(!isDeviceOn && !isOffline) ? 'bg-slate-950 animate-ping' : 'bg-slate-500'}`} />
                {isActionPending && deviceStatus === 'ON' ? 'Executing...' : 'CLOSE VALVE'}
              </button>
            </div>

          </div>
        </section>

        {/* Live Debug Logs Console */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 rounded-2xl overflow-hidden flex flex-col h-60">
          
          {/* Console Header */}
          <div className="flex justify-between items-center bg-slate-950 px-4 py-3 border-b border-slate-850/80">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-355">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              SYSTEM EVENT LOGGER
            </div>
            <button
              onClick={clearLogs}
              className="text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-rose-455 transition-colors"
              title="Clear event logs"
            >
              Clear Logs
            </button>
          </div>

          {/* Console Output Area */}
          <div className="flex-1 p-3 font-mono text-xs overflow-y-auto flex flex-col-reverse gap-1.5 bg-slate-950/40 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {logs.length === 0 ? (
              <div className="text-slate-600 text-center my-auto italic select-none">
                No logs recorded yet. Events will appear here in real-time.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 border-b border-slate-900/40 pb-1 last:border-b-0 animate-in fade-in duration-100">
                  <span className="text-slate-500 shrink-0 select-none">[{log.time}]</span>
                  
                  {/* Status Indicator Pill */}
                  <span className={`shrink-0 uppercase px-1 rounded text-[8px] font-bold select-none ${
                    log.type === 'success' 
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/40' 
                      : log.type === 'error' 
                        ? 'bg-rose-950/80 text-rose-400 border border-rose-900/40' 
                        : log.type === 'warning' 
                          ? 'bg-amber-950/80 text-amber-400 border border-amber-900/40'
                          : 'bg-slate-900 text-slate-450 border border-slate-800'
                  }`}>
                    {log.type}
                  </span>

                  <span className={`leading-relaxed break-all ${
                    log.type === 'success' 
                      ? 'text-emerald-400/90' 
                      : log.type === 'error' 
                        ? 'text-rose-400/90' 
                        : log.type === 'warning' 
                          ? 'text-amber-400/90'
                          : 'text-slate-350'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

      </main>

      {/* Sleek Minimal Footer */}
      <footer className="w-full border-t border-slate-900 py-4 text-center text-[10px] text-slate-650 font-mono z-10 bg-slate-950/80 backdrop-blur-sm">
        Firebase Realtime • 24/7 Smart Irrigation System • Powered by Antigravity AI
      </footer>

    </div>
  );
}
