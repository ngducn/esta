import { join } from 'node:path';

export function devCaDir(env: Readonly<Record<string, string | undefined>>, home: string): string {
  if (env.ESTA_DEV_CA_DIR) return env.ESTA_DEV_CA_DIR;
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), 'esta', 'dev-ca');
}

export function trustInstructions({ web, caDir, fingerprint }: { web: string; caDir: string; fingerprint: string }): string {
  return [
    `Root CA: ${join(caDir, 'rootCA.pem')}`,
    `SHA-256 fingerprint: ${fingerprint}`,
    '',
    `The CA key in ${caDir} can intercept every HTTPS connection of a device that trusts this CA.`,
    'Keep it on this Mac. Never copy, share or commit it.',
    '',
    'Trust the root CA once on each device. Before you trust it, check that the device shows the same SHA-256 fingerprint:',
    `  Mac      CAROOT="${caDir}" mkcert -install  (asks for your login password)`,
    '           Keychain Access > System > the mkcert certificate > Get Info shows the fingerprint.',
    `  iPhone   In Safari open ${web}/esta-dev-ca.crt, tap through the warning and allow the download.`,
    '           Settings > General > VPN & Device Management > the mkcert profile > More Details shows the fingerprint.',
    '           Install the profile, then Settings > General > About > Certificate Trust Settings > turn on the mkcert root.',
    '  Android  In Chrome open the same address, tap through the warning and download the file.',
    '           Settings > Security & privacy > More security settings > Encryption & credentials >',
    '           Install a certificate > CA certificate, then pick esta-dev-ca.crt.',
    '           Trusted credentials > User > the mkcert certificate shows the fingerprint.',
    '',
    'Remove the CA from each device when you stop phone testing:',
    `  Mac      CAROOT="${caDir}" mkcert -uninstall`,
    '  iPhone   Settings > General > VPN & Device Management > the mkcert profile > Remove Profile.',
    '  Android  Settings > Security & privacy > More security settings > Encryption & credentials >',
    '           Trusted credentials > User > the mkcert certificate > Remove.',
  ].join('\n');
}
