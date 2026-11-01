CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

-- The requester can't decide their own request, even via a direct write that
-- bypasses decide().
CREATE TRIGGER IF NOT EXISTS approvals_no_self_decision
BEFORE UPDATE ON approvals
WHEN NEW.decided_by IS NOT NULL AND NEW.decided_by = NEW.requested_by
BEGIN
  SELECT RAISE(ABORT, 'requester cannot decide their own approval');
END;

-- A request is decided once: no writes to a non-pending approval.
CREATE TRIGGER IF NOT EXISTS approvals_pending_only
BEFORE UPDATE ON approvals
WHEN OLD.status != 'pending'
BEGIN
  SELECT RAISE(ABORT, 'approval is no longer pending');
END;

-- Leaving pending means a decision, and a decision needs a decider. Blocks a
-- direct status flip that skips decide() and its audit and state updates.
CREATE TRIGGER IF NOT EXISTS approvals_decision_needs_decider
BEFORE UPDATE ON approvals
WHEN NEW.status != 'pending' AND NEW.decided_by IS NULL
BEGIN
  SELECT RAISE(ABORT, 'a decided approval requires decided_by');
END;
