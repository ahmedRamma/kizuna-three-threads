#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "WIFI";
const char* WIFI_PASS = "PASSWORD";
const char* API = "http://SERVER_IP:8000/api/ingest";
const char* FARM_ID = "f1";
const int TRIG = 5, ECHO = 18, RELAY = 26, FLOW = 27;
const float TANK_HEIGHT_CM = 120;
volatile int pulses = 0;
void IRAM_ATTR onPulse() { pulses++; }

float levelPct() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  float cm = pulseIn(ECHO, HIGH, 30000) * 0.0343 / 2;
  return constrain(100 * (1 - cm / TANK_HEIGHT_CM), 0, 100);
}

void setup() {
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); pinMode(RELAY, OUTPUT);
  pinMode(FLOW, INPUT_PULLUP);
  attachInterrupt(FLOW, onPulse, FALLING);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  pulses = 0; delay(10000);
  float flowLpm = (pulses / 7.5) * 6;
  HTTPClient http;
  http.begin(API);
  http.addHeader("Content-Type", "application/json");
  String body = String("{\"farm_id\":\"") + FARM_ID + "\",\"level_pct\":" + levelPct() +
                ",\"pump_on\":" + (digitalRead(RELAY) ? "true" : "false") +
                ",\"flow_lpm\":" + flowLpm + "}";
  http.POST(body);
  http.end();
}
