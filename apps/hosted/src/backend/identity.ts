/**
 * Who is using the page. The host already knows the viewer; Space needs to know which Space person
 * they are. The choice is stored privately for each viewer (data/users/<viewer id>/space), so two
 * people can share a link and each keep their own identity and preferences.
 */
import { z } from 'zod';
import { createOrgSchema } from '@space/shared';
import { caps } from './caps';
import { T, nowIso, store } from './store';
import { AuthUser, Errors, parse, audit } from './core';
import { createOrg } from './orgs';

type Prefs = { focusMode?: boolean; reducedMotion?: boolean; office3d?: boolean; lastOrgId?: string };
let viewerId: string | null = null;
let viewerEmail = '';
const isWeb = () => caps.platform === 'web';
let state: { userId: string | null; preferences: Prefs } = { userId: null, preferences: {} };
const LS = 'space:identity';

function docRef() {
  return caps.db && viewerId ? caps.db.doc(`data/users/${viewerId}/space`) : null;
}

export async function loadIdentity() {
  viewerId = caps.user ? await caps.user.id().catch(() => null) : null;
  viewerEmail = isWeb() && caps.user?.email ? String((await caps.user.email().catch(() => '')) ?? '').toLowerCase() : '';
  const ref = docRef();
  if (ref) {
    try {
      const snap = await ref.get();
      if (snap.exists) state = { ...{ userId: null, preferences: {} }, ...(snap.data() as Partial<typeof state>) };
      return;
    } catch {
      /* fall back to local storage */
    }
  }
  try {
    const s = localStorage.getItem(LS);
    if (s) state = JSON.parse(s);
  } catch {
    /* storage unavailable */
  }
}

