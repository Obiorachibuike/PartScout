import type { PartCategory } from "@/types/research";

/**
 * Phone-parts taxonomy.
 *
 * For every part category we keep:
 *  - the aliases technicians actually type (so natural-language queries parse),
 *  - the search "angle" terms used to build targeted web queries,
 *  - the compatibility checklist that the compatibility engine evaluates. These
 *    checklists are the reason PartScout never uses a rule like
 *    "same phone size = compatible".
 */

export interface ChecklistItem {
  id: string;
  label: string;
  /** Why this dimension matters for interchangeability. */
  rationale: string;
  /** Relative importance when scoring evidence (0..1). */
  weight: number;
  /** Terms that indicate a page/claim discusses this dimension. */
  indicators: string[];
}

export interface PartCategoryDefinition {
  id: PartCategory;
  label: string;
  shortLabel: string;
  plural: string;
  aliases: string[];
  /** Extra query terms appended for this category. */
  searchAngles: string[];
  /** Attributes suppliers publish for this part. */
  specKeys: string[];
  checklist: ChecklistItem[];
  /** Higher risk categories demand stronger evidence before we claim support. */
  riskWeight: number;
  group: "displays" | "power" | "boards" | "cameras" | "audio" | "body" | "sensors" | "other";
}

const screenChecklist: ChecklistItem[] = [
  {
    id: "exact_phone_model",
    label: "Exact phone model",
    rationale: "Panels are cut and bonded per model; a neighbour model rarely lines up.",
    weight: 1,
    indicators: ["galaxy", "iphone", "redmi", "model", "sm-a", "sm-s", "sm-g"],
  },
  {
    id: "model_variant",
    label: "Model variant / regional suffix",
    rationale: "4G vs 5G and regional SKUs can use different panels even when the body looks identical.",
    weight: 0.95,
    indicators: ["4g", "5g", "variant", "region", "ds", "dual sim", "international", "us version"],
  },
  {
    id: "display_model",
    label: "Display / part model number",
    rationale: "The part number printed on the flex is the strongest identifier.",
    weight: 0.9,
    indicators: ["gh82-", "part number", "display model", "lcd model", "assembly number"],
  },
  {
    id: "panel_technology",
    label: "Panel technology (OLED / LCD / IPS / TFT)",
    rationale: "Mixed technologies usually differ in driver IC, brightness and connector pinout.",
    weight: 0.7,
    indicators: ["oled", "amoled", "super amoled", "lcd", "ips", "tft", "incell", "in-cell"],
  },
  {
    id: "size",
    label: "Display size",
    rationale: "A 0.1\" difference changes the frame and bezel alignment.",
    weight: 0.6,
    indicators: ['6.', '"', "inch", "screen size", "display size"],
  },
  {
    id: "resolution",
    label: "Resolution",
    rationale: "Different resolution implies a different driver IC and flex.",
    weight: 0.55,
    indicators: ["1080", "2400", "720", "2340", "resolution", "pixels"],
  },
  {
    id: "connector",
    label: "Connector / flex configuration",
    rationale: "Pin count and flex length must match the board socket.",
    weight: 0.85,
    indicators: ["connector", "flex", "fpc", "pin", "socket", "ribbon"],
  },
  {
    id: "touch_controller",
    label: "Touch controller / digitizer",
    rationale: "Digitizer IC mismatch breaks touch even when video works.",
    weight: 0.6,
    indicators: ["touch", "digitizer", "touchscreen", "touch ic"],
  },
  {
    id: "frame",
    label: "Frame included / with-frame vs frame-less",
    rationale: "Assembly type must match the repair being performed.",
    weight: 0.6,
    indicators: ["with frame", "frame", "service pack", "assembly", "no frame", "frame-less"],
  },
  {
    id: "display_revision",
    label: "Display revision / production lot",
    rationale: "Revision changes can alter brightness tables or flex routing.",
    weight: 0.45,
    indicators: ["rev", "revision", "ver.", "version", "lot"],
  },
];

