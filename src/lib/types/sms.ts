// ── SMS Request (sent from PWA to /api/sms) ──────────────────────────────────
export interface SmsRequest {
    receivers: string[];
    message: string;
}

// ── SMS API Response types ────────────────────────────────────────────────────
export interface SmsSuccessResponse {
    success: true;
    /** UUID of the newly created sms_requests row (returned by /api/sms) */
    request_id?: string;
    /** Number of receivers queued */
    count?: number;
    result?: {
        count?: number;
    };
    mock?: boolean;
}

export interface SmsErrorResponse {
    success: false;
    error: string;
}

export type SmsResponse = SmsSuccessResponse | SmsErrorResponse;

// ── Supabase sms_requests table row ──────────────────────────────────────────
/**
 * Represents a row in the `sms_requests` Supabase table.
 *
 * Dispatch lifecycle:
 *   pending → (MacroDroid picks up) → processing → sent_via_macrodroid
 *   pending → (5 min timeout, fallback triggered) → fallback_in_progress → sent_via_solapi | failed
 *
 * Legacy statuses:
 *   'sent'       — simple MacroDroid ack (superseded by sent_via_macrodroid)
 *   'processing' — MacroDroid has claimed the job
 */
export type SmsRequestStatus =
    | 'pending'               // Written by PWA, waiting for MacroDroid
    | 'processing'            // MacroDroid has claimed the job (polled + locked)
    | 'fallback_in_progress'  // Solapi fallback started (optimistic lock)
    | 'sent'                  // Legacy: dispatched (simple MacroDroid ack)
    | 'sent_via_macrodroid'   // Galaxy phone confirmed dispatch
    | 'sent_via_solapi'       // Solapi/CoolSMS fallback confirmed dispatch
    | 'failed';               // All dispatch paths failed

/**
 * Per-number delivery result.
 *
 * Stored two ways:
 *   1. In `sms_requests.delivery_results` JSONB column (array, for backwards compat)
 *   2. As individual rows in `sms_delivery_results` table (for Supabase dashboard auditability)
 *
 * Written by:
 *   - /api/sms/macrodroid/complete  (MacroDroid Galaxy phone path)
 *   - /api/sms/fallback             (Solapi fallback path)
 */
export interface SmsDeliveryResult {
    /** Recipient phone number in 010XXXXXXXX format */
    phone: string;
    /** Display name from contacts table (optional) */
    name?: string;
    /** Terminal delivery status for this number */
    status: 'pending' | 'sent' | 'failed';
    /** When this specific number's SMS was dispatched (ISO-8601) */
    sent_at?: string | null;
    /** Human-readable failure reason when status = 'failed' */
    error_message?: string | null;
    /**
     * @deprecated Use `status === 'sent'` instead. Kept for backward compatibility
     * with any existing JSONB rows written before AC 5a migration.
     */
    ok?: boolean;
    /**
     * @deprecated Use `error_message` instead.
     */
    error?: string;
}

export interface SmsRequestRow {
    id: string;                              // UUID primary key
    message: string;                         // SMS body text
    receivers: string[];                     // Array of phone numbers (010XXXXXXXX)
    status: SmsRequestStatus;

    // Dispatch metadata
    dispatch_method?: 'macrodroid' | 'solapi' | null;  // Which path was used
    total_count?: number | null;             // Total intended recipients
    success_count?: number | null;           // Successfully delivered count
    delivery_results?: SmsDeliveryResult[] | null;  // Per-number audit log
    error_message?: string | null;           // Human-readable failure summary
    fallback_note?: string | null;           // Developer-facing fallback note

    // Timestamps
    created_at: string;                      // ISO: when PWA queued the request
    updated_at: string;                      // ISO: last status change
    sent_at?: string | null;                 // ISO: when SMS was actually dispatched
    dispatched_at?: string | null;           // ISO: when MacroDroid / Solapi picked up
    completed_at?: string | null;            // ISO: when final result was recorded
}

// ── Supabase sms_delivery_results table row ───────────────────────────────────
/**
 * Represents a row in the `sms_delivery_results` Supabase table.
 *
 * One row per recipient per dispatch batch.
 * Created by the MacroDroid complete endpoint or Solapi fallback route.
 *
 * Enables per-number auditability via Supabase dashboard:
 *   SELECT * FROM sms_delivery_results WHERE request_id = '<uuid>' AND status = 'failed'
 */
export interface SmsDeliveryResultRow {
    id: string;                        // UUID primary key
    request_id: string;                // FK → sms_requests.id
    phone: string;                     // 010XXXXXXXX
    name?: string | null;              // Display name from contacts
    status: 'pending' | 'sent' | 'failed';
    sent_at?: string | null;           // ISO: when this number's SMS was dispatched
    error_message?: string | null;     // Failure reason if status = 'failed'
    created_at: string;                // ISO: when this row was created
}

// ── Fallback route request body ───────────────────────────────────────────────
export interface SmsFallbackRequest {
    request_id: string;  // UUID from sms_requests table
}
