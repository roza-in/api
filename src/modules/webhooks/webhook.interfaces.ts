export interface WhatsAppStatusObject {
  id: string;
  status: string;
  biz_opaque_callback_data?: string;
}

export interface WhatsAppStatusValue {
  statuses?: WhatsAppStatusObject[];
}

export interface WhatsAppStatusChange {
  value: WhatsAppStatusValue;
  field: string;
}

export interface WhatsAppStatusEntry {
  id: string;
  changes?: WhatsAppStatusChange[];
}

export interface WhatsAppStatusPayload {
  object: string;
  entry?: WhatsAppStatusEntry[];
}

export interface Msg91StatusItem {
  requestId: string;
  status: string;
  mobile: string;
  desc?: string;
}
