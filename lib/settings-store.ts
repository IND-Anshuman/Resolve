import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { DEFAULT_SETTINGS, type StoreSettings } from './settings';

// One store, one settings row.
export const STORE_ID = 'clay-and-kiln';

const toRow = (s: StoreSettings) => ({
  storeId: STORE_ID,
  disputeFeeCents: s.disputeFeeCents,
  autoLimitCents: s.autoLimitCents,
  autoMaxShareOfOrder: s.autoMaxShareOfOrder,
  dailyCapCents: s.dailyCapCents,
  partialRefundShare: s.partialRefundShare,
  repeatRefundThreshold: s.repeatRefundThreshold,
  minConfidence: s.minConfidence,
  killSwitch: s.killSwitch,
  probabilities: s.probabilities,
});

// Falls back to the defaults, and writes them on first read so the console has a row to edit.
export async function getSettings(): Promise<StoreSettings> {
  const [row] = await db().select().from(schema.settings).where(eq(schema.settings.storeId, STORE_ID));
  if (row) {
    return {
      disputeFeeCents: row.disputeFeeCents,
      autoLimitCents: row.autoLimitCents,
      autoMaxShareOfOrder: row.autoMaxShareOfOrder,
      dailyCapCents: row.dailyCapCents,
      partialRefundShare: row.partialRefundShare,
      repeatRefundThreshold: row.repeatRefundThreshold,
      minConfidence: row.minConfidence,
      killSwitch: row.killSwitch,
      probabilities: row.probabilities,
    };
  }
  await db().insert(schema.settings).values(toRow(DEFAULT_SETTINGS)).onConflictDoNothing();
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: StoreSettings): Promise<void> {
  await db()
    .insert(schema.settings)
    .values(toRow(settings))
    .onConflictDoUpdate({ target: schema.settings.storeId, set: { ...toRow(settings), updatedAt: new Date() } });
}
