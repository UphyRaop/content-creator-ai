import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export type AuthUser={id:string;email:string};
export type LoginResult={user:AuthUser;token:string;expiresAt:string};
const globals=globalThis as typeof globalThis&{ccaiAuthDb?:DatabaseSync};
function db(){
  if(globals.ccaiAuthDb)return globals.ccaiAuthDb;
  const filename=process.env.CCAI_DATABASE_PATH||resolve(process.cwd(),"data","ccai.sqlite");
  if(filename!==":memory:")mkdirSync(dirname(filename),{recursive:true});
  const conn=new DatabaseSync(filename);conn.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  conn.exec(`CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT);
    CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);
    CREATE TABLE IF NOT EXISTS auth_login_limits(key_hash TEXT PRIMARY KEY,window_started_at INTEGER NOT NULL,attempts INTEGER NOT NULL,blocked_until INTEGER NOT NULL DEFAULT 0);`);
  globals.ccaiAuthDb=conn;return conn;
}
const emailPattern=/^[^\s@]{1,128}@[^\s@.]{1,128}(?:\.[^\s@.]{2,63})+$/;
function normalizedEmail(email:string){return email.trim().toLowerCase();}
function passwordHash(password:string){const salt=randomBytes(16),hash=scryptSync(password,salt,64);return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;}
function verifyPassword(password:string,encoded:string){try{const [algorithm,salt,expected]=encoded.split("$");if(algorithm!=="scrypt"||!salt||!expected)return false;const expectedBytes=Buffer.from(expected,"base64url"),actual=scryptSync(password,Buffer.from(salt,"base64url"),expectedBytes.length);return expectedBytes.length===actual.length&&timingSafeEqual(expectedBytes,actual);}catch{return false;}}
function userFromRow(row:any):AuthUser{return{id:String(row.id),email:String(row.email)};}
function addOwnerColumn(conn:DatabaseSync,table:string){
  const exists=conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);if(!exists)return;
  const columns=conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{name:string}>;
  if(!columns.some(x=>x.name==="owner_id"))conn.exec(`ALTER TABLE ${table} ADD COLUMN owner_id TEXT`);
  conn.exec(`CREATE INDEX IF NOT EXISTS ${table}_owner_id_idx ON ${table}(owner_id)`);
}
function tableExists(conn:DatabaseSync,table:string){return !!conn.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);}
/** First-owner bootstrap. The secret is server-only; first user creation and legacy row claiming are one SQLite transaction. */
export function bootstrapOwner(token:string,email:string,password:string):AuthUser{
  const secret=process.env.CCAI_BOOTSTRAP_TOKEN;if(!secret||!token||!safeCompare(token,secret))throw new Error("Bootstrap authorization failed.");
  const cleanEmail=normalizedEmail(email);if(!emailPattern.test(cleanEmail)||password.length<12||password.length>256)throw new Error("Use a valid email and a password of 12–256 characters.");
  const conn=db();conn.exec("BEGIN IMMEDIATE");try{
    if(Number((conn.prepare("SELECT count(*) AS count FROM auth_users").get() as any).count)>0)throw new Error("Bootstrap is disabled after the first account is created.");
    for(const table of ["projects","workspace_entities","voice_api_accounts","voice_api_settings","voice_usage_events"])addOwnerColumn(conn,table);
    const id=randomBytes(16).toString("hex"),createdAt=new Date().toISOString();
    conn.prepare("INSERT INTO auth_users(id,email,password_hash,created_at) VALUES(?,?,?,?)").run(id,cleanEmail,passwordHash(password),createdAt);
    for(const table of ["projects","workspace_entities","voice_api_accounts","voice_api_settings","voice_usage_events"])if(tableExists(conn,table))conn.prepare(`UPDATE ${table} SET owner_id=? WHERE owner_id IS NULL`).run(id);
    conn.exec("COMMIT");return{id,email:cleanEmail};
  }catch(error){conn.exec("ROLLBACK");throw error;}
}
function safeCompare(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function countUsers(){return Number((db().prepare("SELECT count(*) AS count FROM auth_users").get() as any).count);}
export function consumeLoginAttempt(key:string,now=Date.now(),limit=8):{allowed:boolean;retryAfterSeconds:number}{
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("Invalid login limit.");
  const conn=db(),keyHash=createHash("sha256").update(key).digest("hex"),windowMs=15*60_000;
  conn.exec("BEGIN IMMEDIATE");try{
    const row=conn.prepare("SELECT * FROM auth_login_limits WHERE key_hash=?").get(keyHash) as any;
    let started=Number(row?.window_started_at||now),attempts=Number(row?.attempts||0),blocked=Number(row?.blocked_until||0);
    if(now-started>=windowMs){started=now;attempts=0;blocked=0;}
    if(blocked>now){conn.prepare("UPDATE auth_login_limits SET window_started_at=?,attempts=?,blocked_until=? WHERE key_hash=?").run(started,attempts,blocked,keyHash);conn.exec("COMMIT");return{allowed:false,retryAfterSeconds:Math.ceil((blocked-now)/1000)};}
    attempts++;if(attempts>=limit)blocked=now+windowMs;
    conn.prepare("INSERT INTO auth_login_limits(key_hash,window_started_at,attempts,blocked_until) VALUES(?,?,?,?) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,attempts=excluded.attempts,blocked_until=excluded.blocked_until").run(keyHash,started,attempts,blocked);
    conn.exec("COMMIT");return{allowed:blocked===0,retryAfterSeconds:blocked?windowMs/1000:0};
  }catch(e){conn.exec("ROLLBACK");throw e;}
}
export function checkLoginAllowed(key:string,now=Date.now()):{allowed:boolean;retryAfterSeconds:number}{
  const keyHash=createHash("sha256").update(key).digest("hex"),row=db().prepare("SELECT blocked_until FROM auth_login_limits WHERE key_hash=?").get(keyHash) as any;
  const blocked=Number(row?.blocked_until||0);return blocked>now?{allowed:false,retryAfterSeconds:Math.ceil((blocked-now)/1000)}:{allowed:true,retryAfterSeconds:0};
}
export function recordLoginFailure(key:string,now=Date.now()){return consumeLoginAttempt(key,now,8);}
export function authenticate(email:string,password:string):AuthUser|null{
  const row=db().prepare("SELECT id,email,password_hash FROM auth_users WHERE email=? COLLATE NOCASE").get(normalizedEmail(email)) as any;
  const valid=verifyPassword(password,typeof row?.password_hash==="string"?row.password_hash:"scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  return row&&valid?userFromRow(row):null;
}
export function createSession(userId:string,now=new Date()):LoginResult{
  const user=db().prepare("SELECT id,email FROM auth_users WHERE id=?").get(userId) as any;if(!user)throw new Error("Account not found.");
  const token=randomBytes(32).toString("base64url"),createdAt=now.toISOString(),expiresAt=new Date(now.getTime()+7*24*60*60_000).toISOString();
  db().prepare("INSERT INTO auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").run(createHash("sha256").update(token).digest("hex"),userId,createdAt,expiresAt);
  return{user:userFromRow(user),token,expiresAt};
}
export function getSession(token:string,now=new Date()):AuthUser|null{
  if(!token||token.length>200)return null;const row=db().prepare("SELECT u.id,u.email FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? ").get(createHash("sha256").update(token).digest("hex"),now.toISOString()) as any;
  return row?userFromRow(row):null;
}
export function revokeSession(token:string){if(!token||token.length>200)return false;return Number(db().prepare("UPDATE auth_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL").run(new Date().toISOString(),createHash("sha256").update(token).digest("hex")).changes)>0;}
