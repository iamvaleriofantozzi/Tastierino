// ===================================================================================
// USB HID Functions for CH551, CH552 and CH554
// ===================================================================================

#include "usb_hid.h"
#include "ch554.h"
#include "usb.h"
#include "usb_descr.h"
#include "usb_handler.h"

// ===================================================================================
// Variables and Defines
// ===================================================================================

volatile __bit HID_EP1_writeBusyFlag = 0; // upload pointer busy flag
volatile __bit HID_EP2_writeBusyFlag = 0;

// uint8_t   SetupReq,SetupLen,Ready,Count,FLAG,UsbConfig;
uint8_t len, i;
volatile __data uint8_t HID_controlTarget = 0;
volatile __xdata uint8_t USBByteCountEP2 = 0;
volatile __xdata uint8_t statusLed = 0;
volatile __xdata uint8_t USBBufOutPointEP2 = 0;
__xdata uint8_t HID_controlResponse[EP2_SIZE];
// ===================================================================================
// Front End Functions
// ===================================================================================

// Setup USB HID
void HID_init(void) {
  USB_init();
  UEP1_T_LEN = 0;
}

// Send HID report
void HID_sendReport(__xdata uint8_t *buf, uint8_t len) {
  uint8_t i;
  while (HID_EP1_writeBusyFlag)
    ; // wait for ready to write
  for (i = 0; i < len; i++)
    EP1_SEND_buffer[i] = buf[i];  // copy report to EP1 buffer
  UEP1_T_LEN = len;          // set length to upload
  HID_EP1_writeBusyFlag = 1; // set busy flag
  UEP1_CTRL = UEP1_CTRL & ~MASK_UEP_T_RES |
              UEP_T_RES_ACK; // upload data and respond ACK
}

// ===================================================================================
// HID-Specific USB Handler Functions
// ===================================================================================

// Setup HID endpoints
void HID_setup(void) {
  UEP1_DMA = EP1_ADDR;         // EP1 data transfer address
  UEP2_DMA = EP2_ADDR;         // EP2 data transfer address
  UEP1_CTRL = bUEP_AUTO_TOG    // EP1 Auto flip sync flag
              | UEP_T_RES_NAK // EP1 IN transaction returns NAK
              | UEP_R_RES_ACK; // EP1 OUT transaction returns ACK
  UEP2_CTRL = bUEP_AUTO_TOG | UEP_T_RES_NAK | UEP_R_RES_ACK;
  UEP4_1_MOD = bUEP1_TX_EN | bUEP1_RX_EN ;    // EP1 RX / TX enable // EP1 buffer for send is at EP1_ADDR + 64
  // UINT8X 		Ep2Buffer[DUAL_BUFFER_SIZE]	_at_ 0x0050;  								// Endpoint 2, buffer OUT[64]+IN[64]��the address must be even.
  UEP2_3_MOD = bUEP2_RX_EN | bUEP2_TX_EN;
}

void HID_rawSend(__xdata uint8_t *buf, uint8_t count) {
  uint8_t j;
  while (HID_EP2_writeBusyFlag)
    ;
  if (count > EP2_SIZE)
    count = EP2_SIZE;
  for (j = 0; j < count; j++) {
    EP2_buffer[j] = buf[j];
    HID_controlResponse[j] = buf[j];
  }
  UEP2_T_LEN = count;
  HID_EP2_writeBusyFlag = 1;
  UEP2_CTRL = UEP2_CTRL & ~MASK_UEP_T_RES | UEP_T_RES_ACK;
}

