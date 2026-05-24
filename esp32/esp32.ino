/**
 * ESP32 Smart Watering Station Firmware (24/7 Firebase Stream Edition)
 * 
 * Target Board: ESP32 Dev Module (or any standard ESP32 board)
 * Required Library: "Firebase ESP32 Client" (by Mobizt) v4.x.x
 * Features:
 *  - Establishes a persistent Server-Sent Events (SSE) stream connection with Firebase RTDB.
 *  - Intercepts state changes (/watering/desiredState) instantly (under 100ms latency).
 *  - Publishes physical valve feedback (/watering/actualState) and server heartbeat (/watering/lastSeen).
 *  - Fully handles automatic Wi-Fi reconnects for uninterrupted 24/7 operation.
 *  - Supports both Open Rules (test_mode) and Database Secret legacy tokens.
 */

#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// Helper addons for token generation progress and RTDB formatting (Built into the Mobizt library)
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// =========================================================================
// 1. WI-FI NETWORK CREDENTIALS
// =========================================================================
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// =========================================================================
// 2. FIREBASE REALTIME DATABASE CONFIGURATION
// =========================================================================
// - DATABASE_URL: Strip any "https://" or trailing slashes.
//   Example: "my-watering-rtdb-default-rtdb.firebaseio.com"
#define DATABASE_URL "watering-3cede-default-rtdb.firebaseio.com"

// - Firebase Authentication Options:
//   Option A (Public Rules): If your rules are { ".read": true, ".write": true }, 
//                            leave DATABASE_SECRET blank.
//   Option B (Secure Secret): Enter your Legacy Database Secret below.
//                            Find it in Firebase Console -> Project Settings -> Service Accounts -> Database Secrets.
#define DATABASE_SECRET "BIns-_KHETQlVPFDwCyRc3qvydKV2RSh__BUbq__9ePpZygAmR-MQC25uKVbb7Ih41xUvRNMS-dq7LOj_48a8I0"

// GPIO pin mappings: Pin 2 operates the built-in LED and/or the 5V Relay board
const int relayPin = 2;

// Local state variable
bool valveStatus = false;

// Heartbeat timers: Send actual status report every 10 seconds to save power
unsigned long lastHeartbeatTime = 0;
const unsigned long heartbeatInterval = 10000;

// Firebase state pointers
FirebaseData streamData; // Dedicated stream object for continuous listening
FirebaseData reportData; // Dedicated transaction object for periodic writing
FirebaseAuth auth;
FirebaseConfig config;

// =========================================================================
// FIREBASE STREAM CALLBACK HANDLER
// Intercepts instant database changes dispatched from your Next.js dashboard
// =========================================================================
void streamCallback(FirebaseStream data) {
  Serial.printf("\n[STREAM] Event Fired! Path: %s | Event: %s | Type: %s\n", 
                data.streamPath().c_str(), 
                data.eventType().c_str(), 
                data.dataType().c_str());
  
  if (data.dataType() == "string") {
    String value = data.stringData();
    value.trim();
    value.toUpperCase();
    
    Serial.print("[STREAM] Desired Valve State: ");
    Serial.println(value);
    
    if (value == "ON") {
      digitalWrite(relayPin, HIGH);
      if (!valveStatus) {
        valveStatus = true;
        Serial.println("[ACTION] Relay physically CLOSED - WATERING ACTIVE!");
      }
    } else if (value == "OFF") {
      digitalWrite(relayPin, LOW);
      if (valveStatus) {
        valveStatus = false;
        Serial.println("[ACTION] Relay physically OPENED - WATERING SHUTDOWN!");
      }
    }
  }
}

void streamTimeoutCallback(bool timeout) {
  if (timeout) {
    Serial.println("[STREAM] Connection timeout. Resuming background stream listener...");
  }
}

void setup() {
  Serial.begin(115200);
  delay(10);
  Serial.println("\n==================================");
  Serial.println("ESP32 Smart Watering boot sequence...");
  Serial.println("==================================");

  // Initialize GPIO relay control pin
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW); // Safe default: closed valve
  valveStatus = false;

  // Initialize Wi-Fi
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int flash = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(450);
    flash++;
    digitalWrite(relayPin, flash % 2 == 0 ? HIGH : LOW); // Visual flashing LED check
    Serial.print(".");
  }
  
  digitalWrite(relayPin, LOW); // Flash end, return to off
  Serial.println("\nWi-Fi Link established!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Configure Firebase Core Parameters
  config.database_url = DATABASE_URL;
  
  // Choose correct Auth mode
  if (strlen(DATABASE_SECRET) > 0) {
    // Option B: Authenticate using legacy database secret token
    config.signer.tokens.legacy_token = DATABASE_SECRET;
    Serial.println("[AUTH] Authenticating with Legacy Database Secret token.");
  } else {
    // Option A: Running in public rule test mode
    config.signer.test_mode = true;
    Serial.println("[AUTH] Running in Public Rule Test Mode (No database secret).");
  }

  // Set Wi-Fi auto-reconnection callback parameters
  Firebase.reconnectWiFi(true);
  
  // Start Firebase engine
  Firebase.begin(&config, &auth);

  Serial.println("[FIREBASE] Initializing persistent stream listener on: /watering/desiredState");
  
  // Establish connection stream
  if (!Firebase.RTDB.beginStream(&streamData, "/watering/desiredState")) {
    Serial.printf("[STREAM] Error opening stream: %s\n", streamData.errorReason().c_str());
  } else {
    Serial.println("[STREAM] Persistent Server-Sent Events stream connected successfully.");
    Firebase.RTDB.setStreamCallback(&streamData, streamCallback, streamTimeoutCallback);
  }
  
  Serial.println("==================================");
}

void loop() {
  // Check if it is time to report a heartbeat and feedback physical valve status
  if (millis() - lastHeartbeatTime >= heartbeatInterval) {
    lastHeartbeatTime = millis();
    
    if (WiFi.status() == WL_CONNECTED && Firebase.ready()) {
      Serial.println("[HEARTBEAT] Publishing node state to database...");
      
      // Update actual valve state
      if (Firebase.RTDB.setString(&reportData, "/watering/actualState", valveStatus ? "ON" : "OFF")) {
        Serial.printf("[HEARTBEAT] actualState updated -> %s\n", valveStatus ? "ON" : "OFF");
      } else {
        Serial.printf("[HEARTBEAT] Error updating actualState: %s\n", reportData.errorReason().c_str());
      }
      
      // Update server-side timestamp so the dashboard can compute precise uptimeheartbeats
      // setTimestamp writes the highly accurate Firebase Server Epoch time (millisecond resolution)
      if (Firebase.RTDB.setTimestamp(&reportData, "/watering/lastSeen")) {
        Serial.println("[HEARTBEAT] Server lastSeen timestamp synchronized.");
      } else {
        Serial.printf("[HEARTBEAT] Error synchronizing timestamp: %s\n", reportData.errorReason().c_str());
      }
    }
  }
  
  // Yield core CPU processor slices to running background tasks
  delay(12);
}
