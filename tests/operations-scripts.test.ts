import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runScript = (name: string, behavior: string) => {
  const path = fileURLToPath(new URL(`../${name}.ps1`, import.meta.url)).replaceAll("'", "''");
  return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
    $ErrorActionPreference = 'Stop'
    function aws { ${behavior} }
    & '${path}'
  `], { encoding: 'utf8' });
};

describe.skipIf(process.platform !== 'win32')('operational scripts without live AWS access', () => {
  for (const name of ['shutoff-aftertaxus-backend', 'turn-back-on-aftertaxus-backend']) {
    it(`${name} exits unsuccessfully when the write is denied`, () => {
      const result = runScript(name, '$global:LASTEXITCODE = 254; Write-Output "AccessDenied"');
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain('Verified:');
      expect(result.stderr).toContain('AWS rejected');
    });

    it(`${name} does not claim success when verification fails`, () => {
      const result = runScript(name, `
        if ($args -contains 'get-function-concurrency') { $global:LASTEXITCODE = 255 }
        else { $global:LASTEXITCODE = 0 }
      `);
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain('Verified:');
      expect(result.stderr).toContain('verification failed');
    });
  }

  it('confirms shutoff only after reading a zero reservation', () => {
    const result = runScript('shutoff-aftertaxus-backend', `$global:LASTEXITCODE = 0; '{"ReservedConcurrentExecutions":0}'`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified: backend reserved concurrency is zero');
  });

  it('rejects an unexpected nonzero reservation after shutoff', () => {
    const result = runScript('shutoff-aftertaxus-backend', `$global:LASTEXITCODE = 0; '{"ReservedConcurrentExecutions":3}'`);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('Verified:');
  });

  it('confirms restart when AWS omits the reservation', () => {
    for (const response of ["'{}'", "''"]) {
      const result = runScript('turn-back-on-aftertaxus-backend', `$global:LASTEXITCODE = 0; ${response}`);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Verified: reserved concurrency is removed');
    }
  });

  it('does not confirm restart when zero concurrency remains', () => {
    const result = runScript('turn-back-on-aftertaxus-backend', `$global:LASTEXITCODE = 0; '{"ReservedConcurrentExecutions":0}'`);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('Verified:');
  });
});
