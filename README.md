# Next.js + ESP32 Smart IoT Node Controller (Dual-Mode Edition)

A high-fidelity, modern IoT dashboard and micro-controller pair that enables real-time physical relay control and live status updates over both **Local Wi-Fi (LAN)** and **Global Internet (WAN)** from anywhere in the world!

---

## 📂 Project Architecture

This project supports two interchangeable connection modes that can be toggled instantly from the dashboard UI:

### 1. Local LAN Mode (Direct Connection)
- **Concept**: The Next.js dashboard talks directly to the ESP32's private IP.
- **ESP32 Role**: Operates as a local HTTP Web Server.
- **Limitation**: Phone/Laptop and ESP32 **must** be on the same Wi-Fi network.

### 2. Global Cloud WAN Mode (Control from Anywhere)
- **Concept**: Next.js serves as an in-memory **Cloud HTTP Relay** (`/api/control`).
- **ESP32 Role**: Operates as an **HTTP Client** polling the Next.js Cloud API every 2 seconds.
- **Advantage**: Control your hardware from **anywhere in the world** (e.g. over cellular data) with zero port forwarding, CGNAT bypasses, or third-party databases!

```
[ Next.js Dashboard ] (Anywhere in the world)
         │
         ▼ (POST /api/control)
[ Next.js Cloud API / Server ] <─── (GET /api/control?actual=OFF) ─── [ ESP32 Client ] (At Home)
```

---

## 📂 Project Directory Structure

```
esp32-control/
├── app/
│   ├── api/
│   │   └── control/
│   │       └── route.ts      # Cloud Relay API Endpoint (GET/POST/OPTIONS)
│   ├── globals.css          # Tailwind CSS imports & base styles
│   ├── layout.tsx           # Dashboard layout shell with Geist fonts
│   └── page.tsx             # Main dual-mode client dashboard UI
├── esp32/
│   └── esp32.ino            # ESP32 C++ HTTP Client sketch with HTTPS/SSL bypass
├── package.json             # Workspace dependencies & build scripts
├── tsconfig.json            # Strict TypeScript configuration
└── README.md                # This comprehensive assembly guide
```

---

## 🔌 Hardware Connection Diagram

To control physical electronics (like a lamp or relay module) safely, connect the ESP32 using the following pin schema:

```
  ┌────────────────────────┐                  ┌────────────────────────┐
  │      ESP32 Board       │                  │  5V Relay Module Card  │
  │                        │                  │                        │
  │                   5V  ─┼──────────────────┼─  VCC                  │
  │                  GND  ─┼──────────────────┼─  GND                  │
  │         GPIO2 (D2)    ─┼──────────────────┼─  IN (Signal Input)    │
  │                        │                  │                        │
  └────────────────────────┘                  └──────────┬──┬──────────┘
                                                         │  │
                                                         ▼  ▼
                                                   To AC Mains/Load
                                                   (NO / COM Terminals)
```

> [!WARNING]
> **Safety First:** Working with high voltage AC mains power (110V/220V) can be dangerous. Turn off circuit breakers before handling mains wiring. For zero-risk testing, simply use the **ESP32's on-board blue LED (hardwired to GPIO2)** which will mirror the relay state!

---

## 🛠️ ESP32 Firmware Installation

Upload the firmware using the **Arduino IDE**:

### 1. Configure Board manager
- Open **File** -> **Preferences**.
- In **Additional Boards Manager URLs**, paste:
  `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- Open **Tools** -> **Board** -> **Boards Manager...**, search for `esp32` by *Espressif Systems*, and click **Install**.

### 2. Configure the Firmware Code
- Open [esp32/esp32.ino](file:///c:/Users/imabh/OneDrive/Documents/esp32-control/esp32/esp32.ino) in Arduino IDE.
- Locate the Wi-Fi credentials section and input your router details:
  ```cpp
  const char* ssid = "YOUR_WIFI_SSID";
  const char* password = "YOUR_WIFI_PASSWORD";
  ```
- Locate the **`serverUrl`** variable:
  ```cpp
  const char* serverUrl = "https://your-deployed-app.vercel.app/api/control";
  ```
  - **For local LAN-mode testing**: Set this to your laptop's private network IP, e.g., `http://192.168.29.80:3000/api/control` (find your laptop's IP using `ipconfig` in CMD).
  - **For global anywhere-control**: Set this to your public Next.js deployment URL once deployed to Vercel (e.g. `https://esp32-node.vercel.app/api/control`).

### 3. Flash the Board
- Connect the ESP32 to your computer.
- Select your board model in **Tools** -> **Board** (e.g., **ESP32 Dev Module**) and your active COM **Port**.
- Open the **Serial Monitor** (**Tools** -> **Serial Monitor**) and set it to **115200** baud.
- Click the **Upload** button (right-arrow icon). If the upload stalls, hold down the physical **BOOT/EN** button on the ESP32.

---

## 🌐 Deploying the Next.js Frontend to Vercel (100% Free)

To control your ESP32 from another city, deploy the Next.js repository to the cloud:

1. **Push your code to GitHub**:
   - Create a private repository on [GitHub](https://github.com).
   - Push this `esp32-control` codebase to your repository.
2. **Deploy on Vercel**:
   - Go to [Vercel](https://vercel.com) and sign up/login with GitHub.
   - Click **Add New** -> **Project**.
   - Import your `esp32-control` repository.
   - Click **Deploy**. Vercel will bundle and compile your application in 30 seconds!
3. **Link Your Domain**:
   - Copy the public deployment URL assigned by Vercel (e.g., `https://esp32-control-alpha.vercel.app`).
   - Paste this URL into the `serverUrl` variable of your Arduino IDE `esp32.ino` sketch (adding `/api/control` at the end) and flash it!

---

## 💻 Running & Testing Locally

You can run both LAN and WAN models locally on your home network:

### 1. Install Node.js Dependencies
Run at the project root folder:
```bash
npm install
```

### 2. Start the Local Server
```bash
npm run dev
```

### 3. Open the Dashboard
- Navigate to [http://localhost:3000](http://localhost:3000).
- Toggle **Local LAN** vs. **Cloud WAN** directly from the top-right header!
- **Local LAN Mode**: Click the Gear icon, input your ESP32's local IP address (e.g., `192.168.29.75`), and click Apply.
- **Cloud WAN Mode**: The dashboard will talk to the server endpoint `/api/control` automatically.
- **Simulate Mode**: Check this box to instantly test all animations, neon glowing cards, toggles, and micro-second logs without needing physical hardware connected!
