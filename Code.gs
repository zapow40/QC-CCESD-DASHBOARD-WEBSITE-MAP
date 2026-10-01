/**
 * Quezon City Climate Change and Environmental Sustainability Department
 * Air quality + updates backend, stored on Google Drive.
 *
 * SETUP (one time)
 * 1. Open https://script.google.com and create a new project.
 * 2. Replace everything in Code.gs with this file, then save.
 * 3. Deploy ▸ New deployment ▸ type "Web app".
 *      Execute as: Me
 *      Who has access: Anyone
 * 4. Authorize when Google asks, then copy the Web app URL (it ends in /exec).
 * 5. Paste that URL into the site so it can read and write.
 *
 * The script creates a spreadsheet called "QC CCESD Data" and a Drive folder
 * called "QC CCESD Media" in your Drive the first time it runs. All bulletins,
 * stations, readings, and news posts live there.
 *
 * UPDATING AN EXISTING DEPLOYMENT (version 6 — interactive sensor maps)
 * 1. Replace everything in Code.gs with this file, then save.
 * 2. Deploy ▸ Manage deployments ▸ Edit (pencil) ▸ Version: New version ▸ Deploy.
 *    Keep "Execute as: Me" and "Who has access: Anyone".
 * The stations sheet gains two columns at the END (latitude, longitude), so your
 * existing rows keep their values and simply start empty until a sensor is
 * placed on the admin sensor map.
 */

var PROPS = PropertiesService.getScriptProperties();

/** Bumped whenever the site needs a newer deployment of this script. */
var API_VERSION = 6;

/** Everything inside this box is Quezon City — reject clearly wrong coordinates. */
var QC_BOUNDS = { south: 14.58, north: 14.79, west: 120.96, east: 121.13 };

var DATA_SHEET_NAME = 'QC CCESD Data';
var MEDIA_FOLDER_NAME = 'QC CCESD Media';
var TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

var TABLES = {
  admins: [
    'id',
    'email',
    'name',
    'role',
    'password_hash',
    'salt',
    'status',
    'created_at',
    'last_login_at',
  ],
  districts: ['id', 'number', 'name', 'slug', 'created_at'],
  /**
   * `latitude` / `longitude` are appended at the END on purpose: existing rows
   * keep their column positions, so no data is ever shifted.
   */
  stations: [
    'id',
    'district_slug',
    'name',
    'barangay',
    'active',
    'sort_order',
    'created_at',
    'latitude',
    'longitude',
  ],
  bulletins: [
    'id',
    'district_slug',
    'period_start',
    'period_end',
    'map_image_url',
    'notes',
    'status',
    'published_at',
    'created_at',
    'updated_at',
    'created_by',
    'updated_by',
  ],
  readings: ['id', 'bulletin_id', 'station_id', 'aqi_value', 'status', 'created_at'],
  audit_logs: ['id', 'actor_id', 'actor_name', 'actor_email', 'action', 'entity_type', 'entity_id', 'details', 'created_at'],
  updates: [
    'id',
    'title',
    'slug',
    'summary',
    'body',
    'cover_image_url',
    'status',
    'published_at',
    'created_at',
    'updated_at',
  ],
};

/* ------------------------------------------------------------------ *
 * Reference data: the six districts and their monitoring stations      *
 * ------------------------------------------------------------------ */

