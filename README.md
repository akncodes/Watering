# Firebase-Powered 24/7 Smart Watering Station

An enterprise-grade, real-time IoT watering controller system integrating a Next.js web dashboard with an ESP32 micro-controller over a persistent, low-power **Firebase Realtime Database stream**. 

Perfect for 24/7 operations: the ESP32 doesn't poll, it listens. Valves turn ON/OFF instantly, data consumption is practically zero, and it bypasses Vercel free tier execution limits entirely!

---

## 🛠️ Step 1: Create a Free Firebase Database

Setting up your database takes less than 2 minutes and is 100% free:

1. Open the [Firebase Console](https://console.firebase.google.com/) and click **Add Project**. Follow the prompts to create a free project.
2. Once created, look at the left sidebar under *Build* and click **Realtime Database**.
3. Click **Create Database**, select your database location, and click Next.
4. Choose **Start in test mode** (this allows the ESP32 and Next.js to communicate instantly) and click **Enable**.
5. Copy your **Database URL** from the top of the panel (e.g. `https://my-watering-default-rtdb.firebaseio.com/`). This is what you will enter on your website and flash to your ESP32!

### (Optional) Find Your Database Secret for High Security:
If you want to protect your database:
- Go to Project Settings (Gear icon next to Project Overview) -> **Service Accounts** tab.
- Click **Database Secrets** in the secondary sub-menu.
- Click **Show** next to your secret key, copy it, and paste it into the `DATABASE_SECRET` parameter of your ESP32 code.

---

## 💻 Step 2: Install the Arduino ESP32 Client Library

Before flashing your micro-controller, install the highly optimized Firebase C++ client library:

1. Open the **Arduino IDE**.
2. Go to **Sketch** -> **Include Library** -> **Manage Libraries...**
3. In the search box, type exactly: **`Firebase ESP32 Client`**
4. Look for the library authored by **`Mobizt`** and click **Install** (make sure to choose the latest version, v4.x.x).
5. (If prompted to install additional dependency libraries like `Signer`, click **Install All**).

---

## 🔌 Step 3: Configure & Flash the Firmware

1. Open [esp32/esp32.ino](file:///c:/Users/imabh/OneDrive/Documents/esp32-control/esp32/esp32.ino) in Arduino IDE.
2. Update your local home Wi-Fi details:
   ```cpp
   #define WIFI_SSID "YOUR_WIFI_SSID"
   #define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
   ```
3. Enter your unique Firebase URL (strip any `https://` prefix or trailing slashes):
   ```cpp
   #define DATABASE_URL "your-project-default-rtdb.firebaseio.com"
   ```
4. If you copied your database secret in Step 1, paste it into `DATABASE_SECRET`. If using open test rules, leave it blank:
   ```cpp
   #define DATABASE_SECRET ""
   ```
5. Select your active board COM **Port**, choose your board model (e.g., **ESP32 Dev Module**), open the **Serial Monitor** at **115200** baud, and hit **Upload** (right-arrow button)!

---

## 🌐 Step 4: Run the Next.js Dashboard

### 1. Run Locally
Execute the following commands at the root of the folder:
```bash
npm install
npm run dev
```

### 2. Enter Database Credentials in the Web UI
- Open [http://localhost:3000](http://localhost:3000).
- If your database is new, you'll see a gorgeous **Connect Your Firebase Database** wizard card.
- Paste your database URL (e.g. `your-watering-rtdb.firebaseio.com`) and click **Connect Node**!
- You can instantly toggle **Simulate Device** at the top right to test the glowing neon controls, circular status gauges, and millisecond system logs immediately without hardware!

### 3. Deploy to Vercel (100% Free WAN Control)
- Push this code repository to your GitHub.
- Go to [Vercel](https://vercel.com/), import your repository, and click **Deploy**.
- **Open your Vercel URL on your mobile phone's cell network from anywhere on earth—you can now control your watering valves 24/7!**

---

## 🔌 Valve Hardware Pin Schema

Connect your physical watering valve/relay module to these pins:

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
                                                    AC Water Valve
                                                   (NO / COM Terminals)
```
*(The board's built-in blue LED is also linked directly to GPIO2, which will turn ON and OFF in sync with your valve commands!)*
