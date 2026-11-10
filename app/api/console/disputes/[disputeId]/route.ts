import { z } from 'zod';
import { errorResponse, json, parseBody } from '@/lib/api';
import { paypalDisputes } from '@/lib/paypal/disputes';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('provide_evidence'), evidence: z.array(z.object({ evidence_type: z.string().min(1), evidence_info: z.record(z.string(), z.unknown()).optional(), notes: z.string().max(2000).optional() })).min(1) }),
  z.object({ action: z.literal('accept_claim'), note: z.string().max(500).optional() }),
]);

type Context = { params: Promise<{ disputeId: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!isConsoleAuthorized(_request)) return unauthorizedConsoleResponse();
  try {
    const { disputeId } = await params;
    return json(await paypalDisputes.get(disputeId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    const { disputeId } = await params;
    const input = await parseBody(request, body);
    const result = input.action === 'provide_evidence'
      ? await paypalDisputes.provideEvidence(disputeId, input.evidence)
      : await paypalDisputes.acceptClaim(disputeId, input.note);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
