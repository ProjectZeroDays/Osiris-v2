import type { ComponentType, SVGProps } from "react";
import type { SecurityToolId } from "@/config/security-tools";
import {
  Ban, Database, Fingerprint, Network, Radar, Share2,
  ShieldCheck, Smartphone, Tv, Video, Workflow,
} from "lucide-react";

// The ProjectZeroDays repos get neutral custom marks so the tree does not
// depend on vendor logo licensing. Everything else uses lucide-react.
import { DedSecCctvIcon } from "./DedSecCctvIcon";
import { ExploitIndexIcon } from "./ExploitIndexIcon";
import { SpyTvIcon } from "./SpyTvIcon";
import { PagasusProIcon } from "./PagasusProIcon";
import { RufloIcon } from "./RufloIcon";
import { QuantumCliIcon } from "./QuantumCliIcon";
import { NrSuiteIcon, StrykerAppIcon } from "./NrSuiteIcon";
import { DroneRidIcon, CopCamIcon } from "./DroneRidIcon";
import { FlockIcon, HibfIcon } from "./FlockIcon";
import { PlateOcrIcon, CameraFeedIcon, WifiIcon } from "./PlateOcrIcon";
import { ScannerIcon, CellTowerIcon, PoliceIcon } from "./CivicIcon";
import { AiProvidersIcon } from "./AiProvidersIcon";
import { ToolCollectionIcon } from "./ToolCollectionIcon";

export const TOOL_ICONS: Record<
  SecurityToolId,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  shodan: Radar,
  zenmap: Network,
  metasploit: ShieldCheck,
  maltego: Share2,
  sherlock: Fingerprint,
  "dedsec-cctv": DedSecCctvIcon,
  "exploit-index": ExploitIndexIcon,
  spytv: SpyTvIcon,
  "pagasus-pro": PagasusProIcon,
  ruflo: RufloIcon,
  "quantum-cli": QuantumCliIcon,
  nrsuite: NrSuiteIcon,
  strykerapp: StrykerAppIcon,
  "esp32-drone-rid": DroneRidIcon,
  "esp32-surveillance-cams": CopCamIcon,
  "flock-detector": FlockIcon,
  "haveibeenflocked": HibfIcon,
  "plate-ocr": PlateOcrIcon,
  "camera-feed": CameraFeedIcon,
  wifite3: WifiIcon,
  "scanner-feeds": ScannerIcon,
  "imsi-catcher": CellTowerIcon,
  "police-reports": PoliceIcon,
  "ai-settings": AiProvidersIcon,
  "tool-collection": ToolCollectionIcon,
};
