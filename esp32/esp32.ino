/**
 * ESP32 Smart IoT Node Controller Firmware
 * 
 * Target Board: ESP32 Dev Module (or any standard ESP32 board)
 * Features:
 *  - Connects to Wi-Fi.
 *  - Controls standard Relay or Built-in LED on GPIO2 (active-high).
 *  - Serves HTTP endpoints (/on, /off, /status) returning plain text.
 *  - Serves wildcard CORS headers to prevent browser-level fetch blocks.
 *  - Outputs setup details and actions to the Serial Monitor at 115200 baud.
 */

#include <WiFi.h>
#include <WebServer.h>

// ==========================================
// WIFI CREDENTIALS - UPDATE THESE FOR YOUR NETWORK
// ==========================================
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Create WebServer listening on standard port 80
WebServer server(80);

// Control Pin: GPIO2 (Standard Built-in Blue LED on most ESP32 Dev Boards)
// Connect an active-high relay signal pin here to control a physical mains load.
const int relayPin = 2;

// Track device state in memory
bool lightStatus = false;

/**
 * Common helper to inject CORS headers and send response.
 * This completely avoids browser security blocks.
 */
void sendResponse(int statusCode, const String& contentType, const String& content) {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.send(statusCode, contentType, content);
}

/**
 * Handle root URL GET request
 */
void handleRoot() {
  String msg = "ESP32 IoT Node Active.\n";
  msg += "Available endpoints:\n";
  msg += " - GET /on     -> Turn relay ON\n";
  msg += " - GET /off    -> Turn relay OFF\n";
  msg += " - GET /status -> Check status (ON/OFF)\n";
  sendResponse(200, "text/plain", msg);
}

/**
 * Route: GET /on
 * Turns the relay pin HIGH (ON) and responds to client.
 */
void handleOn() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  digitalWrite(relayPin, HIGH);
  lightStatus = true;
  Serial.println("ACTION: GPIO2 turned HIGH (ON)");
  server.send(200, "text/plain", "ON");
}

/**
 * Route: GET /off
 * Turns the relay pin LOW (OFF) and responds to client.
 */
void handleOff() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  digitalWrite(relayPin, LOW);
  lightStatus = false;
  Serial.println("ACTION: GPIO2 turned LOW (OFF)");
  server.send(200, "text/plain", "OFF");
}

/**
 * Route: GET /status
 * Returns current status as raw plain text: "ON" or "OFF"
 */
void handleStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  Serial.print("POLL: Status requested. Hardware is ");
  Serial.println(lightStatus ? "ON" : "OFF");
  
  if (lightStatus) {
    server.send(200, "text/plain", "ON");
  } else {
    server.send(200, "text/plain", "OFF");
  }
}

/**
 * Route: OPTIONS / (Pre-flight CORS requests)
 * Browsers sometimes perform pre-flight OPTIONS checks before fetching.
 * Responding 204 No Content with CORS headers prevents preflight errors.
 */
void handleOptions() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.send(204);
}

void setup() {
  // Initialize Serial interface for debugging
  Serial.begin(115200);
  delay(10);
  Serial.println("\n==================================");
  Serial.println("ESP32 Smart IoT Node Booting...");
  
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

  // Setup Web Server Endpoints
  server.on("/", HTTP_GET, handleRoot);
  server.on("/on", HTTP_GET, handleOn);
  server.on("/off", HTTP_GET, handleOff);
  server.on("/status", HTTP_GET, handleStatus);
  
  // Handle CORS Preflights
  server.on("/on", HTTP_OPTIONS, handleOptions);
  server.on("/off", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_OPTIONS, handleOptions);

  // Start HTTP daemon
  server.begin();
  Serial.println("HTTP Web Server running on Port 80");
  Serial.println("Ready to process incoming commands.");
  Serial.println("==================================");
}

void loop() {
  // Run background client loop to poll HTTP requests
  server.handleClient();
  delay(2); // Short delay to yield CPU slice to Wi-Fi core stack
}
