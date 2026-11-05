// Called only after signature verification and fresh Apple reconciliation.
// Never select a database using unverified request fields.
export async function resolveNotificationOwner(env, config, transaction) {
  const databases = [env.DB];
  if (env.APPLE_REVIEW_NOTIFICATIONS_ENABLED === '1') {
    if (config.deployment !== 'test' || config.environment !== 'Sandbox' ||
        !env.APP_REVIEW_DB || env.APP_REVIEW_DB === env.DB || !env.APP_REVIEW_ACCOUNT_ID) {
      throw Error('APPLE_NOTIFICATION_ROUTING_INVALID');
    }
    databases.push(env.APP_REVIEW_DB);
  }
  const matches = [];
  // Query every configured database, even after a match: duplicate ownership
  // or an unavailable database must fail closed instead of crediting by order.
  for (const db of databases) {
    const owner = await db.prepare(`SELECT account_id,retired_at FROM apple_account_tokens
      WHERE environment=? AND app_account_token=?`)
      .bind(config.environment, transaction.appAccountToken.toLowerCase()).first();
    if (owner) matches.push({ db, owner });
  }
  if (matches.length !== 1) throw Error('APPLE_NOTIFICATION_OWNER_AMBIGUOUS_OR_UNKNOWN');
  const match = matches[0];
  if (match.db === env.APP_REVIEW_DB && match.owner.retired_at === null &&
      match.owner.account_id !== env.APP_REVIEW_ACCOUNT_ID) {
    throw Error('APPLE_NOTIFICATION_REVIEW_ACCOUNT_INVALID');
  }
  return match;
}
