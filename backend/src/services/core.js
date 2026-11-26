'use strict';

const db = require('../db/pool');
const { forbidden, notFound } = require('../utils');

/** Write one row to the company activity feed (also our audit trail). */
async function record(actorId, action, summary, { projectId = null, clientId = null, meta = {} } = {}, client = db) {
  await client.query(
    'INSERT INTO activity(actor_id, action, summary, project_id, client_id, meta) VALUES ($1,$2,$3,$4,$5,$6)',
    [actorId, action, summary, projectId, clientId, meta],
  );
}

async function notify(userId, { type, title, body = null, link = null }, client = db) {
  if (!userId) return;
  await client.query('INSERT INTO notifications(user_id, type, title, body, link) VALUES ($1,$2,$3,$4,$5)',
    [userId, type, title, body, link]);
}

async function notifyMany(userIds, payload, exceptId = null, client = db) {
  const ids = [...new Set(userIds)].filter((id) => id && id !== exceptId);
  for (const id of ids) await notify(id, payload, client);
}

async function getProject(id) {
  const p = await db.one('SELECT * FROM projects WHERE id=$1', [id]);
  if (!p) throw notFound('Project not found');
  return p;
}

async function isMember(projectId, userId) {
  return Boolean(await db.one('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, userId]));
}

/**
 * Who may change a project:
 *  - admin: always
 *  - manager: projects they own
 */
function canManage(user, project) {
  return user.role === 'admin' || (user.role === 'manager' && project.owner_id === user.id);
}

function assertCanManage(user, project) {
  if (!canManage(user, project)) throw forbidden('Only the project owner or an admin can change this project');
}

/** Post updates, log time, move milestones: owner, admins, or members of the project (not viewers). */
async function assertCanContribute(user, project) {
  if (canManage(user, project)) return;
  if (user.role !== 'viewer' && await isMember(project.id, user.id)) return;
  throw forbidden('Only members of this project can do that');
}

module.exports = { record, notify, notifyMany, getProject, isMember, canManage, assertCanManage, assertCanContribute };
