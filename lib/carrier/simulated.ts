// A SIMULATED carrier. PayPal stores a tracking number but does not report delivery status,
// so Resolve needs somewhere to ask. This stands in for a real carrier API and is labelled
// "simulated" everywhere it surfaces. Swap it by implementing CarrierService.
//
// The status is read from the tracking number so demo scenarios are deterministic:
//   SIM-DELIVERED-123, SIM-TRANSIT-123, SIM-LOST-123, SIM-LABEL-123

export type ShipmentStatus = 'label_created' | 'in_transit' | 'delivered' | 'lost';

export type ShipmentInfo = {
  trackingNumber: string;
  carrier: string;
  status: ShipmentStatus;
  summary: string;
  simulated: true;
};

export interface CarrierService {
  getShipmentStatus(trackingNumber: string): Promise<ShipmentInfo>;
}

const SUMMARIES: Record<ShipmentStatus, string> = {
  label_created: 'Label created, not yet picked up by the carrier',
  in_transit: 'In transit, last scan at a regional sorting facility',
  delivered: 'Delivered, left at the front door',
  lost: 'No scan for 14 days, the carrier has marked the parcel as lost',
};

const BY_TAG: Record<string, ShipmentStatus> = {
  LABEL: 'label_created',
  TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  LOST: 'lost',
};

export function statusFromTracking(trackingNumber: string): ShipmentStatus {
  const tag = trackingNumber.split('-')[1]?.toUpperCase();
  return (tag && BY_TAG[tag]) || 'delivered';
}

export const simulatedCarrier: CarrierService = {
  async getShipmentStatus(trackingNumber) {
    const status = statusFromTracking(trackingNumber);
    return { trackingNumber, carrier: 'USPS (simulated)', status, summary: SUMMARIES[status], simulated: true };
  },
};

export function makeTrackingNumber(status: ShipmentStatus): string {
  const tag = Object.entries(BY_TAG).find(([, s]) => s === status)![0];
  return `SIM-${tag}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
