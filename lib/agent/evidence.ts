import type { ShipmentInfo } from '../carrier/simulated';
import type { EvidenceStrength } from '../settings';
import type { Assessment } from './assessment';

// Evidence strength feeds the cost model, so the model does not get to choose it. It is worked
// out here from what the photo shows and what the carrier says.
export function deriveEvidence(assessment: Assessment, shipment: ShipmentInfo | null): EvidenceStrength {
  const { photo } = assessment;
  switch (assessment.complaintType) {
    case 'not_received':
      if (!shipment) return 'none';
      if (shipment.status === 'lost') return 'strong';
      if (shipment.status === 'delivered') return 'none';
      return 'weak';
    case 'damaged':
      if (photo.provided && photo.quality === 'clear' && photo.showsDamage) return 'strong';
      return photo.provided ? 'weak' : 'none';
    case 'wrong_item':
    case 'not_as_described':
      if (photo.provided && photo.quality === 'clear' && photo.matchesListing === false) return 'strong';
      return photo.provided ? 'weak' : 'none';
    default:
      return 'none';
  }
}