var DISTRICTS = [
  {
    number: 1,
    name: 'District 1',
    slug: 'district-1',
    map: 'https://cdn.enter.pro/resources/uid_100596755/61cb2e59-df4f-44.jpg',
    stations: [
      ['Quezon City General Hospital', 'Bahay Toro'],
      ['Road 8', 'Project 6'],
      ['Balintawak Cloverleaf', 'Balintawak'],
      ['Quezon City Science HS', 'Santo Cristo'],
      ['Bungad ES', 'Bungad'],
      ['San Francisco ES', 'Del Monte'],
      ['Sgt. Esguerra Footbridge / Q.Ave.', 'West Triangle'],
      ['San Jose HS', 'San Jose'],
      ['Banawe Chinatown', 'Sienna'],
      ['La Loma Police Station 1', 'NS Amoranto'],
      ['Sto. Domingo Church', 'Sto. Domingo'],
    ],
  },
  {
    number: 2,
    name: 'District 2',
    slug: 'district-2',
    map: 'https://cdn.enter.pro/resources/uid_100596755/2a670ea9-db98-41.jpg',
    stations: [
      ['Raymundo Punongbayan ES', 'Payatas'],
      ['QC Controlled Disposal Facility', 'Payatas'],
      ['Payatas Super Health Center', 'Payatas'],
      ['Commonwealth HS', 'Commonwealth'],
      ['Commonwealth BH', 'Commonwealth'],
      ['San Isidro Church', 'Bagong Silangan'],
      ['Jose Rizal HS', 'Holy Spirit'],
      ['Batasan Hills BH', 'Batasan Hills'],
      ['St. Peter Church Footbridge', 'Batasan Hills'],
      ['Holy Spirit ES', 'Holy Spirit'],
    ],
  },
  {
    number: 3,
    name: 'District 3',
    slug: 'district-3',
    map: 'https://cdn.enter.pro/resources/uid_100596755/082378d7-a36d-4d.jpg',
    stations: [
      ['Old Balara ES', 'Matandang Balara'],
      ['Pansol BH', 'Pansol'],
      ['Don Quintin Paredes HS', 'Quirino 2-B'],
      ['Batino (SPED) ES', 'Amihan'],
      ['Silangan BH', 'Silangan'],
      ['Teodora Alonzo ES', 'Marilag'],
      ['15th Ave. ES', 'Socorro'],
      ['Aguinaldo ES', 'San Roque'],
      ['Libis BH Footbridge', 'Libis'],
      ['Camp Gen. Aguinaldo HS', 'Camp Aguinaldo'],
      ['Obrero cor. Calle Industria', 'Bagumbayan'],
    ],
  },
  {
    number: 4,
    name: 'District 4',
    slug: 'district-4',
    map: 'https://cdn.enter.pro/resources/uid_100596755/9ed95030-f00e-4a.jpg',
    stations: [
      ['Quezon City Public Library', 'Central'],
      ['Krus na Ligas ES', 'Krus na Ligas'],
      ['Tomas Morato Ave.', 'Laging Handa'],
      ['Manuel A. Roxas Albert HS', 'Paligsahan'],
      ['Timog Ave. Footbridge / EDSA', 'Sacred Heart'],
      ['Ramon Magsaysay HS', 'Pinagkaisahan'],
      ['Kalusugan Health Center', 'Kalusugan'],
      ['E. Rodriguez Ave.', 'Doña Josefa'],
      ['Cubao Araneta Market', 'San Martin de Porres'],
      ['Betty Go Belmonte ES', 'Doña Imelda'],
      ['Valencia BH', 'Valencia'],
    ],
  },
  {
    number: 5,
    name: 'District 5',
    slug: 'district-5',
    map: 'https://cdn.enter.pro/resources/uid_100596755/4753a97c-eadb-46.jpg',
    stations: [
      ['Maligaya ES', 'Pasong Putik'],
      ['Susano Road', 'San Agustin'],
      ['San Agustin ES', 'San Agustin'],
      ['Kaligayahan ES', 'Kaligayahan'],
      ['Lagro HS', 'Greater Lagro'],
      ['Damong Maliit ES', 'Nagkaisang Nayon'],
      ['Novaliches Wet and Dry Market', 'Novaliches Proper'],
      ['Rosa L. Susano ES', 'Gulod'],
      ['SB Diversion Road', 'Nagkaisang Nayon'],
      ['Pearl Drive Footbridge', 'Fairview'],
      ['North Fairview ES', 'North Fairview'],
      ['Korphil - Quezon City University', 'San Bartolome'],
      ['West Fairview ES', 'Fairview'],
    ],
  },
  {
    number: 6,
    name: 'District 6',
    slug: 'district-6',
    map: 'https://cdn.enter.pro/resources/uid_100596755/2927547b-1e88-4c.jpg',
    stations: [
      ['Baluyot Satellite Hall', 'Sauyo'],
      ['Quirino Highway cor. Mindanao Ave.', 'Talipapa'],
      ['Tandang Sora BH Footbridge', 'Tandang Sora'],
      ['Melchora Aquino HS', 'Tandang Sora'],
      ['FEU Diliman', 'Pasong Tamo'],
      ['GSIS Village ES', 'Sangandaan'],
      ['Emilio Jacinto National HS', 'Pasong Tamo'],
      ['Quirino Highway cor. St. Dominic', 'Baesa'],
      ['Pasong Tamo ES', 'Pasong Tamo'],
      ['Culiat ES', 'Culiat'],
      ['Balumbato ES', 'Balon Bato'],
      ['New Era University', 'New Era'],
    ],
  },
];

var SEED_PERIOD_START = '2026-09-24T00:00:00.000Z'; // 8:00 AM Manila
var SEED_PERIOD_END = '2026-09-25T00:00:00.000Z'; // 8:00 AM Manila

/**
 * Run this once from the Apps Script editor to grant the permissions the
 * backend needs (Sheets + Drive). Pick "authorize" in the function dropdown and
 * click Run, then approve the Google prompt.
 */
function authorize() {
  ensureSeedData();
  mediaFolder();
  return 'Authorized. Districts: ' + readTable('districts').length;
}

function describeError(err) {
  var message = String(err);
  var needsPermission =
    message.indexOf('SpreadsheetApp') !== -1 ||
    message.indexOf('DriveApp') !== -1 ||
    message.indexOf('permission') !== -1 ||
    message.indexOf('pahintulot') !== -1 ||
    message.indexOf('authorization') !== -1;

  if (needsPermission) {
    return (
      'The backend has not been granted Google permissions yet. In the Apps Script ' +
      'editor pick the "authorize" function and click Run, then click Allow. Also ' +
      'check Deploy \u2023 Manage deployments \u203a Edit \u203a Execute as: Me.'
    );
  }
  return message;
}

/* ------------------------------------------------------------------ *
 * Owner activity log                                                   *
 * ------------------------------------------------------------------ */

function auditActorLabel(session) {
  if (!session) return { id: '', name: '', email: '' };
  var admin = adminRecordFor(session.email);
  return {
    id: String(session.id || admin && admin.id || ''),
    name: admin ? String(admin.name || '') : '',
    email: normalizeEmail(admin ? admin.email : session.email),
  };
}

