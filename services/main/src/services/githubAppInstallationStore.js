const { getSupabase } = require('../config/supabase');

// Maps an app user to the GitHub App installation they set up — separate
// table from github_connections (the legacy classic-OAuth store) so this
// migration is purely additive: existing OAuth connections are untouched,
// and a user can have both rows during the transition (App install takes
// priority — see githubService.js#resolveToken).
//
// Expected table (create once in Supabase SQL editor):
//   create table github_app_installations (
//     user_id text primary key,
//     installation_id text not null,
//     account_login text not null,
//     account_type text,                     -- "User" | "Organization"
//     account_avatar_url text,
//     created_at timestamptz default now(),
//     updated_at timestamptz default now()
//   );
//   create index if not exists github_app_installations_installation_id_idx
//     on github_app_installations (installation_id);

function table() {
  const supabase = getSupabase();
  if (!supabase) {
    const err = new Error('Supabase not configured — required for storing GitHub App installations');
    err.status = 503;
    throw err;
  }
  return supabase.from('github_app_installations');
}

async function getInstallation(userId) {
  const { data, error } = await table().select('*').eq('user_id', userId).maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  if (!data) return null;
  return {
    userId: data.user_id,
    installationId: data.installation_id,
    accountLogin: data.account_login,
    accountType: data.account_type,
    accountAvatarUrl: data.account_avatar_url,
  };
}

async function upsertInstallation({ userId, installationId, accountLogin, accountType, accountAvatarUrl }) {
  const { error } = await table().upsert(
    {
      user_id: userId,
      installation_id: String(installationId),
      account_login: accountLogin,
      account_type: accountType,
      account_avatar_url: accountAvatarUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
}

async function deleteInstallation(userId) {
  const { error } = await table().delete().eq('user_id', userId);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
}

module.exports = { getInstallation, upsertInstallation, deleteInstallation };
