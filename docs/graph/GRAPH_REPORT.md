# Graph Report - /tmp/ch552-graphify-v2  (2026-07-16)

## Corpus Check
- Corpus is ~20,842 words - fits in a single context window. You may not need a graph.

## Summary
- 285 nodes · 416 edges · 18 communities
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Firmware Core
- Python Device API
- USB Interface Types
- Timing Primitives
- Keyboard and Media HID
- USB Mass Storage CBW
- Web UI Controls
- USB Device Descriptor
- USB Mass Storage CSW
- Firmware Build and Flash
- USB Transport Handlers
- Hardware and NeoPixel
- USB Configuration
- USB Hub Types
- USB Association Types
- USB Setup Requests
- HID Descriptor Types

## God Nodes (most connected - your core abstractions)
1. `MacroPad` - 20 edges
2. `_UDISK_BOC_CBW` - 17 edges
3. `_USB_DEVICE_DESCR` - 15 edges
4. `_delay_cycles_1()` - 14 edges
5. `_UDISK_BOC_CSW` - 14 edges
6. `main()` - 12 edges
7. `Handler` - 10 edges
8. `raw_handle()` - 10 edges
9. `_USB_INTERF_DESCR` - 10 edges
10. `_USB_SETUP_REQ` - 9 edges

## Surprising Connections (you probably didn't know these)
- `DeviceTests` --uses--> `MacroPad`  [INFERRED]
  tests/test_device.py → app/device.py
- `FakeDevice` --uses--> `MacroPad`  [INFERRED]
  tests/test_device.py → app/device.py
- `FakeHid` --uses--> `MacroPad`  [INFERRED]
  tests/test_device.py → app/device.py
- `NEO_update()` --calls--> `NEO_writeColor()`  [INFERRED]
  firmware/3keys_1knob.c → firmware/include/neo.c
- `raw_handle()` --calls--> `HID_ack()`  [INFERRED]
  firmware/3keys_1knob.c → firmware/include/usb_hid.c

## Import Cycles
- None detected.

## Communities (18 total, 0 thin omitted)

### Community 0 - "Firmware Core"
Cohesion: 0.08
Nodes (24): __data, __xdata, config_checksum(), config_load(), config_save(), defaults_load(), eeprom_read_byte(), eeprom_write_byte() (+16 more)

### Community 1 - "Python Device API"
Cohesion: 0.08
Nodes (9): DeviceError, MacroPad, Local CH552 Control Center., Handler, main(), BaseHTTPRequestHandler, DeviceTests, FakeDevice (+1 more)

### Community 2 - "USB Interface Types"
Cohesion: 0.08
Nodes (24): _USB_CONFIG_DESCR_LONG, cfg_descr, endp_descr, itf_descr, _USB_ENDPOINT_DESCR, bDescriptorType, bEndpointAddress, bInterval (+16 more)

### Community 3 - "Timing Primitives"
Cohesion: 0.21
Nodes (23): _delay_cycles_1(), _delay_cycles_10(), _delay_cycles_11(), _delay_cycles_12(), _delay_cycles_13(), _delay_cycles_14(), _delay_cycles_15(), _delay_cycles_16() (+15 more)

### Community 4 - "Keyboard and Media HID"
Cohesion: 0.19
Nodes (11): handle_key(), CON_press(), CON_release(), CON_type(), KBD_code_press(), KBD_code_release(), KBD_code_type(), KBD_press() (+3 more)

### Community 5 - "USB Mass Storage CBW"
Cohesion: 0.12
Nodes (17): _UDISK_BOC_CBW, mCBW_CB_Buf, mCBW_CB_Len, mCBW_DataLen0, mCBW_DataLen1, mCBW_DataLen2, mCBW_DataLen3, mCBW_Flag (+9 more)

### Community 6 - "Web UI Controls"
Cohesion: 0.22
Nodes (12): api(), brightness, colors, controls, createKeyRows(), log(), paintPreview(), post() (+4 more)

### Community 7 - "USB Device Descriptor"
Cohesion: 0.13
Nodes (15): _USB_DEVICE_DESCR, bcdDevice, bcdUSB, bDescriptorType, bDeviceClass, bDeviceProtocol, bDeviceSubClass, bLength (+7 more)

### Community 8 - "USB Mass Storage CSW"
Cohesion: 0.14
Nodes (14): _UDISK_BOC_CSW, mCSW_Residue0, mCSW_Residue1, mCSW_Residue2, mCSW_Residue3, mCSW_Sig0, mCSW_Sig1, mCSW_Sig2 (+6 more)

### Community 9 - "Firmware Build and Flash"
Cohesion: 0.33
Nodes (7): build(), flash(), inspect_binary(), locate_wchisp(), save_upload(), RuntimeError, FirmwareTests

### Community 10 - "USB Transport Handlers"
Cohesion: 0.24
Nodes (7): USB_ISR(), USB_EP0_copyDescr(), USB_EP0_IN(), USB_EP0_SETUP(), USB_init(), USB_interrupt(), HID_init()

### Community 11 - "Hardware and NeoPixel"
Cohesion: 0.28
Nodes (3): NEO_sendByte(), NEO_writeColor(), NEO_writeHue()

### Community 12 - "USB Configuration"
Cohesion: 0.22
Nodes (9): _USB_CONFIG_DESCR, bConfigurationValue, bDescriptorType, bLength, bmAttributes, bNumInterfaces, iConfiguration, MaxPower (+1 more)

### Community 13 - "USB Hub Types"
Cohesion: 0.22
Nodes (9): _USB_HUB_DESCR, bDescLength, bDescriptorType, bHubContrCurrent, bNbrPorts, bPwrOn2PwrGood, DeviceRemovable, PortPwrCtrlMask (+1 more)

### Community 14 - "USB Association Types"
Cohesion: 0.22
Nodes (9): _USB_ITF_ASS_DESCR, bDescriptorType, bFirstInterface, bFunctionClass, bFunctionProtocol, bFunctionSubClass, bInterfaceCount, bLength (+1 more)

### Community 15 - "USB Setup Requests"
Cohesion: 0.22
Nodes (9): _USB_SETUP_REQ, bRequest, bRequestType, wIndexH, wIndexL, wLengthH, wLengthL, wValueH (+1 more)

### Community 16 - "HID Descriptor Types"
Cohesion: 0.25
Nodes (8): _USB_HID_DESCR, bcdHID, bCountryCode, bDescriptorType, bDescriptorTypeX, bLength, bNumDescriptors, wDescriptorLength

## Knowledge Gaps
- **103 isolated node(s):** `controls`, `colors`, `brightness`, `bRequestType`, `bRequest` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_UDISK_BOC_CBW` connect `USB Mass Storage CBW` to `USB Interface Types`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `_USB_DEVICE_DESCR` connect `USB Device Descriptor` to `USB Interface Types`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `_UDISK_BOC_CSW` connect `USB Mass Storage CSW` to `USB Interface Types`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `MacroPad` (e.g. with `Handler` and `DeviceTests`) actually correct?**
  _`MacroPad` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `controls`, `colors`, `brightness` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Firmware Core` be split into smaller, more focused modules?**
  _Cohesion score 0.07549361207897794 - nodes in this community are weakly interconnected._
- **Should `Python Device API` be split into smaller, more focused modules?**
  _Cohesion score 0.08461538461538462 - nodes in this community are weakly interconnected._