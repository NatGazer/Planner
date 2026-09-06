'use strict';
/**
 * Child process for the concurrency test: signs in and hammers one task.
 * Run separately so the submissions genuinely race across OS processes on the
 * same database file, rather than interleaving inside one event loop.
 *   node race-worker.js <port> <email> <password> <taskId>
 */
const [, , port, email, password, taskId] = process.argv;

async function main() {
  const base = `http://127.0.0.1:${port}`;
  const signIn = await fetch(`${base}/api/auth/sign-in`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (signIn.headers.getSetCookie?.() || [signIn.headers.get('set-cookie')]).filter(Boolean)
    .map((c) => c.split(';')[0]).join('; ');

  const form = new FormData();
  form.append('photo', new Blob([Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080200000090' +
    '7753de0000000c4944415408d763f8cfc0000003010100b5e2ac9d0000000049454e44ae426082', 'hex')],
  { type: 'image/png' }), 'proof.png');
  const up = await fetch(`${base}/api/photos`, { method: 'POST', headers: { cookie }, body: form });
  const { photoId } = await up.json();

  const res = await fetch(`${base}/api/worker/tasks/${taskId}/complete`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ confirmed: true, photoId, comment: `from ${email}` }),
  });
  const body = await res.json().catch(() => ({}));
  process.stdout.write(JSON.stringify({ status: res.status, code: body?.error?.code || (body.ok ? 'OK' : 'UNKNOWN') }));
}

main().catch((e) => { process.stdout.write(JSON.stringify({ status: 0, code: `CRASH:${e.message}` })); });
