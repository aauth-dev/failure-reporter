interface OriginalEvent {
  service: string
  event: string
  timestamp: string
  event_id: string
  [k: string]: unknown
}

interface Env {
  EVENTS_QUEUE: Queue
}

export default {
  async queue(batch: MessageBatch<OriginalEvent>, env: Env): Promise<void> {
    // Per-message try/catch so a single malformed DLQ entry can't
    // fault the batch — that would re-deliver everything.
    for (const msg of batch.messages) {
      try {
        const original = msg.body
        const failure = {
          service: original?.service ?? 'unknown',
          event: 'aauth.shipping_failed',
          timestamp: new Date().toISOString(),
          event_id: crypto.randomUUID(),
          level: 50,
          msg: `shipping failed for ${original?.event ?? 'unknown'}`,
          original_event_id: original?.event_id,
          original_event: original?.event,
          original_timestamp: original?.timestamp,
        }
        await env.EVENTS_QUEUE.send(failure)
        msg.ack()
      } catch (err) {
        // Most likely: the main queue is temporarily unavailable.
        // Retry — the DLQ entry stays around until we successfully
        // synthesize a failure event for it.
        console.error('failure_report_send_failed', { error: String(err) })
        msg.retry()
      }
    }
  },
}