const batteryChecklist: ChecklistItem[] = [
  {
    id: "battery_model",
    label: "Battery model code",
    rationale: "The printed code (e.g. BN5A) is the primary identifier.",
    weight: 1,
    indicators: ["bn", "battery model", "part number", "model"],
  },
  {
    id: "voltage",
    label: "Nominal voltage",
    rationale: "Voltage mismatch can damage the charging IC or the cell.",
    weight: 0.85,
    indicators: ["v", "volt", "voltage", "3.8", "3.85", "3.87", "4.4"],
  },
  {
    id: "capacity",
    label: "Capacity (mAh)",
    rationale: "Capacity may differ between suppliers while still being compatible, but large gaps usually indicate a different part.",
    weight: 0.6,
    indicators: ["mah", "capacity", "amp hour", "ah"],
  },
  {
    id: "connector",
    label: "Connector type / pin count",
    rationale: "Board-side sockets differ across generations.",
    weight: 0.9,
    indicators: ["connector", "flex cable", "fpc", "pin"],
  },
  {
    id: "dimensions",
    label: "Physical dimensions",
    rationale: "A larger cell will not sit in the chassis and can be punctured by the frame.",
    weight: 0.8,
    indicators: ["mm", "dimensions", "size", "thickness"],
  },
  {
    id: "device_model",
    label: "Device model numbers",
    rationale: "Explicit model lists from suppliers are the strongest compatibility signal.",
    weight: 1,
    indicators: ["sm-", "compatible with", "fits", "for galaxy", "for iphone"],
  },
  {
    id: "battery_revision",
    label: "Battery revision",
    rationale: "Cell supplier revisions can change the BMS board.",
    weight: 0.5,
    indicators: ["rev", "revision", "bms", "protection board"],
  },
];

const flexChecklist = (component: string, extra: ChecklistItem[] = []): ChecklistItem[] => [
  {
    id: "charging_port",
    label: `${component} connector type`,
    rationale: "USB-C, micro-USB, Lightning and 30-pin variants are not interchangeable.",
    weight: 1,
    indicators: ["usb-c", "usb type-c", "type-c", "micro usb", "micro-usb", "lightning", "30 pin", "connector"],
  },
  {
    id: "board_design",
    label: "Board design / layout",
    rationale: "Even same-model flexes differ between board revisions.",
    weight: 0.9,
    indicators: ["board", "revision", "layout", "v1", "v2", "rev"],
  },
  {
    id: "flex_layout",
    label: "Flex layout / routing",
    rationale: "Fold points and length must match the chassis routing.",
    weight: 0.85,
    indicators: ["flex", "fpc", "ribbon", "routing", "cable"],
  },
  {
    id: "connector",
    label: "Connector count and position",
    rationale: "A missing or relocated socket prevents assembly.",
    weight: 0.85,
    indicators: ["connector", "socket", "pin", "plug"],
  },
  {
    id: "microphone_placement",
    label: "Microphone / sensor placement",
    rationale: "Charging flexes frequently carry the mic, so placement is model specific.",
    weight: 0.6,
    indicators: ["microphone", "mic", "sensor", "proximity", "antenna contact"],
  },
  {
    id: "device_model",
    label: "Device model numbers",
    rationale: "Supplier model lists are the primary evidence of compatibility.",
    weight: 1,
    indicators: ["sm-", "compatible with", "fits", "for galaxy", "for iphone", "replacement for"],
  },
  ...extra,
];

