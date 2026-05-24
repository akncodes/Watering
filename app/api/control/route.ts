import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Prevent Next.js from statically caching this API

// Extend global namespace to prevent variable re-initialization during development HMR reloads
const globalRef = global as any;
if (!globalRef.relayState) {
  globalRef.relayState = {
    desiredState: 'OFF',
    lastActualState: 'OFF',
    lastSeen: 0, // Timestamp of last ESP32 contact
  };
}

const state = globalRef.relayState;

/**
 * GET Handler
 * Used by BOTH the ESP32 (to poll and fetch commands) and the Dashboard (to fetch current node status).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isEsp32 = searchParams.get('esp32') === 'true';
  const actualState = searchParams.get('actual')?.toUpperCase() || 'OFF';

  if (isEsp32) {
    // Heartbeat: ESP32 has contacted the server
    state.lastSeen = Date.now();
    state.lastActualState = (actualState === 'ON' || actualState === 'OFF') ? actualState : 'OFF';

    // Respond to ESP32 with the PLAIN TEXT command it needs to execute
    return new NextResponse(state.desiredState, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // Dashboard status check logic:
  const now = Date.now();
  const timeDifference = now - state.lastSeen;
  const isOffline = timeDifference > 6000; // Offline if no contact within 6 seconds (polls are every 2s)

  const dashboardStatus = isOffline ? 'ESP32 Offline' : state.lastActualState;

  return NextResponse.json({
    status: dashboardStatus,
    desiredState: state.desiredState,
    lastActualState: state.lastActualState,
    lastSeen: state.lastSeen,
    secondsSinceLastContact: state.lastSeen === 0 ? -1 : Math.round(timeDifference / 1000),
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

/**
 * POST Handler
 * Used by the Next.js Frontend Dashboard to issue ON / OFF commands.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const command = body.command?.toUpperCase();

    if (command !== 'ON' && command !== 'OFF') {
      return NextResponse.json({ error: 'Invalid command. Must be "ON" or "OFF"' }, { status: 400 });
    }

    // Set the desired state which the ESP32 will receive on its next poll
    state.desiredState = command;

    return NextResponse.json({
      success: true,
      desiredState: state.desiredState,
      lastActualState: state.lastActualState,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
  }
}

/**
 * OPTIONS Handler
 * Explicitly handle CORS preflight request for modern browsers
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
