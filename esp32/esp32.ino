/**
 * ESP32 Smart IoT Node Client Firmware (Global Cloud Upgrade)
 * 
 * Target Board: ESP32 Dev Module (or any standard ESP32 board)
 * Features:
 *  - Connects to Wi-Fi.
 *  - Acts as an HTTP Client polling your central Next.js server.
 *  - Supports secure HTTPS (Vercel deployments) by using WiFiClientSecure with SSL bypass.
 *  - Reports actual physical relay status (?esp32=true&actual=ON/OFF).
 *  - Fetches the desired state and updates GPIO2 instantly.
 *  - Uses non-blocking polling timer (millis()) to keep loops active.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// =========================================================================
// 1. WI-FI CREDENTIALS - UPDATE THESE FOR YOUR NETWORK
// =========================================================================
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// =========================================================================
// 2. CENTRAL HOST ROUTE - UPDATE THIS TO MATCH YOUR DEPLOYED NEXT.JS APP
// =========================================================================
// - For Local testing inside LAN: Use your laptop's private LAN IP (e.g. "http://192.168.29.80:3000/api/control")
// - For Production anywhere: Use your public Vercel domain (e.g. "https://my-esp32-dashboard.vercel.app/api/control")
const char* serverUrl = "https://your-deployed-app.vercel.app/api/control";

// Control Pin: GPIO2 (Standard Built-in Blue LED or Relay signal input pin)
const int relayPin = 2;

// Track device state in local memory
bool lightStatus = false;

// Polling configuration: Poll the cloud API every 2 seconds
unsigned long lastPollTime = 0;
const unsigned long pollInterval = 2000;

void setup() {
  // Initialize Serial interface for debugging
  Serial.begin(115200);
  delay(10);
  Serial.println("\n==================================");
  Serial.println("ESP32 Smart IoT Node Client Booting...");
  
  // Set relay pin as Output and set it to low initially (Safe default)
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);
  lightStatus = false;
  Serial.println("GPIO2 initialized as OUTPUT (LOW)");

  // Establish Wi-Fi Connection
  Serial.print("Connecting to Wi-Fi Network: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  // Flash built-in LED slowly while connecting to give visual feedback
  int flashCounter = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    flashCounter++;
    digitalWrite(relayPin, flashCounter % 2 == 0 ? HIGH : LOW);
    Serial.print(".");
  }
  
  // Connection successful, ensure LED is returned to low
  digitalWrite(relayPin, LOW);
  Serial.println("\nWi-Fi Connected successfully!");
  Serial.print("IP Address assigned: ");
  Serial.println(WiFi.localIP());
  Serial.println("==================================");
  Serial.println("Firmware in CLIENT mode. Beginning global cloud sync.");
  Serial.println("==================================");
}

void loop() {
  // Check if it's time to poll
  if (millis() - lastPollTime >= pollInterval) {
    lastPollTime = millis();
    
    // Check Wi-Fi Link Health before launching request
    if (WiFi.status() == WL_CONNECTED) {
      
      // We use WiFiClientSecure to process secure HTTPS requests (like Vercel URLs)
      WiFiClientSecure client;
      
      // Bypasses SSL certificate authority validation checks. 
      // This is necessary because root SSL certificates expire frequently and ESP32 
      // has limited clock storage to validate SSL certificates out-of-the-box.
      client.setInsecure(); 
      
      HTTPClient http;
      
      // Structure the endpoint query string
      // ?esp32=true marks this call as a micro-controller poll (updates heartbeat)
      // &actual=ON/OFF reports the current state back to the dashboard console
      String url = String(serverUrl) + "?esp32=true&actual=" + (lightStatus ? "ON" : "OFF");
      
      Serial.print("[CLOUD] Polling Relay... URL: ");
      Serial.println(url);
      
      // Connect to server
      if (http.begin(client, url)) {
        // Send HTTP GET request
        int httpCode = http.GET();
        
        if (httpCode > 0) {
          Serial.printf("[CLOUD] Response HTTP Code: %d\n", httpCode);
          
          if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            payload.trim();
            payload.toUpperCase();
            
            Serial.print("[CLOUD] Desired State Command: ");
            Serial.println(payload);
            
            // Align physical state to what the server requested
            if (payload == "ON") {
              digitalWrite(relayPin, HIGH);
              if (!lightStatus) {
                lightStatus = true;
                Serial.println("[ACTION] Relay physically switched ON");
              }
            } else if (payload == "OFF") {
              digitalWrite(relayPin, LOW);
              if (lightStatus) {
                lightStatus = false;
                Serial.println("[ACTION] Relay physically switched OFF");
              }
            }
          }
        } else {
          Serial.printf("[CLOUD] HTTP Request Failed. Error: %s\n", http.errorToString(httpCode).c_str());
        }
        
        // Terminate HTTP transaction
        http.end();
      } else {
        Serial.println("[CLOUD] Error: Unable to open HTTP connection.");
      }
      
    } else {
      Serial.println("[WIFI] Warning: Connection lost. Re-establishing link...");
      WiFi.disconnect();
      WiFi.reconnect();
    }
  }
  
  // short yield delay for ESP32 operating system core background tasks
  delay(10);
}