// macOS may deliver HID output reports using the class SET_REPORT request
// instead of the interrupt OUT endpoint.  Accept both transports.
uint8_t HID_controlSetup(void) {
  HID_controlTarget = 0;
  if (USB_setupBuf->bRequest == HID_SET_REPORT) {
    HID_controlTarget = USB_setupBuf->wIndexL + 1;
    return 0;
  }
  if (USB_setupBuf->bRequest == HID_SET_IDLE ||
      USB_setupBuf->bRequest == HID_SET_PROTOCOL)
    return 0;
  if (USB_setupBuf->bRequest == HID_GET_REPORT &&
      USB_setupBuf->wIndexL == 1) {
    uint8_t j;
    for (j = 0; j < EP2_SIZE; j++)
      EP0_buffer[j] = HID_controlResponse[j];
    return EP2_SIZE;
  }
  if (USB_setupBuf->bRequest == HID_GET_IDLE ||
      USB_setupBuf->bRequest == HID_GET_PROTOCOL) {
    EP0_buffer[0] = 0;
    return 1;
  }
  return 0xff;
}

void HID_EP0_OUT(void) {
  uint8_t j;
  if (HID_controlTarget == 2 && USB_RX_LEN <= EP2_SIZE) {
    for (j = 0; j < USB_RX_LEN; j++)
      EP2_buffer[j] = EP0_buffer[j];
    USBByteCountEP2 = USB_RX_LEN;
    USBBufOutPointEP2 = 0;
  } else if (HID_controlTarget == 1 && USB_RX_LEN) {
    statusLed = EP0_buffer[0];
  }
  HID_controlTarget = 0;
}

uint8_t HID_available() { return USBByteCountEP2; }

uint8_t HID_statusLed() { return statusLed; }



void HID_ack() {
  USBByteCountEP2 = 0;
  USBBufOutPointEP2 = 0;
  UEP2_CTRL = UEP2_CTRL & ~MASK_UEP_R_RES | UEP_R_RES_ACK;
}

char HID_read() {
  if (USBByteCountEP2 == 0)
    return 0;
  __data char data = EP2_buffer[USBBufOutPointEP2];
  USBBufOutPointEP2++;
  USBByteCountEP2--;
  if (USBByteCountEP2 == 0) {
    UEP2_CTRL = UEP2_CTRL & ~MASK_UEP_R_RES | UEP_R_RES_ACK;
  }
  return data;
}

// Reset HID parameters
void HID_reset(void) {
  UEP1_CTRL = bUEP_AUTO_TOG | UEP_T_RES_NAK | UEP_R_RES_ACK;
  UEP2_CTRL = bUEP_AUTO_TOG | UEP_T_RES_NAK | UEP_R_RES_ACK;
  HID_EP1_writeBusyFlag = 0;
  HID_EP2_writeBusyFlag = 0;
}

// Endpoint 1 IN handler (HID report transfer to host)
void HID_EP1_IN(void) {
  UEP1_T_LEN = 0; // no data to send anymore
  UEP1_CTRL = UEP1_CTRL & ~MASK_UEP_T_RES | UEP_T_RES_NAK; // default NAK
  HID_EP1_writeBusyFlag = 0;                               // clear busy flag
}

void HID_EP1_OUT() {
  if (U_TOG_OK) // Discard unsynchronized packets
  {
    switch (EP1_buffer[0]) {
    case 1:
      statusLed = EP1_buffer[1];
      break;
    default:
      break;
    }
  }
}
// Endpoint 2 OUT handler (HID report transfer from host)
void HID_EP2_OUT(void) { // auto response
  if (U_TOG_OK)          // Discard unsynchronized packets
  {
    USBByteCountEP2 = USB_RX_LEN;
    USBBufOutPointEP2 = 0; // Reset Data pointer for fetching
    if (USBByteCountEP2)
      UEP2_CTRL = UEP2_CTRL & ~MASK_UEP_R_RES |
                  UEP_R_RES_NAK; // Respond NAK after a packet. Let main code
                                 // change response after handling.
  }
}

void HID_EP2_IN(void) {
  UEP2_T_LEN = 0;
  UEP2_CTRL = UEP2_CTRL & ~MASK_UEP_T_RES | UEP_T_RES_NAK;
  HID_EP2_writeBusyFlag = 0;
}
