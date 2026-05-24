'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Log item structure
interface SystemLog {
  id: string;
  time: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

type ConnectionMode = 'LAN' | 'CLOUD';

export default function Home() {
  // Config state
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('LAN');
  const [ipAddress, setIpAddress] = useState<string>('192.168.29.75');
  const [cloudUrl, setCloudUrl] = useState<string>(''); // Left empty for relative API path (current host)
  
  const [tempIp, setTempIp] = useState<string>('192.168.29.75');
  const [tempCloudUrl, setTempCloudUrl] = useState<string>('');
  
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
    const savedMode = localStorage.getItem('esp32_connection_mode') as ConnectionMode;
    if (savedMode === 'LAN' || savedMode === 'CLOUD') {
      setConnectionMode(savedMode);
    }

    const savedIp = localStorage.getItem('esp32_ip_address');
    if (savedIp) {
      setIpAddress(savedIp);
      setTempIp(savedIp);
    }

    const savedCloudUrl = localStorage.getItem('esp32_cloud_url');
    if (savedCloudUrl) {
      setCloudUrl(savedCloudUrl);
      setTempCloudUrl(savedCloudUrl);
    }
    
    const savedDemo = localStorage.getItem('esp32_demo_mode');
    if (savedDemo === 'true') {
      setIsDemoMode(true);
    }

    addLog('System dashboard initialized.', 'info');
  }, [addLog]);

  // Main status poller
  const fetchStatus = useCallback(async (isInitial = false, targetMode = connectionMode, targetIp = ipAddress, targetCloud = cloudUrl, demo = isDemoMode) => {
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
          addLog(`[DEMO] Connected to simulated ESP32. Mode: ${targetMode}. Status: ${currentMockState}`, 'success');
        }
      }, 300);
      return;
    }

    let url = '';
    let logLabel = '';

    if (targetMode === 'LAN') {
      const cleanIp = targetIp.trim().replace(/^https?:\/\//, '');
      url = `http://${cleanIp}/status`;
      logLabel = `LAN (http://${cleanIp})`;
    } else {
      // CLOUD WAN Mode: if cloudUrl is empty, use relative server path, else absolute Vercel path
      const base = targetCloud.trim();
      url = base ? `${base}/api/control` : '/api/control';
      logLabel = `Cloud (${base ? base : 'local backend'})`;
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout for status poll

      const response = await fetch(url, { 
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        mode: 'cors'
      });
      
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      if (targetMode === 'LAN') {
        const text = (await response.text()).trim().toUpperCase();
        if (text === 'ON' || text === 'OFF') {
          if (deviceStatus !== text || isInitial) {
            addLog(`GET /status successful via ${logLabel}. Device is ${text}`, 'success');
          }
          setDeviceStatus(text);
        } else {
          throw new Error(`Invalid response content: "${text.substring(0, 15)}"`);
        }
      } else {
        // CLOUD WAN Mode returns JSON
        const data = await response.json();
        const status = data.status?.toUpperCase() || 'ESP32 OFFLINE';
        
        if (status === 'ON' || status === 'OFF') {
          if (deviceStatus !== status || isInitial) {
            addLog(`GET /api/control successful. Node is online. Status: ${status}`, 'success');
          }
          setDeviceStatus(status);
        } else {
          if (deviceStatus !== 'ESP32 Offline' || isInitial) {
            addLog(`Cloud Relay reports ESP32 is offline. Last seen: ${data.secondsSinceLastContact === -1 ? 'Never' : data.secondsSinceLastContact + 's ago'}`, 'warning');
          }
          setDeviceStatus('ESP32 Offline');
        }
      }
    } catch (error: any) {
      let errorMsg = error?.message || 'Network request failed';
      if (error?.name === 'AbortError') {
        errorMsg = 'Request timed out (1.5s)';
      }
      
      if (deviceStatus !== 'ESP32 Offline' || isInitial) {
        addLog(`Failed to query ${logLabel}: ${errorMsg}`, 'error');
      }
      setDeviceStatus('ESP32 Offline');
    } finally {
      setIsLoading(false);
    }
  }, [ipAddress, cloudUrl, connectionMode, isDemoMode, deviceStatus, isActionPending, addLog]);

  // Handle Poll Interval
  useEffect(() => {
    // Run initial fetch
    fetchStatus(true);

    const interval = setInterval(() => {
      fetchStatus(false);
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Change connection mode
  const handleModeChange = (mode: ConnectionMode) => {
    setConnectionMode(mode);
    localStorage.setItem('esp32_connection_mode', mode);
    addLog(`Switched network connection mode to: ${mode === 'LAN' ? 'Local LAN (Direct ESP32 IP)' : 'Global Cloud (Next.js server relay)'}`, 'info');
    
    setIsLoading(true);
    fetchStatus(true, mode);
  };

  // Save Config handler
  const saveConfiguration = () => {
    if (connectionMode === 'LAN') {
      let sanitizedIp = tempIp.trim();
      if (!sanitizedIp) {
        addLog('Invalid LAN IP configuration.', 'warning');
        return;
      }
      localStorage.setItem('esp32_ip_address', sanitizedIp);
      setIpAddress(sanitizedIp);
      addLog(`Local LAN IP host updated to: http://${sanitizedIp}`, 'info');
    } else {
      let sanitizedUrl = tempCloudUrl.trim().replace(/\/$/, ''); // Remove trailing slash
      localStorage.setItem('esp32_cloud_url', sanitizedUrl);
      setCloudUrl(sanitizedUrl);
      addLog(`Global Cloud Host URL updated to: ${sanitizedUrl ? sanitizedUrl : 'relative local backend'}`, 'info');
    }
    
    setShowConfig(false);
    
    // Trigger immediate refresh with new settings
    setIsLoading(true);
    fetchStatus(true);
  };

  // Toggle demo mode handler
  const toggleDemoMode = (checked: boolean) => {
    setIsDemoMode(checked);
    localStorage.setItem('esp32_demo_mode', String(checked));
    
    if (checked) {
      demoStateRef.current = deviceStatus === 'ESP32 Offline' ? 'OFF' : deviceStatus;
      addLog('Hardware Demo Mode enabled. Simulation active.', 'warning');
    } else {
      addLog('Hardware Demo Mode disabled. Re-establishing live physical connection...', 'info');
    }
    
    setIsLoading(true);
    fetchStatus(true, connectionMode, ipAddress, cloudUrl, checked);
  };

  // Command control trigger (ON/OFF)
  const sendCommand = async (command: 'on' | 'off') => {
    const cmdUpper = command.toUpperCase();
    setIsActionPending(true);
    addLog(`Sending command: Turn ${cmdUpper}...`, 'info');

    if (isDemoMode) {
      setTimeout(() => {
        demoStateRef.current = cmdUpper;
        setDeviceStatus(cmdUpper);
        setIsActionPending(false);
        addLog(`[DEMO] Command success: Relay state is now ${cmdUpper}`, 'success');
      }, 400);
      return;
    }

    let url = '';
    let fetchOptions: RequestInit = { method: 'GET', cache: 'no-store', mode: 'cors' };
    let logLabel = '';

    if (connectionMode === 'LAN') {
      const cleanIp = ipAddress.trim().replace(/^https?:\/\//, '');
      url = `http://${cleanIp}/${command}`;
      logLabel = `LAN (http://${cleanIp}/${command})`;
    } else {
      // CLOUD WAN Mode: POST to API route
      const base = cloudUrl.trim();
      url = base ? `${base}/api/control` : '/api/control';
      logLabel = `Cloud API (${url})`;
      fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: cmdUpper }),
        cache: 'no-store',
      };
    }

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000); // 3s command timeout
      fetchOptions.signal = controller.signal;

      const response = await fetch(url, fetchOptions);
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      if (connectionMode === 'LAN') {
        const text = (await response.text()).trim().toUpperCase();
        if (text === 'ON' || text === 'OFF' || text === cmdUpper) {
          setDeviceStatus(cmdUpper);
          addLog(`Command success: ${logLabel} -> Device turned ${cmdUpper}`, 'success');
        } else {
          setDeviceStatus(cmdUpper);
          addLog(`Command response unexpected ("${text.substring(0, 10)}"), but command succeeded. State: ${cmdUpper}`, 'warning');
        }
      } else {
        // CLOUD Mode response
        const data = await response.json();
        if (data.success) {
          // Note: In Cloud Mode, the command is set as the DESIRED state on the server.
          // The device status on the dashboard updates after the ESP32 fetches it and aligns physically.
          // But to give responsive tactile feedback, we set state instantly and explain in logs.
          setDeviceStatus(cmdUpper);
          addLog(`Desired state updated to ${cmdUpper} on Cloud Relay. Synced on next ESP32 poll.`, 'success');
        } else {
          throw new Error(data.error || 'Server rejected command');
        }
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Network connection failed';
      addLog(`Failed to send command ${cmdUpper} via ${connectionMode} Mode: ${errorMsg}`, 'error');
      // If we fail, force status refresh
      fetchStatus(false);
    } finally {
      setIsActionPending(false);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('System event console logs cleared.', 'info');
  };

  // Style helpers
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
                ESP32 Smart IoT Node
              </h1>
            </div>
            
            {/* Dynamic IP info line */}
            <p className="text-xs text-slate-400 mt-1.5 flex flex-wrap items-center gap-1.5">
              Mode: 
              <span className={`font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded border ${
                connectionMode === 'LAN' 
                  ? 'bg-sky-950/40 border-sky-900/30 text-sky-400' 
                  : 'bg-indigo-950/40 border-indigo-900/30 text-indigo-400'
              }`}>
                {connectionMode === 'LAN' ? 'Local LAN' : 'Global Cloud'}
              </span>
              {connectionMode === 'LAN' ? (
                <>
                  Host: <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">http://{ipAddress}</span>
                </>
              ) : (
                <>
                  Cloud API: <span className="font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300">{cloudUrl ? cloudUrl + '/api/control' : '/api/control'}</span>
                </>
              )}
              {isDemoMode && (
                <span className="text-amber-400 font-semibold uppercase tracking-wider text-[10px] bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">
                  Demo Mode
                </span>
              )}
            </p>
          </div>

          {/* Controls Right */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            
            {/* Connection Mode Toggle buttons (Sliding Pill style) */}
            <div className="bg-slate-900 border border-slate-850 p-0.5 rounded-lg flex items-center shrink-0">
              <button
                onClick={() => handleModeChange('LAN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all active:scale-95 ${
                  connectionMode === 'LAN' 
                    ? 'bg-slate-800 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Local LAN
              </button>
              <button
                onClick={() => handleModeChange('CLOUD')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all active:scale-95 ${
                  connectionMode === 'CLOUD' 
                    ? 'bg-cyan-600 text-slate-950 shadow-md shadow-cyan-950/20 font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cloud WAN
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              {/* Simulation checkbox */}
              <label className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-2 rounded-lg text-xs cursor-pointer hover:bg-slate-900 transition-colors">
                <input
                  type="checkbox"
                  checked={isDemoMode}
                  onChange={(e) => toggleDemoMode(e.target.checked)}
                  className="rounded border-slate-800 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-950 bg-slate-950"
                />
                <span className="text-slate-300 select-none hidden sm:inline">Simulate Mode</span>
                <span className="text-slate-300 select-none sm:hidden">Sim</span>
              </label>

              {/* Settings toggle */}
              <button
                onClick={() => {
                  setShowConfig(!showConfig);
                  if (!showConfig) {
                    setTempIp(ipAddress);
                    setTempCloudUrl(cloudUrl);
                  }
                }}
                id="btn-settings-toggle"
                className="flex items-center justify-center p-2 h-[34px] w-[34px] rounded-lg bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 hover:border-slate-700 transition-all active:scale-95"
                aria-label="Toggle networks settings"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

          </div>
        </header>

        {/* Dynamic IP/Cloud URL Configurator Slide-down panel */}
        {showConfig && (
          <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3.5 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
            {connectionMode === 'LAN' ? (
              <div className="w-full">
                <label htmlFor="esp32-ip-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Local ESP32 IP Address
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 font-mono text-sm">
                    http://
                  </span>
                  <input
                    id="esp32-ip-input"
                    type="text"
                    value={tempIp}
                    onChange={(e) => setTempIp(e.target.value)}
                    placeholder="192.168.29.75"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-14 pr-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Configure your ESP32 board local private IP assigned by your router (Wi-Fi LAN mode).</p>
              </div>
            ) : (
              <div className="w-full">
                <label htmlFor="esp32-cloud-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Custom Next.js Cloud Base URL (Optional)
                </label>
                <input
                  id="esp32-cloud-input"
                  type="text"
                  value={tempCloudUrl}
                  onChange={(e) => setTempCloudUrl(e.target.value)}
                  placeholder="https://my-esp32-nodes.vercel.app"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-slate-100 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                />
                <p className="text-[10px] text-slate-500 mt-1">Leave empty to use the current website host base url (standard relative query `/api/control`).</p>
              </div>
            )}
            
            <div className="flex gap-2 justify-end">
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
                Apply & Refresh
              </button>
            </div>
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
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                {connectionMode === 'LAN' ? 'Direct Node Connection' : 'Global Cloud Routing'}
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Polling...
                  </>
                ) : (
                  <>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                    {isOffline ? 'Disconnected' : 'Synchronized'}
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
                    ? 'bg-cyan-950/30 border-cyan-400/50 shadow-[0_0_50px_rgba(34,211,238,0.35)] scale-105' 
                    : 'bg-slate-900/60 border-slate-750 shadow-[0_0_30px_rgba(100,116,139,0.05)]'
              }`}>
                
                {/* Status Indicator Icon */}
                {isOffline ? (
                  <svg className="w-12 h-12 text-rose-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-3.536 4.978 4.978 0 011.414-3.536m0 0L4 8.464m1.414 8.464l-2.828 2.828M12 12V9m0 6h.01" />
                  </svg>
                ) : isDeviceOn ? (
                  <svg className="w-14 h-14 text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ) : (
                  <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>

              {/* Status Text Description */}
              <div className="mt-5">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold font-mono">Current State</span>
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
                <span className="text-rose-400/80">
                  {connectionMode === 'LAN' 
                    ? 'Check physical power on the ESP32 board or make sure your device is on the same local Wi-Fi.'
                    : 'Cloud server is active, but the ESP32 is offline. Check if your micro-controller is powered and flashing.'}
                </span>
              ) : isDeviceOn ? (
                <span className="text-cyan-400/90 font-medium">Active (GPIO2 HIGH). Circuit load closed. Control active from anywhere.</span>
              ) : (
                <span className="text-slate-400">Dormant (GPIO2 LOW). Circuit load open. Poller synchronizing.</span>
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
                IoT Control Panel
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {connectionMode === 'LAN' 
                  ? 'Dispatches REST calls directly to the ESP32 internal webserver IP. Fast and local-only.' 
                  : 'Updates the Desired State on the cloud backend. The ESP32 polls and applies it globally.'}
              </p>
              
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                <span className={`text-[10px] border px-2 py-0.5 rounded font-mono ${
                  connectionMode === 'LAN' ? 'bg-sky-950/30 border-sky-900/30 text-sky-400' : 'bg-indigo-950/30 border-indigo-900/30 text-indigo-400'
                }`}>
                  {connectionMode === 'LAN' ? 'GET /on' : 'POST /api/control'}
                </span>
                <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-400 font-mono">GPIO2</span>
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
                {isActionPending && deviceStatus !== 'ON' ? 'Executing...' : 'POWER ON'}
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
                {isActionPending && deviceStatus === 'ON' ? 'Executing...' : 'POWER OFF'}
              </button>
            </div>

          </div>
        </section>

        {/* Live Debug Logs Console (Premium Feature) */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-slate-850 rounded-2xl overflow-hidden flex flex-col h-60">
          
          {/* Console Header */}
          <div className="flex justify-between items-center bg-slate-950 px-4 py-3 border-b border-slate-850/80">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-slate-350">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              SYSTEM EVENT LOGGER
            </div>
            <button
              onClick={clearLogs}
              className="text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-rose-450 transition-colors"
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
        Next.js + ESP32 Smart Home Interface • Powered by Antigravity AI
      </footer>

    </div>
  );
}