const cameraChecklist: ChecklistItem[] = [
  {
    id: "camera_module",
    label: "Camera module / part number",
    rationale: "The module code identifies the exact sensor assembly.",
    weight: 1,
    indicators: ["module", "part number", "camera model", "sensor model"],
  },
  {
    id: "sensor",
    label: "Sensor and megapixel rating",
    rationale: "Sensor changes alter the module stack height and connector.",
    weight: 0.75,
    indicators: ["mp", "megapixel", "sensor", "sony", "imx", "isocell"],
  },
  {
    id: "connector",
    label: "Connector / flex",
    rationale: "Connector pinout must match the board socket.",
    weight: 0.85,
    indicators: ["connector", "flex", "fpc", "pin"],
  },
  {
    id: "dimensions",
    label: "Physical dimensions / stack height",
    rationale: "Modules with different stack heights do not fit the housing cutout.",
    weight: 0.7,
    indicators: ["mm", "dimensions", "stack", "height"],
  },
  {
    id: "software",
    label: "Software compatibility",
    rationale: "A physically fitting module can still fail calibration or OIS activation.",
    weight: 0.65,
    indicators: ["calibration", "firmware", "ois", "software", "error"],
  },
  {
    id: "device_model",
    label: "Device model numbers",
    rationale: "Explicit model lists are the strongest signal.",
    weight: 1,
    indicators: ["sm-", "compatible with", "for galaxy", "for iphone"],
  },
];

const backCoverChecklist: ChecklistItem[] = [
  {
    id: "device_dimensions",
    label: "Chassis dimensions",
    rationale: "Even 0.2 mm differences break clip engagement.",
    weight: 0.9,
    indicators: ["mm", "dimensions", "size", "chassis"],
  },
  {
    id: "camera_cutout",
    label: "Camera cutout layout",
    rationale: "Cutout count and position change between variants.",
    weight: 0.9,
    indicators: ["cutout", "camera hole", "lens opening", "camera ring"],
  },
  {
    id: "button_positions",
    label: "Button positions",
    rationale: "Volume/power gaskets are model specific.",
    weight: 0.7,
    indicators: ["button", "volume", "power", "side key", "gasket"],
  },
  {
    id: "sensor_openings",
    label: "Sensor / mic openings",
    rationale: "Missing openings block sensors or mics.",
    weight: 0.6,
    indicators: ["sensor", "microphone", "flash", "opening"],
  },
  {
    id: "variant",
    label: "Color and variant configuration",
    rationale: "Variant determines finish, translucent areas and included hardware.",
    weight: 0.55,
    indicators: ["color", "variant", "edition", "5g", "4g"],
  },
  {
    id: "material",
    label: "Material / frame configuration",
    rationale: "Glass, plastic and glass-with-frame assemblies differ in glue points.",
    weight: 0.6,
    indicators: ["glass", "plastic", "aluminium", "frame", "with frame", "adhesive"],
  },
];

const defaultChecklist = (label: string): ChecklistItem[] => [
  {
    id: "device_model",
    label: "Device model numbers",
    rationale: "Explicit model lists from suppliers are the strongest compatibility evidence.",
    weight: 1,
    indicators: ["sm-", "compatible with", "fits", "for galaxy", "for iphone", "replacement for"],
  },
  {
    id: "connector",
    label: "Connector / interface",
    rationale: "The physical interface must match the main board.",
    weight: 0.85,
    indicators: ["connector", "flex", "fpc", "pin", "socket"],
  },
  {
    id: "flex_layout",
    label: "Flex layout / mounting",
    rationale: `${label} routing is model specific.`,
    weight: 0.7,
    indicators: ["flex", "routing", "mount", "bracket", "adhesive"],
  },
  {
    id: "revision",
    label: "Hardware revision",
    rationale: "Revision changes can alter pinouts or acoustic chambers.",
    weight: 0.5,
    indicators: ["rev", "revision", "version"],
  },
];

