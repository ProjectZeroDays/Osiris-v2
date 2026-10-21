"use client";

import type { ComponentType } from "react";
import type { SecurityToolId } from "@/config/security-tools";

import { ReportImportWindow } from "./windows/ReportImportWindow";
import { ShodanWindow } from "./windows/ShodanWindow";
import { SherlockWindow } from "./windows/SherlockWindow";
import { ExploitIndexWindow } from "./windows/ExploitIndexWindow";
import {
  ZenmapWindow,
  MaltegoWindow,
  DedSecCctvWindow,
  RufloWindow,
} from "./windows/other-windows";
import {
  JsonImportWindow,
  Wifite3Window,
  QuantumWindow,
} from "./windows/sensor-windows";
import {
  ScannerFeedsWindow,
  CellAnomaliesWindow,
  PoliceReportsWindow,
} from "./windows/civic-windows";
import { AiProvidersWindow } from "./windows/AiSettingsWindow";
import { ToolCollectionWindow } from "./windows/ToolCollectionWindow";

/**
 * The window registry.
 *
 * A tool gets a window by being listed here. The window shell, the
 * primitives, the drag, the resize and the close are the shell's job; a
 * registry entry is only the body.
 */
export const TOOL_WINDOWS: Partial<Record<SecurityToolId, ComponentType>> = {
  shodan: ShodanWindow,
  zenmap: ZenmapWindow,
  metasploit: () => (
    <ReportImportWindow
      tool="metasploit"
      capability="labReport.import"
      tabs={["import report", "findings"]}
      placeholder='{\n  "findings": []\n}'
    />
  ),
  maltego: MaltegoWindow,
  sherlock: SherlockWindow,
  "dedsec-cctv": DedSecCctvWindow,
  "exploit-index": ExploitIndexWindow,
  spytv: () => (
    <ReportImportWindow
      tool="spytv"
      capability="defenseReport.import"
      tabs={["import report", "advisories"]}
      findingsLabel="Advisories"
    />
  ),
  "pagasus-pro": () => (
    <ReportImportWindow
      tool="pagasus-pro"
      capability="deviceAudit.importMinimized"
      tabs={["import audit", "minimized view"]}
      findingsLabel="Audit findings"
    />
  ),
  ruflo: RufloWindow,

  // v5 -- network and sensor extensions
  nrsuite: () => (
    <JsonImportWindow
      tool="nrsuite"
      capability="pcap.importSummary"
      tabs={["import summary", "flows"]}
      resultTab="flows"
      label="Paste the nrSuite summary JSON"
      placeholder='{\n  "flows": []\n}'
      columns={[
        { key: "src", label: "Source" },
        { key: "dst", label: "Destination" },
        { key: "proto", label: "Proto" },
        { key: "dstPort", label: "Port" },
        { key: "sni", label: "SNI" },
      ]}
      notice={{
        tone: "warn",
        text: "A raw pcap is never imported. Summarise it on your own host and bring the JSON.",
      }}
    />
  ),
  strykerapp: () => (
    <JsonImportWindow
      tool="strykerapp"
      capability="report.importMutationSummary"
      tabs={["import mutation", "import coverage"]}
      resultTab="import coverage"
      label="Paste the Stryker report JSON"
      placeholder='{\n  "files": {}\n}'
      columns={[
        { key: "file", label: "File" },
        { key: "mutants", label: "Mutants" },
        { key: "killed", label: "Killed" },
        { key: "survived", label: "Survived" },
      ]}
      notice={{
        tone: "info",
        text: "JSON only. An HTML report carries its own JavaScript, and that is never executed here.",
      }}
    />
  ),

  // v6 -- drone Remote ID and surveillance mapping
  "esp32-drone-rid": () => (
    <JsonImportWindow
      tool="esp32-drone-rid"
      capability="rid.listDrones"
      tabs={["live drones", "operators", "track"]}
      resultTab="live drones"
      label="Paste the decoded Remote ID frames"
      placeholder='{\n  "frames": []\n}'
      columns={[
        { key: "uasId", label: "UAS ID" },
        { key: "altM", label: "Alt (m)" },
        { key: "speedMps", label: "Speed" },
        { key: "headingDeg", label: "Heading" },
        { key: "sourceDevice", label: "Device" },
      ]}
      notice={{
        tone: "info",
        text: "The frames are decoded by firmware on the operator's own device. The operator position is part of the broadcast, not a guess.",
      }}
    />
  ),
  "esp32-surveillance-cams": () => (
    <JsonImportWindow
      tool="esp32-surveillance-cams"
      capability="surveillance.listDevices"
      tabs={["devices", "enrich"]}
      resultTab="devices"
      label="Paste the OUI detections"
      placeholder='{\n  "detections": []\n}'
      columns={[
        { key: "mac", label: "MAC" },
        { key: "vendor", label: "Vendor" },
        { key: "deviceClass", label: "Class" },
        { key: "attribution", label: "Attribution" },
        { key: "confidenceScore", label: "Conf." },
      ]}
      notice={{
        tone: "warn",
        text: "A detection is a guess about what a device is. The attribution tier is never raised by the platform.",
      }}
    />
  ),

  // v7 -- Flock and ALPR mapping
  "flock-detector": () => (
    <JsonImportWindow
      tool="flock-detector"
      capability="flock.listCameras"
      tabs={["cameras", "deflock export", "geojson export"]}
      resultTab="cameras"
      label="Paste the detector output"
      placeholder='{\n  "detections": []\n}'
      columns={[
        { key: "mac", label: "MAC" },
        { key: "confidence", label: "Conf." },
        { key: "method", label: "Method" },
        { key: "attribution", label: "Attribution" },
        { key: "lastSeen", label: "Last seen" },
      ]}
      notice={{
        tone: "info",
        text: "Flock cameras are static, so detections are long-lived and deduplicated by MAC and position.",
      }}
    />
  ),
  "haveibeenflocked": () => (
    <JsonImportWindow
      tool="haveibeenflocked"
      capability="hibf.listReports"
      tabs={["lookup", "report", "list"]}
      resultTab="list"
      label="Paste the sighting reports"
      placeholder='{\n  "reports": []\n}'
      columns={[
        { key: "mac", label: "MAC" },
        { key: "vendor", label: "Vendor" },
        { key: "attribution", label: "Attribution" },
        { key: "lastSeen", label: "Last seen" },
      ]}
      notice={{
        tone: "warn",
        text: "A published sighting tells a network where its cameras are. Publishing is a separate, explicit act.",
      }}
    />
  ),
  "plate-ocr": () => (
    <JsonImportWindow
      tool="plate-ocr"
      capability="plate.listEvents"
      tabs={["recognize", "edge events"]}
      resultTab="edge events"
      label="Paste the recognised plates"
      placeholder='{\n  "events": []\n}'
      columns={[
        { key: "plate", label: "Plate" },
        { key: "vehicle", label: "Vehicle" },
        { key: "confidence", label: "Conf." },
        { key: "edgeId", label: "Edge" },
      ]}
      notice={{
        tone: "warn",
        text: "A plate is a person's movement, read off a road. Retention is short and the reading is never a fact about a person.",
      }}
    />
  ),
  "camera-feed": () => (
    <JsonImportWindow
      tool="camera-feed"
      capability="feed.listFeeds"
      tabs={["feed list", "embed player"]}
      resultTab="feed list"
      label="Paste your camera configuration"
      placeholder='{\n  "feeds": []\n}'
      columns={[
        { key: "label", label: "Label" },
        { key: "region", label: "Region" },
        { key: "provider", label: "Provider" },
        { key: "streamType", label: "Type" },
      ]}
      notice={{
        tone: "info",
        text: "Only cameras you own. There is no public catalogue behind this window.",
      }}
    />
  ),

  // v10 -- wireless
  wifite3: Wifite3Window,
  "quantum-cli": QuantumWindow,

  // v13/v15 -- public and civic data.
  "scanner-feeds": ScannerFeedsWindow,
  "imsi-catcher": CellAnomaliesWindow,
  "police-reports": PoliceReportsWindow,

  // v13 -- the platform's own model providers.
  "ai-settings": AiProvidersWindow,

  // The wide tool collection, behind a worker.
  "tool-collection": ToolCollectionWindow,
};

/** The tools that have a window. */
export const TOOLS_WITH_WINDOWS = Object.keys(TOOL_WINDOWS) as SecurityToolId[];
