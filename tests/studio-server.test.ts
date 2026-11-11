import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Studio server lifecycle', () => {
  let root = '';
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (root) {
      execFileSync('bash', [path.join(root, 'scripts/studio-server.sh'), 'stop']);
      if (child && child.exitCode === null && child.signalCode === null) {
        await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 3000))]);
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), 'studio-server-'));
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'bin'));
    await copyFile('scripts/studio-server.sh', path.join(root, 'scripts/studio-server.sh'));
    // Substitute only npm: exercise the real shell/process-group lifecycle with a small HTTP server.
    const npm = path.join(root, 'bin/npm');
    await writeFile(npm, `#!/usr/bin/env node
const fs = require('node:fs');
const server = require('node:http').createServer((req, res) => res.end('Studio'));
server.listen(0, '127.0.0.1', () => fs.writeFileSync('ready.json', JSON.stringify({ port: server.address().port, pid: process.pid })));
`);
    await chmod(npm, 0o755);
    return { ...process.env, PATH: `${path.join(root, 'bin')}:${process.env.PATH}` };
  }

  it('stops the recorded server group and closes its listening port', async () => {
    const env = await setup();
    child = spawn('bash', [path.join(root, 'scripts/studio-server.sh'), 'start'], { env, stdio: 'ignore' });
    let port = 0;
    await vi.waitFor(async () => {
      port = JSON.parse(await readFile(path.join(root, 'ready.json'), 'utf8')).port;
      expect((await fetch(`http://127.0.0.1:${port}`)).status).toBe(200);
    });
    const exited = once(child, 'exit');
    execFileSync('bash', [path.join(root, 'scripts/studio-server.sh'), 'stop']);
    await exited;
    await expect(fetch(`http://127.0.0.1:${port}`)).rejects.toThrow();
    await expect(readFile(path.join(root, '.cache/studio/server.pid'))).rejects.toThrow();
  });

  it('cancels startup when Exit is chosen before the server has started', async () => {
    const env = await setup();
    // Delay setsid to reproduce clicking Exit while WSL is still launching.
    const setsid = path.join(root, 'bin/setsid');
    await writeFile(setsid, '#!/bin/sh\nsleep 0.2\nexec /usr/bin/setsid "$@"\n');
    await chmod(setsid, 0o755);
    child = spawn('bash', [path.join(root, 'scripts/studio-server.sh'), 'start'], { env, stdio: 'ignore' });
    const exited = once(child, 'exit');
    execFileSync('bash', [path.join(root, 'scripts/studio-server.sh'), 'stop']);
    await exited;
    await expect(readFile(path.join(root, 'ready.json'))).rejects.toThrow();
  });
});