export const PART_CATEGORY_DEFINITIONS: Record<PartCategory, PartCategoryDefinition> = {
  screen: {
    id: "screen",
    label: "Screen",
    shortLabel: "Screen",
    plural: "Screens",
    aliases: [
      "screen","screens","display","lcd","oled","amoled","touch screen","touchscreen","digitizer",
      "lcd assembly","display assembly","lcd screen","screen replacement","panel","glass digitizer",
      "service pack","screen assembly",
    ],
    searchAngles: [
      "screen compatibility",
      "LCD replacement compatible models",
      "display assembly compatible",
      "screen replacement",
      "display part number compatible phones",
    ],
    specKeys: ["panel technology", "size", "resolution", "connector", "frame", "revision"],
    checklist: screenChecklist,
    riskWeight: 0.9,
    group: "displays",
  },
  battery: {
    id: "battery",
    label: "Battery",
    shortLabel: "Battery",
    plural: "Batteries",
    aliases: ["battery", "batteries", "cell", "battery pack", "li-ion battery", "accumulator"],
    searchAngles: [
      "battery compatibility",
      "replacement battery compatible models",
      "battery part number compatible phones",
      "battery replacement",
    ],
    specKeys: ["voltage", "capacity", "connector", "dimensions", "model code"],
    checklist: batteryChecklist,
    riskWeight: 0.85,
    group: "power",
  },
  charging_flex: {
    id: "charging_flex",
    label: "Charging flex",
    shortLabel: "Charging flex",
    plural: "Charging flexes",
    aliases: [
      "charging flex","charge flex","charging port flex","charging connector flex","usb flex",
      "dock flex","charging ribbon","charging port","charging board flex","type-c flex",
    ],
    searchAngles: [
      "charging flex compatibility",
      "charging port flex compatible models",
      "charging flex replacement",
      "dock connector flex compatible",
    ],
    specKeys: ["connector type", "flex layout", "mic placement", "board revision"],
    checklist: flexChecklist("Charging port"),
    riskWeight: 0.8,
    group: "boards",
  },
  charging_board: {
    id: "charging_board",
    label: "Charging board",
    shortLabel: "Charging board",
    plural: "Charging boards",
    aliases: [
      "charging board","charge board","charging pcb","usb board","dock board","daughter board",
      "sub board","charging port board",
    ],
    searchAngles: [
      "charging board compatibility",
      "charging board replacement compatible models",
      "usb board for",
    ],
    specKeys: ["connector type", "board revision", "mounting"],
    checklist: flexChecklist("Charging port"),
    riskWeight: 0.8,
    group: "boards",
  },
  power_flex: {
    id: "power_flex",
    label: "Power flex",
    shortLabel: "Power flex",
    plural: "Power flexes",
    aliases: ["power flex", "power button flex", "on/off flex", "power volume flex", "power switch flex", "side button flex"],
    searchAngles: [
      "power flex compatibility",
      "power volume flex compatible models",
      "power button flex replacement",
    ],
    specKeys: ["button configuration", "flex layout", "connector", "revision"],
    checklist: flexChecklist("Power button", [
      {
        id: "button_configuration",
        label: "Button configuration",
        rationale: "Combined power+volume flexes are model specific.",
        weight: 0.9,
        indicators: ["power button", "volume", "buttons", "combined"],
      },
    ]),
    riskWeight: 0.7,
    group: "boards",
  },
  volume_flex: {
    id: "volume_flex",
    label: "Volume flex",
    shortLabel: "Volume flex",
    plural: "Volume flexes",
    aliases: ["volume flex", "volume button flex", "volume key flex", "volume switch flex"],
    searchAngles: ["volume flex compatibility", "volume button flex compatible models"],
    specKeys: ["button configuration", "flex layout", "connector"],
    checklist: flexChecklist("Volume button", [
      {
        id: "button_configuration",
        label: "Button configuration",
        rationale: "Number and spacing of keys must match the chassis.",
        weight: 0.85,
        indicators: ["volume", "button", "key", "rocker"],
      },
    ]),
    riskWeight: 0.7,
    group: "boards",
  },
  back_cover: {
    id: "back_cover",
    label: "Back cover",
    shortLabel: "Back cover",
    plural: "Back covers",
    aliases: ["back cover", "back glass", "rear cover", "back housing", "rear glass", "back panel", "battery cover"],
    searchAngles: [
      "back cover compatibility",
      "back glass replacement compatible models",
      "rear cover compatible models",
    ],
    specKeys: ["camera cutout", "button positions", "material", "variant"],
    checklist: backCoverChecklist,
    riskWeight: 0.6,
    group: "body",
  },
  back_glass: {
    id: "back_glass",
    label: "Back glass",
    shortLabel: "Back glass",
    plural: "Back glass",
    aliases: ["back glass", "rear glass", "rear panel glass", "back glass panel"],
    searchAngles: ["back glass compatibility", "back glass replacement compatible models"],
    specKeys: ["camera cutout", "adhesive", "variant"],
    checklist: backCoverChecklist,
    riskWeight: 0.6,
    group: "body",
  },
  housing: {
    id: "housing",
    label: "Housing",
    shortLabel: "Housing",
    plural: "Housings",
    aliases: ["housing", "frame", "midframe", "mid frame", "chassis", "back housing", "full housing", "bezel"],
    searchAngles: ["housing compatibility", "midframe compatible models", "chassis replacement"],
    specKeys: ["chassis dimensions", "camera cutout", "material", "variant"],
    checklist: backCoverChecklist,
    riskWeight: 0.7,
    group: "body",
  },
  camera: {
    id: "camera",
    label: "Camera",
    shortLabel: "Camera",
    plural: "Cameras",
    aliases: [
      "camera","rear camera","front camera","camera module","main camera","ultrawide","telephoto",
      "camera lens","selfie camera","camera glass","lens cover",
    ],
    searchAngles: [
      "camera module compatibility",
      "camera replacement compatible models",
      "camera part number compatible phones",
    ],
    specKeys: ["sensor", "megapixels", "connector", "dimensions"],
    checklist: cameraChecklist,
    riskWeight: 0.8,
    group: "cameras",
  },
  speaker: {
    id: "speaker",
    label: "Speaker",
    shortLabel: "Speaker",
    plural: "Speakers",
    aliases: ["speaker", "loudspeaker", "buzzer", "ringer", "earpiece", "ear speaker", "loud speaker", "bottom speaker"],
    searchAngles: ["speaker compatibility", "loudspeaker replacement compatible models", "earpiece speaker compatible"],
    specKeys: ["impedance", "connector", "dimensions"],
    checklist: defaultChecklist("Speaker"),
    riskWeight: 0.6,
    group: "audio",
  },
  microphone: {
    id: "microphone",
    label: "Microphone",
    shortLabel: "Microphone",
    plural: "Microphones",
    aliases: ["microphone", "mic", "mic flex", "microphone flex", "mic module"],
    searchAngles: ["microphone compatibility", "mic flex compatible models"],
    specKeys: ["connector", "mounting"],
    checklist: defaultChecklist("Microphone"),
    riskWeight: 0.6,
    group: "audio",
  },
  fingerprint: {
    id: "fingerprint",
    label: "Fingerprint component",
    shortLabel: "Fingerprint",
    plural: "Fingerprint components",
    aliases: ["fingerprint", "fingerprint sensor", "fingerprint flex", "home button", "biometric sensor", "touch id"],
    searchAngles: ["fingerprint sensor compatibility", "fingerprint flex compatible models"],
    specKeys: ["connector", "mounting", "software pairing"],
    checklist: defaultChecklist("Fingerprint"),
    riskWeight: 0.85,
    group: "sensors",
  },
  buttons: {
    id: "buttons",
    label: "Buttons",
    shortLabel: "Buttons",
    plural: "Buttons",
    aliases: ["button", "buttons", "power button", "volume button", "home button", "side key"],
    searchAngles: ["button replacement compatibility", "power button compatible models"],
    specKeys: ["button configuration", "material"],
    checklist: defaultChecklist("Button"),
    riskWeight: 0.5,
    group: "body",
  },
  sensors: {
    id: "sensors",
    label: "Sensors",
    shortLabel: "Sensors",
    plural: "Sensors",
    aliases: [
      "sensor","proximity sensor","light sensor","ambient sensor","gyroscope","accelerometer",
      "face id","iris scanner","hall sensor",
    ],
    searchAngles: ["sensor compatibility", "proximity sensor compatible models"],
    specKeys: ["connector", "mounting", "software pairing"],
    checklist: defaultChecklist("Sensor"),
    riskWeight: 0.85,
    group: "sensors",
  },
  antenna: {
    id: "antenna",
    label: "Antenna",
    shortLabel: "Antenna",
    plural: "Antennas",
    aliases: ["antenna", "antenna flex", "signal flex", "wifi antenna", "cellular antenna", "gps antenna"],
    searchAngles: ["antenna flex compatibility", "antenna replacement compatible models"],
    specKeys: ["connector", "routing"],
    checklist: defaultChecklist("Antenna"),
    riskWeight: 0.6,
    group: "sensors",
  },
  nfc: {
    id: "nfc",
    label: "NFC component",
    shortLabel: "NFC",
    plural: "NFC components",
    aliases: ["nfc", "nfc antenna", "nfc flex", "nfc module", "wireless payment coil"],
    searchAngles: ["nfc antenna compatibility", "nfc flex compatible models"],
    specKeys: ["connector", "coil placement"],
    checklist: defaultChecklist("NFC component"),
    riskWeight: 0.65,
    group: "sensors",
  },
  wireless_charging: {
    id: "wireless_charging",
    label: "Wireless charging component",
    shortLabel: "Wireless charging",
    plural: "Wireless charging components",
    aliases: [
      "wireless charging","wireless charging coil","qi coil","charging coil","wireless charging flex",
      "induction coil",
    ],
    searchAngles: ["wireless charging coil compatibility", "qi coil compatible models"],
    specKeys: ["coil type", "connector", "placement"],
    checklist: defaultChecklist("Wireless charging component"),
    riskWeight: 0.7,
    group: "power",
  },
  other: {
    id: "other",
    label: "Phone part",
    shortLabel: "Part",
    plural: "Phone parts",
    aliases: ["part", "component", "spare part", "replacement part"],
    searchAngles: ["compatibility", "replacement compatible models"],
    specKeys: ["connector", "model numbers"],
    checklist: defaultChecklist("Part"),
    riskWeight: 0.6,
    group: "other",
  },
};