async function save() {
  const ref = docRef();
  if (ref && isWeb()) return ref.set(JSON.parse(JSON.stringify(state)));
  if (ref) {
    try {
      await ref.set(JSON.parse(JSON.stringify(state)));
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(LS, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function currentUser(): AuthUser | null {
  const u = state.userId ? T.users.get(state.userId) : undefined;
  return u ? { id: u.id, email: u.email, name: u.name } : null;
}
export function requireUser(): AuthUser {
  const u = currentUser();
  if (!u) throw Errors.unauthenticated();
  return u;
}

export function me() {
  const u = requireUser();
  const orgs = T.orgMembers
    .where((m) => m.userId === u.id && !m.deactivatedAt)
    .map((m) => ({ m, o: T.organizations.get(m.orgId) }))
    .filter((x) => x.o)
    .map(({ m, o }) => ({ id: o!.id, slug: o!.slug, name: o!.name, brandColor: o!.brandColor, isDemo: !!o!.isDemo, role: m.role, memberId: m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { user: { ...u, isPlatformAdmin: false, preferences: state.preferences }, organizations: orgs, viewer: { hosted: true, readOnly: store.readOnly } };
}

/** Demo people worth trying first, one per role. */
const SUGGESTED = ['munira@juniper.demo', 'faisal@juniper.demo', 'lina@juniper.demo', 'sara@juniper.demo', 'sultan@juniper.demo'];

/** People a viewer can sign in as: everyone with an active membership. */
export function people() {
  return T.users
    .all()
    .map((u) => {
      const ms = T.orgMembers.where((m) => m.userId === u.id && !m.deactivatedAt);
      return {
        id: u.id,
        name: u.name,
        title: ms[0]?.title ?? null,
        companies: ms.map((m) => ({ name: T.organizations.get(m.orgId)?.name ?? '', role: m.role })).filter((c) => c.name),
        suggested: SUGGESTED.indexOf(String(u.email)),
      };
    })
    .filter((p) => p.companies.length && (!isWeb() || mayBe(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** On the public website a viewer may only be a shared demo person, their own person, or an invite sent to their email. */
function mayBe(userId: string) {
  const u = T.users.get(userId);
  if (!u) return false;
  return !!u.demo || u.authUid === viewerId || (!u.authUid && String(u.email).toLowerCase() === viewerEmail);
}

/** Demo companies anyone can join as an employee, with their departments. */
export function joinable() {
  return T.organizations
    .where((o) => !!o.isDemo)
    .map((o) => ({ id: o.id, name: o.name, departments: T.departments.where((d) => d.orgId === o.id).sort((a, b) => a.sortOrder - b.sortOrder).map((d) => ({ id: d.id, name: d.name })) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function viewerName() {
  return caps.user ? ((await caps.user.name().catch(() => '')) as string) : '';
}

export async function signInAs(body: unknown) {
  const { userId } = parse(z.object({ userId: z.string().min(1) }), body);
  const u = T.users.get(userId);
  if (!u) throw Errors.notFound('Person');
  if (isWeb()) {
    if (!mayBe(userId)) throw Errors.forbidden('That person belongs to another account.');
    // Accepting an invite links the person to this account for good.
    if (!u.demo && !u.authUid) await T.users.update(u.id, { authUid: viewerId });
  }
  state = { userId, preferences: state.userId === userId ? state.preferences : {} };
  await save();
  await audit(null, 'auth.login', { type: 'user', id: u.id }, { hosted: true }, { userId: u.id }).catch(() => undefined);
  return { user: { id: u.id, email: u.email, name: u.name } };
}

/** Create a Space person for the viewer themselves (no password: the host handles sign-in). */
export async function joinAsSelf(body: unknown) {
  const input = parse(z.object({ name: z.string().trim().min(2).max(80), email: z.string().email().max(200).optional().or(z.literal('')), joinOrgId: z.string().optional(), departmentId: z.string().optional() }), body);
  if (isWeb() && T.users.find((u) => String(u.email).toLowerCase() === viewerEmail && (!u.authUid || u.authUid === viewerId)))
    throw Errors.conflict('You already have a person in this Space. Pick yourself from the list.');
  const email = isWeb() ? viewerEmail : input.email || `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${Math.random().toString(36).slice(2, 6)}@guest.space`;
  if (input.email && T.users.find((u) => String(u.email).toLowerCase() === email.toLowerCase())) throw Errors.conflict('Someone in this Space already uses that email. Pick them from the list instead.');
  const u = await T.users.insert({ email: email.toLowerCase(), name: input.name, createdAt: nowIso(), ...(isWeb() ? { authUid: viewerId } : {}) });
  // Become this person first: the database only lets you join a company as yourself.
  state = { userId: u.id, preferences: {} };
  await save();
  if (input.joinOrgId) {
    const org = T.organizations.get(input.joinOrgId);
    // Only demo companies are open to self-join; real companies add people from Settings.
    if (!org?.isDemo) throw Errors.forbidden('Only the demo company can be joined directly. Ask a company admin to add you.');
    const m = await T.orgMembers.insert({ orgId: org.id, userId: u.id, role: 'employee', title: 'Guest', presence: 'available', avatar: {}, deactivatedAt: null, joinedAt: nowIso() });
    const dept = input.departmentId ? T.departments.get(input.departmentId) : undefined;
    if (dept && dept.orgId === org.id) await T.departmentMembers.insert({ id: `${dept.id}_${m.id}`, orgId: org.id, departmentId: dept.id, memberId: m.id, role: 'member', createdAt: nowIso() });
  }
  return { user: { id: u.id, email: u.email, name: u.name } };
}

export function account() {
  return isWeb() ? { email: viewerEmail } : null;
}

export async function signOut() {
  state = { userId: null, preferences: {} };
  await save();
  return { ok: true };
}

export async function setPreferences(body: unknown) {
  requireUser();
  const p = parse(z.object({ focusMode: z.boolean().optional(), reducedMotion: z.boolean().optional(), office3d: z.boolean().optional(), lastOrgId: z.string().uuid().optional() }), body);
  state = { ...state, preferences: { ...state.preferences, ...p } };
  await save();
  return { preferences: state.preferences };
}

export async function createCompany(body: unknown) {
  return createOrg(requireUser(), parse(createOrgSchema, body));
}
