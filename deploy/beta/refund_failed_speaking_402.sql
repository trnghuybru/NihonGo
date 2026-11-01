-- One-time correction for the two 31 Oct 2026 Gemini HTTP 402 speaking attempts.
-- Abort if the ledger changed; do not apply a broad refund by accident.
BEGIN;
LOCK TABLE beta_ai_attempts, beta_ai_wallets IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
    attempts_count integer;
    refund_micro bigint;
    wallet_count integer;
    wallet_spent bigint;
BEGIN
    SELECT count(*), coalesce(sum(charged_micro_usd), 0)
      INTO attempts_count, refund_micro
      FROM beta_ai_attempts
     WHERE status = 'settled'
       AND charged_micro_usd = 3996
       AND action LIKE '/api/speaking/sessions/%/messages';
    SELECT count(*), coalesce(sum(spent_micro_usd), 0)
      INTO wallet_count, wallet_spent
      FROM beta_ai_wallets;
    IF attempts_count <> 2 OR refund_micro <> 7992
       OR wallet_count <> 1 OR wallet_spent <> 7992
       OR (SELECT count(*) FROM beta_ai_attempts) <> 2 THEN
        RAISE EXCEPTION 'Ledger changed; refund not applied';
    END IF;
    UPDATE beta_ai_attempts SET charged_micro_usd = 0
     WHERE status = 'settled'
       AND charged_micro_usd = 3996
       AND action LIKE '/api/speaking/sessions/%/messages';
    UPDATE beta_ai_wallets SET spent_micro_usd = 0;
END $$;
COMMIT;
