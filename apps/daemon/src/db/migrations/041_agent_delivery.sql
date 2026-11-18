-- Existing requests are settled by recovery; only newly dispatched requests enter the queue.
ALTER TABLE agent_requests ADD COLUMN dispatch_ready INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_requests ADD COLUMN reply_to_request_id TEXT REFERENCES agent_requests(id);
CREATE INDEX agent_requests_queue ON agent_requests(dispatch_ready,status,created_at);
