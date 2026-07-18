// ===================================================================================
// USB HID Consumer Keyboard Functions for CH551, CH552 and CH554
// ===================================================================================

#include "usb_conkbd.h"
#include "usb_descr.h"
#include "usb_hid.h"

#define KBD_sendReport() HID_sendReport(KBD_report, sizeof(KBD_report))
#define CON_sendReport() HID_sendReport(CON_report, sizeof(CON_report))
#define MOUSE_sendReport() HID_sendReport(MOUSE_report, sizeof(MOUSE_report))

// ===================================================================================
// Keyboard HID report
// ===================================================================================
__xdata uint8_t KBD_report[9] = {
    USB_SEND_REPORT_KEYBOARD_PAGE_ID, 0, 0, 0, 0, 0, 0, 0, 0};
__xdata uint8_t CON_report[9] = {
    USB_SEND_REPORT_CONSUMER_PAGE_ID, 0, 0, 0, 0, 0, 0, 0, 0};
// reportId, buttons, x, y, wheel
__xdata uint8_t MOUSE_report[5] = {
    USB_SEND_REPORT_MOUSE_PAGE_ID, 0, 0, 0, 0};

// ===================================================================================
// Press with modifier and keycode
// ===================================================================================
void KBD_code_press(uint8_t mod, uint8_t code) {
  uint8_t i;

  if (!code)
    return; // no valid code

  KBD_report[1] |= mod; // add modifiers

  // Check if code is already present in report
  for (i = 3; i < 9; i++) {
    if (KBD_report[i] == code)
      return; // return if already in report
  }

  // Find an empty slot, insert code and transmit report
  for (i = 3; i < 9; i++) {
    if (KBD_report[i] == 0) { // empty slot?
      KBD_report[i] = code;   // insert code
      KBD_sendReport();       // send report
      return;                 // and return
    }
  }
}

// ===================================================================================
// Release with modifier and keycode
// ===================================================================================
void KBD_code_release(uint8_t mod, uint8_t code) {
  uint8_t i;

  if (!code)
    return; // no valid code

  KBD_report[1] &= ~mod; // remove modifiers

  // Delete code in report
  for (i = 3; i < 9; i++) {
    if (KBD_report[i] == code)
      KBD_report[i] = 0; // delete code in report
  }
  KBD_sendReport(); // send report
}

// ===================================================================================
// Type (press and release) with modifier and keycode
// ===================================================================================
void KBD_code_type(uint8_t mod, uint8_t code) {
  KBD_code_press(mod, code);
  KBD_code_release(mod, code);
}

// ===================================================================================
// Press a consumer key on keyboard
// ===================================================================================
void CON_press(uint16_t key) {
  uint8_t i;

  // Check if key is already present in report
  for (i = 1; i < 9; i += 2) {
    if ((CON_report[i] == key & 0xFF) && (CON_report[i + 1] == key >> 8))
      return;
  }

  // Find an empty slot, insert key and transmit report
  for (i = 1; i < 9; i += 2) {
    if ((CON_report[i] == 0) && (CON_report[i + 1] == 0)) { // empty slot?
      CON_report[i] = key & 0xFF;                           // insert key
      CON_report[i + 1] = key >> 8;
      CON_sendReport(); // send report
      return;           // and return
    }
  }
}

// ===================================================================================
// Release a consumer key on keyboard
// ===================================================================================
void CON_release(uint16_t key) {
  uint8_t i;

  // Delete key in report
  for (i = 1; i < 9; i += 2) {
    if ((CON_report[i] == key & 0xFF) && (CON_report[i + 1] == key >> 8)) {
      CON_report[i] = 0;
      CON_report[i + 1] = 0;
    }
  }
  CON_sendReport();
}

// ===================================================================================
// Press and release a consumer key on keyboard
// ===================================================================================
void CON_type(uint16_t key) {
  CON_press(key);
  CON_release(key);
}

// ===================================================================================
// Mouse helpers — code: button mask (0x01/02/04) or wheel (0x10 up / 0x11 down)
// ===================================================================================
void MOUSE_press(uint8_t code) {
  if (code == MOUSE_WHL_UP || code == MOUSE_WHL_DOWN) {
    MOUSE_report[1] = 0;
    MOUSE_report[2] = 0;
    MOUSE_report[3] = 0;
    MOUSE_report[4] = (code == MOUSE_WHL_UP) ? 1 : 0xff; // -1 as uint8
    MOUSE_sendReport();
    return;
  }
  if (code & 0x07) {
    MOUSE_report[1] |= (code & 0x07);
    MOUSE_report[2] = 0;
    MOUSE_report[3] = 0;
    MOUSE_report[4] = 0;
    MOUSE_sendReport();
  }
}

void MOUSE_release(uint8_t code) {
  if (code == MOUSE_WHL_UP || code == MOUSE_WHL_DOWN) {
    MOUSE_report[4] = 0;
    MOUSE_sendReport();
    return;
  }
  if (code & 0x07) {
    MOUSE_report[1] &= (uint8_t) ~(code & 0x07);
    MOUSE_report[2] = 0;
    MOUSE_report[3] = 0;
    MOUSE_report[4] = 0;
    MOUSE_sendReport();
  }
}

void MOUSE_type(uint8_t code) {
  MOUSE_press(code);
  MOUSE_release(code);
}