function auditLog(session, action, entityType, entityId, details) {
  var actor = auditActorLabel(session);
  appendRecord('audit_logs', {
    id: Utilities.getUuid(),
    actor_id: actor.id,
    actor_name: actor.name,
    actor_email: actor.email,
    action: String(action || ''),
    entity_type: String(entityType || ''),
    entity_id: entityId == null ? '' : String(entityId),
    details: String(details || ''),
    created_at: nowIso(),
  });
}

function listAuditLogs() {
  return readTable('audit_logs')
    .map(function (row) {
      return {
        id: String(row.id),
        actorId: String(row.actor_id || ''),
        actorName: row.actor_name || '',
        actorEmail: normalizeEmail(row.actor_email || ''),
        action: row.action || '',
        entityType: row.entity_type || '',
        entityId: String(row.entity_id || ''),
        details: row.details || '',
        createdAt: toIsoString(row.created_at),
      };
    })
    .sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    })
    .slice(0, 500);
}

function logout(body) {
  var session = readSession(body.token);
  if (!session) return { loggedOut: true };
  auditLog(session, 'Logged out', 'account', session.id, 'Account signed out');
  var tokens = readTokens();
  delete tokens[body.token];
  writeTokens(tokens);
  return { loggedOut: true };
}

/* ------------------------------------------------------------------ *
 * HTTP entry points                                                    *
 * ------------------------------------------------------------------ */

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    switch (params.action) {
      case 'bootstrap':
        return respond(bootstrapPayload());
      case 'bulletins':
        return respond(listBulletins(params));
      case 'updates':
        return respond(listUpdates(params));
      case 'hub':
        return respond(bootstrapPayload());
      default:
        return respond({ error: 'Unknown action: ' + params.action });
    }
  } catch (err) {
    return respond({ error: describeError(err) });
  }
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return respond({ error: 'Invalid JSON body' });
  }

  try {
    switch (body.action) {
      case 'login':
        return respond(login(body));
      case 'auth.logout':
        return respond(logout(body));
      case 'register':
        return respond(register(body));
      case 'session':
        return respond(sessionInfo(body.token));
      case 'change-password':
        return respond(changePassword(body));
      case 'admins.list':
        return respond(withOwner(body, function () { return listAdmins(); }));
      case 'admins.save':
        return respond(withOwner(body, function (session) { return saveAdmin(body.admin, session); }));
      case 'admins.delete':
        return respond(withOwner(body, function (session) { return deleteAdmin(session, body.id); }));
      case 'admins.approve':
        return respond(withOwner(body, function (session) { return approveAdmin(session, body.id, body.decision); }));
      case 'audit.list':
        return respond(withOwner(body, function () { return listAuditLogs(); }));
      case 'bootstrap':
        return respond(bootstrapPayload());
      case 'station.save':
        return respond(withAuth(body, function (session) { return saveStation(body.station, session); }));
      case 'station.location':
        return respond(withAuth(body, function (session) {
          return saveStationLocation(body.id, body.latitude, body.longitude, session);
        }));
      case 'station.delete':
        return respond(withAuth(body, function (session) { return deleteStation(body.id, session); }));
      case 'bulletin.save':
        return respond(withAuth(body, function (session) { return saveBulletin(body.bulletin, session); }));
      case 'bulletin.delete':
        return respond(withAuth(body, function (session) { return deleteBulletin(body.id, session); }));
      case 'bulletin.publish':
        return respond(withAuth(body, function (session) { return setBulletinStatus(body.id, body.status, session); }));
      case 'update.save':
        return respond(withAuth(body, function (session) { return saveUpdate(body.post, session); }));
      case 'update.delete':
        return respond(withAuth(body, function (session) { return deleteUpdate(body.id, session); }));
      case 'upload':
        return respond(withAuth(body, function () { return uploadFile(body.file); }));
      default:
        return respond({ error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return respond({ error: describeError(err) });
  }
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/* ------------------------------------------------------------------ *
 * Authentication — one account per staff member                        *
 * ------------------------------------------------------------------ */

function hashPassword(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'qc-ccesd::' + salt + '::' + password,
    Utilities.Charset.UTF_8,
  );
  return digest
    .map(function (byte) {
      return (byte + 256).toString(16).slice(-2);
    })
    .join('');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

function adminRecordFor(email) {
  var admins = readTable('admins');
  for (var i = 0; i < admins.length; i++) {
    if (normalizeEmail(admins[i].email) === email) return admins[i];
  }
  return null;
}

function countOwners(admins) {
  return admins.filter(function (admin) {
    return admin.role === 'owner';
  }).length;
}

/**
 * Self-service account request. The first ever account becomes the owner and is
 * signed in straight away; every later request waits as `pending` until an
 * owner approves it.
 */
function register(body) {
  var email = normalizeEmail(body.email);
  var password = body.password;

  if (!emailIsValid(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (!isValidPassword(password)) {
    return { error: 'Passwords must be at least 8 characters.' };
  }

  var admins = readTable('admins');
  if (adminRecordFor(email)) {
    return { error: 'An account already exists for that email. Sign in instead.' };
  }

  var salt = Utilities.getUuid();
  var isFirstAccount = admins.length === 0;
  var record = appendRecord('admins', {
    id: Utilities.getUuid(),
    email: email,
    name: String(body.name || '').trim() || email.split('@')[0],
    role: isFirstAccount ? 'owner' : 'new',
    password_hash: hashPassword(password, salt),
    salt: salt,
    status: isFirstAccount ? 'active' : 'pending',
    created_at: nowIso(),
    last_login_at: isFirstAccount ? nowIso() : '',
  });

  if (isFirstAccount) {
    return {
      token: issueToken(record),
      email: email,
      role: 'owner',
      firstRun: true,
    };
  }
  return { pending: true, email: email };
}

/** Sign in with an email and password. The very first sign-in creates the owner. */
function login(body) {
  var email = normalizeEmail(body.email);
  var password = body.password;

  if (!emailIsValid(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (!isValidPassword(password)) {
    return { error: 'Passwords must be at least 8 characters.' };
  }

  var admins = readTable('admins');

  if (admins.length === 0) {
    var salt = Utilities.getUuid();
    var owner = appendRecord('admins', {
      id: Utilities.getUuid(),
      email: email,
      name: String(body.name || '').trim() || email.split('@')[0],
      role: 'owner',
      password_hash: hashPassword(password, salt),
      salt: salt,
      status: 'active',
      created_at: nowIso(),
      last_login_at: nowIso(),
    });
    var token = issueToken(owner);
    auditLog({ id: owner.id, email: owner.email, role: 'owner' }, 'Logged in', 'account', owner.id, 'First owner account created and signed in');
    return { token: token, email: email, role: 'owner', firstRun: true };
  }

  var admin = adminRecordFor(email);
  if (!admin) {
    return { error: 'No admin account is registered for that email.' };
  }
  if (String(admin.status) === 'pending') {
    return {
      error:
        'Your account is waiting for approval by the main admin. You will be able to sign in once it is approved.',
    };
  }
  if (String(admin.status) === 'disabled') {
    return { error: 'That account has been disabled by an owner.' };
  }
  if (hashPassword(password, admin.salt) !== admin.password_hash) {
    return { error: 'Incorrect password.' };
  }

  updateRecord('admins', admin.id, { last_login_at: nowIso() });
  var token = issueToken(admin);
  auditLog({ id: admin.id, email: admin.email, role: admin.role }, 'Logged in', 'account', admin.id, 'Successful sign in');
  return { token: token, email: normalizeEmail(admin.email), role: admin.role === 'owner' ? 'owner' : 'admin' };
}

function readTokens() {
  try {
    return JSON.parse(PROPS.getProperty('tokens') || '{}') || {};
  } catch (err) {
    return {};
  }
}

function writeTokens(tokens) {
  PROPS.setProperty('tokens', JSON.stringify(tokens));
}

function issueToken(admin) {
  var now = Date.now();
  var tokens = readTokens();
  Object.keys(tokens).forEach(function (key) {
    var entry = tokens[key];
    if (!entry || !entry.exp || entry.exp < now) delete tokens[key];
  });
  var token = Utilities.getUuid();
  tokens[token] = {
    id: String(admin.id),
    email: normalizeEmail(admin.email),
    role: admin.role === 'owner' ? 'owner' : 'admin',
    exp: now + TOKEN_TTL_MS,
  };
  writeTokens(tokens);
  return token;
}

/** Returns `{ id, email, role }` for a live token, or null. */
function readSession(token) {
  if (!token) return null;
  var tokens = readTokens();
  var entry = tokens[token];
  if (!entry || !entry.exp || entry.exp < Date.now()) return null;
  return { id: entry.id, email: entry.email, role: entry.role };
}

function withAuth(body, run) {
  var session = readSession(body.token);
  if (!session) {
    return { error: 'Your session expired. Sign in again.' };
  }
  return run(session);
}

function withOwner(body, run) {
  var session = readSession(body.token);
  if (!session) {
    return { error: 'Your session expired. Sign in again.' };
  }
  if (session.role !== 'owner') {
    return { error: 'Only an owner can manage admin accounts.' };
  }
  return run(session);
}

function sessionInfo(token) {
  var session = readSession(token);
  if (!session) return { valid: false };
  return { valid: true, email: session.email, role: session.role };
}

function changePassword(body) {
  var session = readSession(body.token);
  if (!session) {
    return { error: 'Your session expired. Sign in again.' };
  }
  var admin = adminRecordFor(session.email);
  if (!admin) {
    return { error: 'That account no longer exists.' };
  }
  if (hashPassword(body.currentPassword, admin.salt) !== admin.password_hash) {
    return { error: 'Your current password is not correct.' };
  }
  if (!isValidPassword(body.password)) {
    return { error: 'Use a password with at least 8 characters.' };
  }

  var salt = Utilities.getUuid();
  updateRecord('admins', admin.id, {
    password_hash: hashPassword(body.password, salt),
    salt: salt,
  });
  writeTokens({});
  var refreshed = adminRecordFor(session.email);
  return { changed: true, token: issueToken(refreshed) };
}

/* ------------------------------------------------------------------ *
 * Admin accounts                                                       *
 * ------------------------------------------------------------------ */

function mapAdmin(record) {
  return {
    id: String(record.id),
    email: normalizeEmail(record.email),
    name: record.name || '',
    role:
      String(record.status) === 'pending'
        ? 'new'
        : record.role === 'owner'
          ? 'owner'
          : 'admin',
    status:
      String(record.status) === 'pending'
        ? 'pending'
        : String(record.status) === 'disabled'
          ? 'disabled'
          : 'active',
    lastLoginAt: toIsoString(record.last_login_at),
    createdAt: toIsoString(record.created_at),
  };
}

function listAdmins() {
  return readTable('admins')
    .map(mapAdmin)
    .sort(function (a, b) {
      var rank = { owner: 0, admin: 1, new: 2 };
      var ar = rank[a.role] === undefined ? 3 : rank[a.role];
      var br = rank[b.role] === undefined ? 3 : rank[b.role];
      if (ar !== br) return ar - br;
      return String(a.email).localeCompare(String(b.email));
    });
}

function saveAdmin(admin, session) {
  if (!admin) {
    return { error: 'No account details received.' };
  }
  var email = normalizeEmail(admin.email);
  if (!emailIsValid(email)) {
    return { error: 'Enter a valid email address.' };
  }

  var admins = readTable('admins');
  var role = admin.role === 'owner' ? 'owner' : 'admin';

  var duplicate = admins.filter(function (existing) {
    return normalizeEmail(existing.email) === email && String(existing.id) !== String(admin.id || '');
  })[0];
  if (duplicate) {
    return { error: 'Another admin already uses that email.' };
  }

  if (admin.id) {
    var current = admins.filter(function (existing) {
      return String(existing.id) === String(admin.id);
    })[0];
    if (!current) {
      return { error: 'That account no longer exists.' };
    }
    if (current.role === 'owner' && countOwners(admins) <= 1 && role !== 'owner') {
      return { error: 'Keep at least one owner account.' };
    }

    var patch = {
      email: email,
      name: String(admin.name || '').trim() || current.name,
      role: role,
      status: String(admin.status) === 'disabled' ? 'disabled' : 'active',
    };
    if (admin.password) {
      if (!isValidPassword(admin.password)) {
        return { error: 'Passwords must be at least 8 characters.' };
      }
      patch.salt = Utilities.getUuid();
      patch.password_hash = hashPassword(admin.password, patch.salt);
    }
    updateRecord('admins', admin.id, patch);
    auditLog(session, 'Updated account', 'account', admin.id, 'Updated admin account ' + email);
    return { admin: { id: String(admin.id) } };
  }

  if (!isValidPassword(admin.password)) {
    return { error: 'Set a password of at least 8 characters for the new admin.' };
  }

  var salt = Utilities.getUuid();
  var record = appendRecord('admins', {
    id: Utilities.getUuid(),
    email: email,
    name: String(admin.name || '').trim() || email.split('@')[0],
    role: role,
    password_hash: hashPassword(admin.password, salt),
    salt: salt,
    status: 'active',
    created_at: nowIso(),
    last_login_at: '',
  });
  auditLog(session, 'Created account', 'account', record.id, 'Created admin account ' + email);
  return { admin: { id: String(record.id) } };
}

function deleteAdmin(session, id) {
  if (!id) {
    return { error: 'Missing account id.' };
  }
  if (String(session.id) === String(id)) {
    return { error: 'You cannot remove your own account.' };
  }
  var admins = readTable('admins');
  var target = admins.filter(function (admin) {
    return String(admin.id) === String(id);
  })[0];
  if (!target) {
    return { deleted: false };
  }
  if (target.role === 'owner' && countOwners(admins) <= 1) {
    return { error: 'Keep at least one owner account.' };
  }
  var deleted = deleteRecord('admins', id);
  if (deleted) auditLog(session, 'Deleted account', 'account', id, 'Removed ' + normalizeEmail(target.email));
  return deleted;
}

/**
 * Approve a requested account, or decline it (which removes the request).
 * New self-registered accounts are stored as role=new/status=pending.
 * Approval is the only transition that grants the admin role.
 */
function approveAdmin(session, id, decision) {
  if (!id) {
    return { error: 'Missing account id.' };
  }
  var admins = readTable('admins');
  var target = admins.filter(function (admin) {
    return String(admin.id) === String(id);
  })[0];
  if (!target) {
    return { error: 'That account no longer exists.' };
  }

  if (String(target.status) !== 'pending') {
    return { error: 'Only a new account waiting for approval can be approved or rejected.' };
  }

  if (decision === 'reject') {
    var rejected = deleteRecord('admins', id);
    if (rejected) auditLog(session, 'Rejected account', 'account', id, 'Rejected ' + normalizeEmail(target.email));
    return rejected;
  }

  updateRecord('admins', id, { role: 'admin', status: 'active' });
  auditLog(session, 'Approved account', 'account', id, 'Approved ' + normalizeEmail(target.email));
  return { admin: { id: String(id), role: 'admin', status: 'active' } };
}

/* ------------------------------------------------------------------ *
 * Sheet helpers                                                        *
 * ------------------------------------------------------------------ */

function dataSpreadsheet() {
  var id = PROPS.getProperty('sheet_id');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      PROPS.deleteProperty('sheet_id');
    }
  }
  var created = SpreadsheetApp.create(DATA_SHEET_NAME);
  PROPS.setProperty('sheet_id', created.getId());
  return created;
}

function sheetFor(name) {
  var ss = dataSpreadsheet();
  var sheet = ss.getSheetByName(name);
  var headers = TABLES[name];
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  // Keep the header row in sync when the schema gains new columns.
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function readTable(name) {
  var sheet = sheetFor(name);
  var headers = TABLES[name];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(function (row) {
      return row[0] !== '' && row[0] !== null;
    })
    .map(function (row) {
      var record = {};
      headers.forEach(function (header, index) {
        record[header] = row[index];
      });
      return record;
    });
}

function appendRecord(name, record) {
  var sheet = sheetFor(name);
  var headers = TABLES[name];
  sheet.appendRow(
    headers.map(function (header) {
      var value = record[header];
      return value === undefined || value === null ? '' : value;
    }),
  );
  return record;
}

function rowIndexById(name, id) {
  var sheet = sheetFor(name);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function updateRecord(name, id, patch) {
  var sheet = sheetFor(name);
  var headers = TABLES[name];
  var rowIndex = rowIndexById(name, id);
  if (rowIndex === -1) return null;
  var current = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var merged = {};
  headers.forEach(function (header, index) {
    merged[header] = current[index];
  });
  Object.keys(patch).forEach(function (key) {
    if (headers.indexOf(key) !== -1 && patch[key] !== undefined) {
      merged[key] = patch[key];
    }
  });
  sheet
    .getRange(rowIndex, 1, 1, headers.length)
    .setValues([headers.map(function (header) { return merged[header]; })]);
  return merged;
}

function deleteRecord(name, id) {
  var rowIndex = rowIndexById(name, id);
  if (rowIndex === -1) return { deleted: false };
  sheetFor(name).deleteRow(rowIndex);
  return { deleted: true };
}

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ *
 * Seeding                                                             *
 * ------------------------------------------------------------------ */

function ensureSeedData() {
  var districts = readTable('districts');
  if (districts.length === 0) {
    DISTRICTS.forEach(function (district) {
      appendRecord('districts', {
        id: Utilities.getUuid(),
        number: district.number,
        name: district.name,
        slug: district.slug,
        created_at: nowIso(),
      });
    });
  }

  var stations = readTable('stations');
  if (stations.length === 0) {
    DISTRICTS.forEach(function (district) {
      district.stations.forEach(function (station, index) {
        appendRecord('stations', {
          id: Utilities.getUuid(),
          district_slug: district.slug,
          name: station[0],
          barangay: station[1],
          active: true,
          sort_order: index,
          created_at: nowIso(),
        });
      });
    });
  }

  var bulletins = readTable('bulletins');
  if (bulletins.length === 0) {
    DISTRICTS.forEach(function (district) {
      appendRecord('bulletins', {
        id: Utilities.getUuid(),
        district_slug: district.slug,
        period_start: SEED_PERIOD_START,
        period_end: SEED_PERIOD_END,
        map_image_url: district.map,
        notes: '',
        status: 'published',
        published_at: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    });
  }
}

/* ------------------------------------------------------------------ *
 * Reads                                                               *
 * ------------------------------------------------------------------ */

function bootstrapPayload() {
  ensureSeedData();
  var districts = readTable('districts').sort(function (a, b) {
    return Number(a.number) - Number(b.number);
  });
  var stations = readTable('stations').sort(function (a, b) {
    return Number(a.sort_order) - Number(b.sort_order);
  });

  var withStations = districts.map(function (district) {
    return {
      slug: district.slug,
      number: Number(district.number),
      name: district.name,
      stations: stations
        .filter(function (station) {
          return standardiseActive(station.active) && station.district_slug === district.slug;
        })
        .map(function (station) {
          return {
            id: String(station.id),
            name: station.name,
            barangay: station.barangay,
            active: standardiseActive(station.active),
            sortOrder: Number(station.sort_order) || 0,
            latitude: coordinateOrNull(station.latitude),
            longitude: coordinateOrNull(station.longitude),
          };
        }),
    };
  });

  return {
    apiVersion: API_VERSION,
    districts: withStations,
    hasAccounts: readTable('admins').length > 0,
  };
}

function standardiseActive(value) {
  if (value === true) return true;
  var text = String(value).toLowerCase();
  return text === 'true' || text === 'yes' || text === '1';
}

function mapBulletin(record) {
  return {
    id: String(record.id),
    districtSlug: record.district_slug,
    periodStart: toIsoString(record.period_start),
    periodEnd: toIsoString(record.period_end),
    mapImageUrl: record.map_image_url || '',
    notes: record.notes || '',
    status: record.status || 'draft',
    publishedAt: toIsoString(record.published_at),
    updatedAt: toIsoString(record.updated_at),
    createdBy: record.created_by || '',
    updatedBy: record.updated_by || '',
  };
}

function toIsoString(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function listBulletins(params) {
  ensureSeedData();
  var status = params.status || 'published';
  var districtSlug = params.district_slug || '';
  var readings = readTable('readings');

  return readTable('bulletins')
    .filter(function (bulletin) {
      if (status !== 'all' && String(bulletin.status) !== status) return false;
      if (districtSlug && bulletin.district_slug !== districtSlug) return false;
      return true;
    })
    .map(function (bulletin) {
      var mapped = mapBulletin(bulletin);
      mapped.readings = readings
        .filter(function (reading) {
          return String(reading.bulletin_id) === String(bulletin.id);
        })
        .map(function (reading) {
          return {
            stationId: String(reading.station_id),
            aqiValue:
              reading.aqi_value === '' || reading.aqi_value === null
                ? null
                : Number(reading.aqi_value),
            status: reading.status || 'ok',
          };
        });
      return mapped;
    })
    .sort(function (a, b) {
      return String(b.periodStart).localeCompare(String(a.periodStart));
    });
}

function mapUpdate(record) {
  return {
    id: String(record.id),
    title: record.title,
    slug: record.slug,
    summary: record.summary || '',
    body: record.body || '',
    coverImageUrl: record.cover_image_url || '',
    status: record.status || 'draft',
    publishedAt: toIsoString(record.published_at),
    updatedAt: toIsoString(record.updated_at),
  };
}

function listUpdates(params) {
  var status = params.status || 'published';
  return readTable('updates')
    .filter(function (post) {
      return status === 'all' || String(post.status) === status;
    })
    .map(mapUpdate)
    .sort(function (a, b) {
      return String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt));
    });
}

/* ------------------------------------------------------------------ *
 * Writes                                                              *
 * ------------------------------------------------------------------ */

/** Numeric coordinate from a sheet cell, or null when it is empty/not a number. */
function coordinateOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  var numeric = Number(value);
  return isFinite(numeric) ? numeric : null;
}

/** True when a latitude/longitude pair is inside Quezon City. */
function isWithinQuezonCity(latitude, longitude) {
  return (
    isFinite(latitude) &&
    isFinite(longitude) &&
    latitude >= QC_BOUNDS.south &&
    latitude <= QC_BOUNDS.north &&
    longitude >= QC_BOUNDS.west &&
    longitude <= QC_BOUNDS.east
  );
}

function saveStation(station, session) {
  if (!station || !station.name || !station.districtSlug) {
    return { error: 'A station needs a name and a district.' };
  }
  var latitude = coordinateOrNull(station.latitude);
  var longitude = coordinateOrNull(station.longitude);
  var coordinates = {};
  if (latitude !== null && longitude !== null) {
    if (!isWithinQuezonCity(latitude, longitude)) {
      return { error: 'Those coordinates are outside Quezon City.' };
    }
    coordinates.latitude = latitude;
    coordinates.longitude = longitude;
  }

  if (station.id) {
    var patch = {
      name: station.name,
      barangay: station.barangay || '',
      district_slug: station.districtSlug,
      active: station.active !== false,
    };
    Object.keys(coordinates).forEach(function (key) {
      patch[key] = coordinates[key];
    });
    var updated = updateRecord('stations', station.id, patch);
    if (updated) auditLog(session, 'Edited monitoring station', 'station', station.id, station.name);
    return { station: updated ? { id: String(station.id) } : null };
  }
  var record = appendRecord('stations', {
    id: Utilities.getUuid(),
    district_slug: station.districtSlug,
    name: station.name,
    barangay: station.barangay || '',
    active: station.active !== false,
    sort_order: station.sortOrder === undefined ? 999 : station.sortOrder,
    created_at: nowIso(),
    latitude: coordinates.latitude === undefined ? '' : coordinates.latitude,
    longitude: coordinates.longitude === undefined ? '' : coordinates.longitude,
  });
  auditLog(session, 'Created monitoring station', 'station', record.id, station.name);
  return { station: { id: String(record.id) } };
}

/**
 * Move one sensor. Only `latitude` / `longitude` change — the station's name,
 * barangay, district and active flag are never touched.
 */
function saveStationLocation(id, latitude, longitude, session) {
  if (!id) return { error: 'Missing station id.' };
  var lat = Number(latitude);
  var lng = Number(longitude);
  if (!isFinite(lat) || !isFinite(lng)) {
    return { error: 'Latitude and longitude must be numbers.' };
  }
  if (!isWithinQuezonCity(lat, lng)) {
    return { error: 'Those coordinates are outside Quezon City.' };
  }
  var existing = readTable('stations').filter(function (station) {
    return String(station.id) === String(id);
  })[0];
  if (!existing) return { error: 'That monitoring station no longer exists.' };

  var updated = updateRecord('stations', id, { latitude: lat, longitude: lng });
  if (!updated) return { error: 'That monitoring station no longer exists.' };

  auditLog(
    session,
    'Moved monitoring station',
    'station',
    id,
    existing.name + ' → ' + lat.toFixed(6) + ', ' + lng.toFixed(6),
  );
  return { station: { id: String(id), latitude: lat, longitude: lng } };
}

function deleteStation(id, session) {
  if (!id) return { error: 'Missing station id.' };
  var readings = readTable('readings').filter(function (reading) {
    return String(reading.station_id) === String(id);
  });
  readings.forEach(function (reading) {
    deleteRecord('readings', reading.id);
  });
  var deleted = deleteRecord('stations', id);
  if (deleted) auditLog(session, 'Deleted monitoring station', 'station', id, 'Removed monitoring station');
  return deleted;
}

function bulletinActorLabel(session) {
  if (!session) return '';
  var admin = adminRecordFor(session.email);
  if (!admin) return normalizeEmail(session.email);
  var name = String(admin.name || '').trim();
  var email = normalizeEmail(admin.email || session.email);
  return name ? name + ' (' + email + ')' : email;
}

function saveBulletin(bulletin, session) {
  if (!bulletin || !bulletin.districtSlug) {
    return { error: 'Choose a district for this bulletin.' };
  }
  if (!bulletin.periodStart || !bulletin.periodEnd) {
    return { error: 'Set the monitoring period.' };
  }
  if (new Date(bulletin.periodEnd) <= new Date(bulletin.periodStart)) {
    return { error: 'The period must end after it starts.' };
  }

  var status = bulletin.status === 'published' ? 'published' : 'draft';
  var payload = {
    district_slug: bulletin.districtSlug,
    period_start: bulletin.periodStart,
    period_end: bulletin.periodEnd,
    map_image_url: bulletin.mapImageUrl || '',
    notes: bulletin.notes || '',
    status: status,
    updated_at: nowIso(),
    updated_by: bulletinActorLabel(session),
  };

  var bulletinId = bulletin.id;
  if (bulletinId) {
    updateRecord('bulletins', bulletinId, payload);
    auditLog(session, 'Edited bulletin', 'bulletin', bulletinId, 'Saved district bulletin');
  } else {
    payload.id = Utilities.getUuid();
    payload.created_at = nowIso();
    payload.created_by = bulletinActorLabel(session);
    if (status === 'published') payload.published_at = nowIso();
    bulletinId = payload.id;
    appendRecord('bulletins', payload);
    auditLog(session, 'Created bulletin', 'bulletin', bulletinId, 'Created district bulletin');
  }

  if (status === 'published' && !payload.published_at) {
    updateRecord('bulletins', bulletinId, { published_at: nowIso() });
  }

  var existing = readTable('readings');
  existing
    .filter(function (reading) {
      return String(reading.bulletin_id) === String(bulletinId);
    })
    .forEach(function (reading) {
      deleteRecord('readings', reading.id);
    });

  (bulletin.readings || []).forEach(function (reading) {
    if (!reading || !reading.stationId) return;
    var offline = reading.status === 'offline' || reading.aqiValue === null || reading.aqiValue === '';
    appendRecord('readings', {
      id: Utilities.getUuid(),
      bulletin_id: bulletinId,
      station_id: reading.stationId,
      aqi_value: offline ? '' : Number(reading.aqiValue),
      status: offline ? 'offline' : 'ok',
      created_at: nowIso(),
    });
  });

  return { id: String(bulletinId), status: status };
}

function setBulletinStatus(id, status, session) {
  if (!id) return { error: 'Missing bulletin id.' };
  var normalised = status === 'published' ? 'published' : 'draft';
  var patch = { status: normalised, updated_at: nowIso(), updated_by: bulletinActorLabel(session) };
  if (normalised === 'published') patch.published_at = nowIso();
  var changed = updateRecord('bulletins', id, patch);
  if (changed) auditLog(session, normalised === 'published' ? 'Published bulletin' : 'Unpublished bulletin', 'bulletin', id, normalised === 'published' ? 'Published district bulletin' : 'Moved bulletin back to draft');
  return { bulletin: changed ? normalised : null };
}

function deleteBulletin(id, session) {
  if (!id) return { error: 'Missing bulletin id.' };
  readTable('readings')
    .filter(function (reading) {
      return String(reading.bulletin_id) === String(id);
    })
    .forEach(function (reading) {
      deleteRecord('readings', reading.id);
    });
  var deleted = deleteRecord('bulletins', id);
  if (deleted) auditLog(session, 'Deleted bulletin', 'bulletin', id, 'Deleted district bulletin');
  return deleted;
}

function saveUpdate(post, session) {
  if (!post || !post.title) {
    return { error: 'Give the update a title.' };
  }
  var slug = post.slug || slugify(post.title);
  var status = post.status === 'published' ? 'published' : 'draft';
  var payload = {
    title: post.title,
    slug: slug,
    summary: post.summary || '',
    body: post.body || '',
    cover_image_url: post.coverImageUrl || '',
    status: status,
    updated_at: nowIso(),
  };

  if (post.id) {
    updateRecord('updates', post.id, payload);
    if (status === 'published') updateRecord('updates', post.id, { published_at: post.publishedAt || nowIso() });
    auditLog(session, 'Edited news update', 'update', post.id, status === 'published' ? 'Saved and published news update' : 'Saved news update');
    return { id: String(post.id), slug: slug, status: status };
  }

  payload.id = Utilities.getUuid();
  payload.created_at = nowIso();
  payload.published_at = status === 'published' ? nowIso() : '';
  appendRecord('updates', payload);
  auditLog(session, status === 'published' ? 'Posted news update' : 'Created news update', 'update', payload.id, status === 'published' ? 'Published news update' : 'Created draft news update');
  return { id: String(payload.id), slug: slug, status: status };
}

function deleteUpdate(id, session) {
  if (!id) return { error: 'Missing update id.' };
  var deleted = deleteRecord('updates', id);
  if (deleted) auditLog(session, 'Deleted news update', 'update', id, 'Deleted news update');
  return deleted;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/* ------------------------------------------------------------------ *
 * Image upload to Drive                                                *
 * ------------------------------------------------------------------ */

function mediaFolder() {
  var folders = DriveApp.getFoldersByName(MEDIA_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(MEDIA_FOLDER_NAME);
}

function uploadFile(file) {
  if (!file || !file.dataBase64) {
    return { error: 'No file data received.' };
  }
  var name = file.filename || 'upload-' + Utilities.getUuid();
  var blob = Utilities.newBlob(
    Utilities.base64Decode(file.dataBase64),
    file.mimeType || 'application/octet-stream',
    name,
  );
  var driveFile = mediaFolder().createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: 'https://lh3.googleusercontent.com/d/' + driveFile.getId(),
    id: driveFile.getId(),
    name: driveFile.getName(),
  };
}
