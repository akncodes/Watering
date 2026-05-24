# Next.js + ESP32 Smart IoT Node Controller

A high-fidelity, modern IoT dashboard and micro-controller pair that enables real-time physical relay control and live status updates over Wi-Fi.

This project is divided into two primary parts:
1. **Frontend Dashboard**: Built using Next.js 15+, React 19, and Tailwind CSS v4, featuring a glassmorphic user interface, auto-polling every 2 seconds, live debugging console, and a simulated demo mode.
2. **Firmware Core**: Built in Arduino C++ for the ESP32 platform, exposing a CORS-compliant RESTful Web Server interface.

---

## 📂 Project Directory Structure

```
esp32-control/
├── app/
│   ├── globals.css          # Tailwind CSS imports & base styles
│   ├── layout.tsx           # Dashboard layout shell with Geist fonts
│   └── page.tsx             # Main client dashboard UI (State, Poller, Logs, Config)
├── esp32/
│   └── esp32.ino            # ESP32 C++ HTTP Server sketch for Arduino IDE
├── public/                  # Next.js static asset public directory
├── package.json             # Workspace dependencies & build scripts
├── tsconfig.json            # Strict TypeScript configuration
└── README.md                # This comprehensive guide
```

---

## 🔌 Hardware Connection Diagram

To control standard household appliances safely, connect the ESP32 to a **5V Active-High Relay Module** using the following pin schema:

### Schematic Diagram
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
> **Safety First:** Working with high voltage AC mains power (110V/220V) can be extremely dangerous. Always turn off circuit breakers before handling mains wiring. If you are just testing, you can use the **ESP32's on-board blue LED (hardwired to GPIO2)** instead of connecting a physical relay.

---

## 🛠️ ESP32 Firmware Installation

Follow these steps to upload the firmware using **Arduino IDE**:

### 1. Configure Arduino IDE
- Download and install [Arduino IDE](https://www.arduino.cc/en/software).
- Open **File** -> **Preferences**.
- In **Additional Boards Manager URLs**, paste:
  `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
- Open **Tools** -> **Board** -> **Boards Manager...**, search for `esp32` by *Espressif Systems*, and click **Install**.

### 2. Prepare the Code
- Open [esp32/esp32.ino](file:///c:/Users/imabh/OneDrive/Documents/esp32-control/esp32/esp32.ino) in Arduino IDE.
- Locate the Wi-Fi credentials section at the top:
  ```cpp
  const char* ssid = "YOUR_WIFI_SSID";
  const char* password = "YOUR_WIFI_PASSWORD";
  ```
- Edit these values to match your local 2.4GHz Wi-Fi credentials.

### 3. Flash the ESP32
- Connect your ESP32 board to your computer using a data-grade Micro-USB or USB-C cable.
- Go to **Tools** -> **Board** and select your board model (e.g., **ESP32 Dev Module**).
- Go to **Tools** -> **Port** and select the active COM port assigned to the board.
- Open the **Serial Monitor** (**Tools** -> **Serial Monitor**) and set the baud rate to **115200**.
- Click the **Upload** button (right-arrow icon) at the top left.
  *Note: If the upload hangs at "Connecting...", press and hold the **BOOT (EN)** button on the ESP32 board until the flashing process starts.*

### 4. Note the Assigned IP
- Once flashing completes, the ESP32 will boot and connect to Wi-Fi.
- Watch the Serial Monitor output. Once connected, it will print:
  `IP Address assigned: 192.168.1.XX` (e.g., `192.168.1.5`).
- Copy this IP address.

---

## 💻 Running the Next.js Frontend Locally

Once the ESP32 is running on your local network, start the web interface:

### 1. Install Node.js Dependencies
Run this in your terminal at the project root folder:
```bash
npm install
```

### 2. Start the Development Server
Execute the Next.js development server:
```bash
npm run dev
```

### 3. Access and Configure
- Open your browser and navigate to [http://localhost:3000](http://localhost:3000).
- You will see the glowing, glassmorphic dashboard!
- Since your ESP32 IP address may vary:
  1. Click the **Gear (Settings)** icon in the top-right corner.
  2. Input your ESP32's assigned IP (e.g., `192.168.1.15`) in the field.
  3. Click **Apply & Test**.
- The page will automatically persist this IP address in your browser's `localStorage` and begin polling its status every 2 seconds.
- You can toggle the **Demo / Simulate Mode** switch in the top bar to test all UI animations, glows, and log flows immediately without physical hardware connected!

---

## ⚡ REST API Integration Details

The ESP32 firmware hosts these simple text-based REST endpoints:

- **`GET /on`**
  - **Action**: Sets GPIO2 HIGH.
  - **Response**: `ON` (plain text) with header `Access-Control-Allow-Origin: *`.
- **`GET /off`**
  - **Action**: Sets GPIO2 LOW.
  - **Response**: `OFF` (plain text) with header `Access-Control-Allow-Origin: *`.
- **`GET /status`**
  - **Action**: Queries physical state of GPIO2.
  - **Response**: `ON` or `OFF` (plain text) with header `Access-Control-Allow-Origin: *`.
- **`OPTIONS /*`** (Preflight)
  - **Action**: Intercepts preflight checks.
  - **Response**: `204 No Content` with CORS headers (`Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`).
# Watering
