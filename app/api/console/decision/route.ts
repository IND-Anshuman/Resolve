import { z } from 'zod';
import { errorResponse, json, parseBody } from '@/lib/api';
import { approveCase, declineCase } from '@/lib/cases/service';
import { isConsoleAuthorized, unauthorizedConsoleResponse } from '@/lib/console-auth';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), caseId: z.string().uuid(), amountCents: z.number().int().positive().optional() }),
  z.object({ action: z.literal('decline'), caseId: z.string().uuid(), reason: z.string().max(500).optional() }),
]);

// The optional console session protects this route in production. Approvals are attributed to
// the console itself because there is no multi-user identity provider in the demo.
export async function POST(request: Request) {
  if (!isConsoleAuthorized(request)) return unauthorizedConsoleResponse();
  try {
    const req = await parseBody(request, body);
    const result =
      req.action === 'approve'
        ? await approveCase({ caseId: req.caseId, approvedBy: 'seller-console', amountCents: req.amountCents })
        : await declineCase({ caseId: req.caseId, reason: req.reason });
    return json(result, result.ok ? 200 : 409);
  } catch (err) {
    return errorResponse(err);
  }
}
