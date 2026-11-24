// Import Asana Project Tasks Transform Map > Field Maps > NEW: Target field = status, Use source script, Choice action ignore.
// Asana tasks have no red/amber/green. Without this ServiceNow calculates one (Red on past dates - even on Closed
// Complete tasks). "No status" + Override status (next file) keeps it neutral.
answer = (function transformEntry(source) {
    return 'no_status';
})(source);
