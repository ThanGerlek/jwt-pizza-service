/** Maximum rows returned per list request (defense in depth with DB layer). */
const MAX_PAGE_LIMIT = 100;

function parseFranchisePage(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function parseFranchiseLimit(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    return 10;
  }
  return Math.min(MAX_PAGE_LIMIT, n);
}

function parseOrderPage(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return n;
}

module.exports = {
  MAX_PAGE_LIMIT,
  parseFranchisePage,
  parseFranchiseLimit,
  parseOrderPage,
};