export const PART_CATEGORY_LIST = Object.values(PART_CATEGORY_DEFINITIONS);

export function getPartCategory(id: PartCategory): PartCategoryDefinition {
  return PART_CATEGORY_DEFINITIONS[id] ?? PART_CATEGORY_DEFINITIONS.other;
}

export function partCategoryLabel(id: PartCategory, plural = false): string {
  const definition = getPartCategory(id);
  return plural ? definition.plural : definition.label;
}

/** Categories emphasised in the marketing surfaces. */
export const HOMEPAGE_PART_GROUPS = [
  { title: "Displays", items: ["Screens", "LCD & OLED assemblies", "Touch digitizers", "Display flexes"] },
  { title: "Power", items: ["Batteries", "Wireless charging", "Charging coils", "Power flexes"] },
  { title: "Boards & flexes", items: ["Charging flexes", "Charging boards", "Volume flexes", "Antenna flexes"] },
  { title: "Cameras", items: ["Rear cameras", "Front cameras", "Camera glass", "Lens modules"] },
  { title: "Audio", items: ["Loudspeakers", "Earpieces", "Microphones", "Buzzers"] },
  { title: "Body", items: ["Back covers", "Back glass", "Housings", "Frames & midframes"] },
  { title: "Sensors", items: ["Fingerprint components", "Proximity sensors", "Face ID modules", "NFC components"] },
  { title: "Other", items: ["Buttons", "SIM trays", "Antennas", "Connectors"] },
];
