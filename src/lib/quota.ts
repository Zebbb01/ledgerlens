// Usage counters that keep the demo inside Azure's free allowances.
import { MongoServerError, type Db } from "mongodb";

type Counter = { _id: string; key: string; count: number };

export const monthKey = (now: Date) => `pages:${now.toISOString().slice(0, 7)}`;
export const dayKey = (kind: string, id: string, now: Date) => `${kind}:${id}:${now.toISOString().slice(0, 10)}`;

// Adds n to the counter only while it stays within the limit. The filter carries
// `key` because it is the shard key of the collection on Cosmos DB.
export async function take(db: Db, key: string, n: number, limit: number): Promise<boolean> {
  const usage = db.collection<Counter>("usage");
  try {
    await usage.updateOne({ _id: key, key }, { $setOnInsert: { count: 0 } }, { upsert: true });
  } catch (e) {
    // Two first requests raced to create the counter; it exists now.
    if (!(e instanceof MongoServerError && e.code === 11000)) throw e;
  }
  const updated = await usage.findOneAndUpdate({ _id: key, key, count: { $lte: limit - n } }, { $inc: { count: n } });
  return updated !== null;
}
